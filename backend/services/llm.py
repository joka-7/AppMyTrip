"""Communication with the external LLM provider, with exponential-backoff retries.

Provider is selected via the LLM_PROVIDER env var (default "gemini"):
- gemini — Google Gemini (GEMINI_API_KEY), free tier
- groq   — Groq's OpenAI-compatible API (GROQ_API_KEY), free tier — see
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
    def __init__(self) -> None:
        api_key = os.environ.get("GEMINI_API_KEY", "")
        model = os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"
        self.url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{model}:generateContent?key={api_key}"
        )

    async def complete_json(self, system_prompt: str, user_content: str) -> dict:
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_content}]}],
            "generationConfig": {"responseMimeType": "application/json"},
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(self.url, json=payload, timeout=30.0)
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


class GroqProvider:
    """Groq's free, OpenAI-compatible chat completions API."""

    def __init__(self) -> None:
        self.api_key = os.environ.get("GROQ_API_KEY", "")
        self.model = os.environ.get("GROQ_MODEL", "llama-3.3-70b-versatile")
        self.url = "https://api.groq.com/openai/v1/chat/completions"

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


_PROVIDERS: dict[str, type] = {
    "gemini": GeminiProvider,
    "groq": GroqProvider,
}


class LLMService:
    """Handles all communication with the configured LLM provider; retries with backoff."""

    @staticmethod
    def _get_provider() -> LLMProvider:
        name = os.environ.get("LLM_PROVIDER", "gemini").strip().lower()
        try:
            provider_cls = _PROVIDERS[name]
        except KeyError:
            raise RuntimeError(
                f"Unknown LLM_PROVIDER '{name}'. Valid options: {', '.join(_PROVIDERS)}"
            ) from None
        return provider_cls()

    @classmethod
    async def _execute_with_retry(
        cls, system_prompt: str, user_content: str, max_retries: int = 5
    ) -> dict:
        provider = cls._get_provider()
        delays = [1, 2, 4, 8, 16]

        for attempt in range(max_retries):
            try:
                return await provider.complete_json(system_prompt, user_content)
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
    async def parse_trip_text(cls, raw_text: str, preferences: str | None = None) -> TripData:
        """Calls the LLM to parse raw text into a structured TripData object.

        `preferences` is the requesting user's dietary/other free-text preference
        (set via PUT /api/me/preferences). Anonymous requests pass None — no
        dietary assumption is injected into the prompt.
        """
        preferences_fragment = f"IMPORTANT: {preferences} " if preferences else ""
        system_prompt = (
            "You are an expert travel planner AI. Your task is to parse the user's free text "
            "into a structured JSON trip schedule. "
            f"{preferences_fragment}"
            "If the user mentions a dietary preference for restaurants, flag 'is_kosher' accordingly. "
            "Also, if a location is a historical site, set 'hasPodcast' to true. "
            "Generate realistic latitude ('lat') and longitude ('lng') for 'map_coordinates' for each activity."
        )

        schema = TripData.model_json_schema()
        user_content = (
            f"User Request: {raw_text}\n\nOutput strict JSON matching this schema: "
            f"{json.dumps(schema)}"
        )

        json_data = await cls._execute_with_retry(system_prompt, user_content)

        try:
            return TripData(**json_data)
        except ValidationError as e:
            raise HTTPException(
                status_code=422, detail=f"LLM returned invalid schema: {str(e)}"
            ) from e

    @classmethod
    async def agent_interaction(
        cls, current_trip: TripData, user_message: str, preferences: str | None = None
    ) -> AgentResponse:
        """Calls the LLM to update the trip based on user chat and return a conversational reply."""
        preferences_fragment = f"IMPORTANT: {preferences} " if preferences else ""
        system_prompt = (
            "You are a helpful travel assistant AI. The user is reviewing their current trip itinerary. "
            "Your task is to listen to the user's request, update the JSON itinerary accordingly, "
            "and provide a friendly conversational response IN HEBREW. "
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

        json_data = await cls._execute_with_retry(system_prompt, user_content)

        try:
            return AgentResponse(**json_data)
        except ValidationError as e:
            raise HTTPException(
                status_code=422, detail=f"LLM returned invalid schema: {str(e)}"
            ) from e
