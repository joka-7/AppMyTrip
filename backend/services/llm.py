"""Communication with the external LLM provider, with exponential-backoff retries.

Each request can pick its own provider (gemini / openai / anthropic / groq)
and supply its own API key, so each user pays for/rate-limits their own
usage instead of sharing the server operator's key. The LLM_PROVIDER env
var and the GEMINI_API_KEY/OPENAI_API_KEY/ANTHROPIC_API_KEY/GROQ_API_KEY env
vars are only a fallback, useful for local development when no per-request
provider/key is supplied:
- gemini    — Google Gemini (GEMINI_API_KEY), free tier — default
- openai    — OpenAI GPT models (OPENAI_API_KEY)
- anthropic — Anthropic Claude models (ANTHROPIC_API_KEY)
- groq      — Groq's free, OpenAI-compatible API (GROQ_API_KEY) — see
  https://console.groq.com/keys
"""

import asyncio
import json
import os
from typing import Protocol

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from models import AgentResponse, TripData


class LLMProvider(Protocol):
    async def complete_json(self, system_prompt: str, user_content: str) -> dict:
        """Sends a system + user prompt and returns the parsed JSON response."""
        ...


class GeminiProvider:
    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self.model = os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"

    async def complete_json(self, system_prompt: str, user_content: str) -> dict:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_content}]}],
            "generationConfig": {"responseMimeType": "application/json"},
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=30.0)
            response.raise_for_status()
            result = response.json()

        text_content = (
            result.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [{}])[0]
            .get("text", "")
        )
        if not text_content:
            raise ValueError("Empty response from LLM")
        return json.loads(text_content)


class _OpenAICompatibleProvider:
    """Base for providers that speak the OpenAI chat-completions JSON-mode API."""

    url: str

    def __init__(
        self, api_key: str | None, env_key_var: str, model_env_var: str, default_model: str
    ) -> None:
        self.api_key = api_key or os.environ.get(env_key_var, "")
        self.model = os.environ.get(model_env_var, default_model)

    async def complete_json(self, system_prompt: str, user_content: str) -> dict:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "response_format": {"type": "json_object"},
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient() as client:
            response = await client.post(self.url, json=payload, headers=headers, timeout=30.0)
            response.raise_for_status()
            result = response.json()

        text_content = result.get("choices", [{}])[0].get("message", {}).get("content", "")
        if not text_content:
            raise ValueError("Empty response from LLM")
        return json.loads(text_content)


class GroqProvider(_OpenAICompatibleProvider):
    """Groq's free, OpenAI-compatible chat completions API."""

    def __init__(self, api_key: str | None = None) -> None:
        super().__init__(api_key, "GROQ_API_KEY", "GROQ_MODEL", "openai/gpt-oss-120b")
        self.url = "https://api.groq.com/openai/v1/chat/completions"


class OpenAIProvider(_OpenAICompatibleProvider):
    """OpenAI's chat completions API (GPT models)."""

    def __init__(self, api_key: str | None = None) -> None:
        super().__init__(api_key, "OPENAI_API_KEY", "OPENAI_MODEL", "gpt-4o-mini")
        self.url = "https://api.openai.com/v1/chat/completions"


class AnthropicProvider:
    """Anthropic's Messages API (Claude models).

    The Messages API has no JSON-mode response_format, so the prompt
    explicitly asks for bare JSON and any accidental markdown code fence is
    stripped before parsing.
    """

    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.environ.get("ANTHROPIC_API_KEY", "")
        self.model = os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
        self.url = "https://api.anthropic.com/v1/messages"

    async def complete_json(self, system_prompt: str, user_content: str) -> dict:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": self.model,
            # Each agent turn echoes back the *entire* itinerary (not a diff), which can
            # run long for multi-day trips with many activities — too low a cap here
            # truncates the JSON mid-day, silently dropping the rest of the trip.
            "max_tokens": 8192,
            "system": f"{system_prompt}\nRespond with ONLY valid JSON — no markdown fences, no commentary.",
            "messages": [{"role": "user", "content": user_content}],
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(self.url, json=payload, headers=headers, timeout=30.0)
            response.raise_for_status()
            result = response.json()

        text_content = result.get("content", [{}])[0].get("text", "").strip()
        if not text_content:
            raise ValueError("Empty response from LLM")
        if text_content.startswith("```"):
            text_content = text_content.strip("`")
            if text_content.startswith("json"):
                text_content = text_content[4:]
            text_content = text_content.strip()
        return json.loads(text_content)


_PROVIDERS: dict[str, type] = {
    "gemini": GeminiProvider,
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "groq": GroqProvider,
}


class LLMService:
    """Handles all communication with the configured LLM provider; retries with backoff."""

    @staticmethod
    def _get_provider(api_key: str | None = None, provider: str | None = None) -> LLMProvider:
        name = (provider or os.environ.get("LLM_PROVIDER", "gemini")).strip().lower()
        try:
            provider_cls = _PROVIDERS[name]
        except KeyError:
            raise RuntimeError(
                f"Unknown LLM provider '{name}'. Valid options: {', '.join(_PROVIDERS)}"
            ) from None
        instance = provider_cls(api_key)
        if not instance.api_key:
            raise HTTPException(
                status_code=401,
                detail="No LLM API key configured. Add your own API key in the app's "
                "settings (or set GEMINI_API_KEY/OPENAI_API_KEY/ANTHROPIC_API_KEY/GROQ_API_KEY "
                "on the server).",
            )
        return instance

    @classmethod
    async def _execute_with_retry(
        cls,
        system_prompt: str,
        user_content: str,
        api_key: str | None = None,
        provider: str | None = None,
        max_retries: int = 5,
    ) -> dict:
        llm_provider = cls._get_provider(api_key, provider)
        delays = [1, 2, 4, 8, 16]

        for attempt in range(max_retries):
            try:
                return await llm_provider.complete_json(system_prompt, user_content)
            except httpx.HTTPStatusError as e:
                if e.response.status_code == 429:
                    if attempt == max_retries - 1:
                        raise HTTPException(
                            status_code=429,
                            detail="The LLM provider is rate-limiting this API key. "
                            "Wait a bit before trying again, or use a different model/key.",
                        ) from e
                    retry_after = e.response.headers.get("retry-after")
                    delay = float(retry_after) if retry_after else delays[attempt]
                    await asyncio.sleep(delay)
                    continue
                if attempt == max_retries - 1:
                    raise HTTPException(
                        status_code=502, detail=f"LLM API failed after retries: {str(e)}"
                    ) from e
                await asyncio.sleep(delays[attempt])
            except (httpx.HTTPError, ValueError, json.JSONDecodeError) as e:
                if attempt == max_retries - 1:
                    raise HTTPException(
                        status_code=502, detail=f"LLM API failed after retries: {str(e)}"
                    ) from e
                await asyncio.sleep(delays[attempt])
        return {}

    @classmethod
    async def parse_trip_text(
        cls,
        raw_text: str,
        preferences: str | None = None,
        api_key: str | None = None,
        provider: str | None = None,
    ) -> TripData:
        """Calls the LLM to parse raw text into a structured TripData object.

        `preferences` is the requesting user's dietary/other free-text preference
        (set via PUT /api/me/preferences). Anonymous requests pass None — no
        dietary assumption is injected into the prompt. `api_key`/`provider` are
        the caller's own LLM provider choice + key, falling back to the server's
        env vars if omitted.
        """
        preferences_fragment = f"IMPORTANT: {preferences} " if preferences else ""
        system_prompt = (
            "You are an expert travel planner AI. Your task is to parse the user's free text "
            "into a structured JSON trip schedule. "
            f"{preferences_fragment}"
            "If the user mentions a dietary preference for restaurants, flag 'is_kosher' accordingly. "
            "Also, if a location is a historical site, set 'hasPodcast' to true and write a short "
            "'podcast_brief' (2-4 sentences of real historical/cultural context about that site, beyond "
            "what 'desc' already says) — this is narrated aloud to the traveler when they visit. "
            "Generate realistic latitude ('lat') and longitude ('lng') for 'map_coordinates' for each activity. "
            "When you can reasonably estimate it, fill 'price' with the typical cost of the activity (entry "
            "ticket, average meal cost, nightly rate, etc.) in the trip's local currency, and fill 'url' with "
            "the activity's real official website or listing page if you know one; otherwise leave them null. "
            "Detect the dominant language of the user's free text (e.g. if most of the words/verbs are "
            "Hebrew, the dominant language is Hebrew) and set the 'language' field to its ISO 639-1 code "
            "('he' for Hebrew, 'en' for English, etc.). Write the title, activity titles/descriptions, and "
            "all other generated text in that same detected language."
        )

        schema = TripData.model_json_schema()
        user_content = (
            f"User Request: {raw_text}\n\nOutput strict JSON matching this schema: "
            f"{json.dumps(schema)}"
        )

        json_data = await cls._execute_with_retry(
            system_prompt, user_content, api_key=api_key, provider=provider
        )

        try:
            return TripData(**json_data)
        except ValidationError as e:
            raise HTTPException(
                status_code=422, detail=f"LLM returned invalid schema: {str(e)}"
            ) from e

    @classmethod
    async def agent_interaction(
        cls,
        current_trip: TripData,
        user_message: str,
        preferences: str | None = None,
        api_key: str | None = None,
        provider: str | None = None,
    ) -> AgentResponse:
        """Calls the LLM to update the trip based on user chat and return a conversational reply."""
        preferences_fragment = f"IMPORTANT: {preferences} " if preferences else ""
        system_prompt = (
            "You are a helpful travel assistant AI. The user is reviewing their current trip itinerary. "
            "Your task is to listen to the user's request, update the JSON itinerary accordingly, "
            "and provide a friendly conversational response. "
            "The 'Current Itinerary' below is the full source of truth, including activities the user "
            "added manually that may be missing fields like 'map_coordinates' or 'hasPodcast' — copy "
            "every day and activity through to 'updated_trip' UNCHANGED unless the user's request "
            "specifically asks you to add, remove, or modify it. Never drop an activity just because it "
            "looks incomplete; preserve its id and other fields as-is, including 'price', 'url', "
            "'photo_url', and 'podcast_brief'. "
            f"The itinerary's 'language' field (ISO 639-1 code, currently '{current_trip.language}') "
            "indicates which language to reply in — write 'agent_reply' in that same language. If the "
            "user's message is clearly written in a different dominant language (most of its words/verbs "
            "are in another language), switch to that language instead and update 'updated_trip.language' "
            "to match; otherwise keep 'updated_trip.language' unchanged. "
            f"{preferences_fragment}"
            "Always include realistic 'map_coordinates' for new locations. "
            "When the request changes the number of days or the overall structure of the trip "
            "(e.g. adding/removing a day, or moving an activity to a different day), reassign each "
            "affected activity's 'dayNum' and reorder the 'days' array so it stays consistent — for "
            "example, an end-of-trip activity like a flight home or hotel checkout must always end up "
            "on the actual last day, not stranded on the day it was originally on."
        )

        schema = AgentResponse.model_json_schema()
        user_content = (
            f"Current Itinerary: {current_trip.model_dump_json()}\nUser Message: {user_message}\n\n"
            f"Update the itinerary and reply. Output strict JSON matching this schema: "
            f"{json.dumps(schema)}"
        )

        json_data = await cls._execute_with_retry(
            system_prompt, user_content, api_key=api_key, provider=provider
        )

        try:
            return AgentResponse(**json_data)
        except ValidationError as e:
            raise HTTPException(
                status_code=422, detail=f"LLM returned invalid schema: {str(e)}"
            ) from e
