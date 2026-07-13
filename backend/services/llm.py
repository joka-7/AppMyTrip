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

from models import AgentResponse, EnhanceOptions, TripData


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
            # Each agent turn echoes back the *entire* itinerary (not a diff), which can
            # run long for multi-day trips with many activities — too low a cap here
            # truncates the JSON mid-day, silently dropping the rest of the trip. Gemini
            # 2.5 models also spend part of this same budget on internal "thinking" before
            # writing the answer, so too low a cap can leave nothing for the actual JSON
            # and come back completely empty rather than merely truncated.
            "generationConfig": {
                "responseMimeType": "application/json",
                "maxOutputTokens": 16384,
            },
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
            # Each agent turn echoes back the *entire* itinerary (not a diff), which can
            # run long for multi-day trips with many activities — left unset, some
            # providers/models default to a much smaller completion budget than their
            # context window allows, silently truncating the JSON mid-day.
            "max_tokens": 16384,
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
            "max_tokens": 16384,
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


_VALID_ACTIVITY_TYPES = {"attraction", "food", "lodging", "transport"}


def _coerce_invalid_activity_types(trip_json: object) -> None:
    """LLMs occasionally emit a plausible but off-schema 'type' value (e.g.
    'sightseeing' instead of 'attraction'). Rather than discarding an entire
    otherwise-good response over one enum mismatch, coerce it to a safe
    default in place before validation."""
    if not isinstance(trip_json, dict):
        return
    for day in trip_json.get("days") or []:
        if not isinstance(day, dict):
            continue
        for act in day.get("activities") or []:
            if isinstance(act, dict) and act.get("type") not in _VALID_ACTIVITY_TYPES:
                act["type"] = "attraction"


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
                            detail="The LLM provider is rate-limiting this API key. Wait a bit "
                            "before trying again, or add your own API key in settings — the "
                            "shared default key is more likely to hit shared rate limits.",
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
            "Generate realistic latitude ('lat') and longitude ('lng') for 'map_coordinates' for each activity. "
            "Leave 'price', 'url', 'hasPodcast', 'podcast_brief', 'directions_car' and "
            "'directions_transit' null/false for now — those are filled in later by an optional, "
            "opt-in enhancement step, so don't spend effort estimating them here. "
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
        _coerce_invalid_activity_types(json_data)

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
            "'directions_car', 'directions_transit', and 'podcast_brief'. "
            f"The itinerary's 'language' field (ISO 639-1 code, currently '{current_trip.language}') "
            "indicates which language to reply in — write 'agent_reply' in that same language. If the "
            "user's message is clearly written in a different dominant language (most of its words/verbs "
            "are in another language), switch to that language instead and update 'updated_trip.language' "
            "to match; otherwise keep 'updated_trip.language' unchanged. "
            f"{preferences_fragment}"
            "Always include realistic 'map_coordinates' for new locations, but leave 'price', 'url', "
            "'hasPodcast', 'podcast_brief', 'directions_car' and 'directions_transit' null/false on "
            "newly added activities — those are filled in later by an optional, opt-in enhancement "
            "step, so don't spend effort estimating them here. "
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
        if isinstance(json_data, dict):
            _coerce_invalid_activity_types(json_data.get("updated_trip"))

        try:
            return AgentResponse(**json_data)
        except ValidationError as e:
            # The model occasionally returns a well-formed updated_trip but forgets the
            # accompanying agent_reply text — a formatting slip, not a failed edit. Don't
            # discard a successful itinerary update over a missing chat message: fall back
            # to a short reply in the trip's own language instead of erroring out.
            if (
                isinstance(json_data, dict)
                and isinstance(json_data.get("updated_trip"), dict)
                and not json_data.get("agent_reply")
            ):
                try:
                    updated_trip = TripData(**json_data["updated_trip"])
                except ValidationError:
                    raise HTTPException(
                        status_code=422, detail=f"LLM returned invalid schema: {str(e)}"
                    ) from e
                fallback_reply = "בוצע!" if updated_trip.language == "he" else "Done!"
                return AgentResponse(updated_trip=updated_trip, agent_reply=fallback_reply)
            raise HTTPException(
                status_code=422, detail=f"LLM returned invalid schema: {str(e)}"
            ) from e

    # Maps each opt-in flag to the instruction for its own focused LLM call,
    # plus the Activity field(s) that call is allowed to change. Firing one
    # small call per checked option (run concurrently) instead of one combined
    # call keeps each request fast even when every box is checked, and lets a
    # truncated/malformed result from one option be merged in without
    # corrupting the others.
    _ENHANCE_OPTION_SPECS: list[tuple[str, str, tuple[str, ...]]] = [
        (
            "directions_car",
            "For each activity (except the first of its day), fill 'directions_car' with "
            "short driving directions/notes from the previous activity. Leave every other "
            "field exactly as given.",
            ("directions_car",),
        ),
        (
            "directions_transit",
            "For each activity (except the first of its day), fill 'directions_transit' with "
            "short public-transit directions/notes from the previous activity. Leave every "
            "other field exactly as given.",
            ("directions_transit",),
        ),
        (
            "prices",
            "Fill 'price' with the typical cost of each activity (entry ticket, average meal "
            "cost, nightly rate, etc.) in the trip's local currency, when you can reasonably "
            "estimate it. Leave every other field exactly as given.",
            ("price",),
        ),
        (
            "podcast",
            "For historical/cultural sites, set 'hasPodcast' to true and write a short "
            "'podcast_brief' (2-4 sentences of real historical/cultural context about the "
            "site, beyond what 'desc' already says). Leave every other field exactly as given.",
            ("hasPodcast", "podcast_brief"),
        ),
        (
            "links",
            "Fill 'url' with each activity's real official website or listing page, if you "
            "know one. Leave every other field exactly as given.",
            ("url",),
        ),
    ]

    @classmethod
    async def _enhance_one(
        cls,
        current_trip: TripData,
        instruction: str,
        api_key: str | None,
        provider: str | None,
    ) -> TripData:
        system_prompt = (
            "You are an expert travel planner AI enriching an existing trip itinerary with one "
            "extra detail the user explicitly opted into. The 'Current Itinerary' is the full "
            "source of truth — copy every day and activity through to 'updated_trip' UNCHANGED, "
            "including id, time, title, desc, type and any already-set fields; only fill in the "
            "specific new field(s) requested below. " + instruction
        )
        schema = TripData.model_json_schema()
        user_content = (
            f"Current Itinerary: {current_trip.model_dump_json()}\n\n"
            f"Output strict JSON matching this schema: {json.dumps(schema)}"
        )
        json_data = await cls._execute_with_retry(
            system_prompt, user_content, api_key=api_key, provider=provider
        )
        _coerce_invalid_activity_types(json_data)
        try:
            return TripData(**json_data)
        except ValidationError as e:
            raise HTTPException(
                status_code=422, detail=f"LLM returned invalid schema: {str(e)}"
            ) from e

    _MISSING_COORDINATES_INSTRUCTION = (
        "Some activities have 'map_coordinates' set to null (e.g. ones added manually "
        "by the user without a real location). Fill in 'map_coordinates' with realistic "
        "latitude ('lat') and longitude ('lng') for those activities based on their title "
        "and description. Leave every other field, and any activity that already has "
        "'map_coordinates' set, exactly as given."
    )

    @classmethod
    async def enhance_trip(
        cls,
        current_trip: TripData,
        options: EnhanceOptions,
        api_key: str | None = None,
        provider: str | None = None,
    ) -> TripData:
        """Fills in the optional extras the user opted into in Step 2 (directions, prices,
        podcast briefs, links), plus — always, regardless of `options` — real map
        coordinates for any activity that's missing them (e.g. added manually via the
        live preview's "+" button, which has no way to look up a real location itself).
        Each piece fires its own small, focused LLM call (run concurrently) instead of one
        combined call, so picking every option stays about as fast as picking one."""
        selected = [
            (fields, instruction)
            for flag_name, instruction, fields in cls._ENHANCE_OPTION_SPECS
            if getattr(options, flag_name)
        ]
        needs_coordinates = any(
            act.map_coordinates is None for day in current_trip.days for act in day.activities
        )
        if needs_coordinates:
            selected = [*selected, (("map_coordinates",), cls._MISSING_COORDINATES_INSTRUCTION)]
        if not selected:
            return current_trip

        # return_exceptions=True: each piece is an independent LLM call, so one
        # rate-limited or malformed response (more likely now that checking every
        # box fires several calls at once) must not sink the others — apply
        # whichever pieces succeeded and only raise if every single one failed.
        results = await asyncio.gather(
            *(
                cls._enhance_one(current_trip, instruction, api_key, provider)
                for _fields, instruction in selected
            ),
            return_exceptions=True,
        )

        merged = current_trip.model_copy(deep=True)
        activities_by_id = {act.id: act for day in merged.days for act in day.activities}
        first_error: BaseException | None = None
        any_succeeded = False
        for (fields, _instruction), result in zip(selected, results, strict=True):
            if isinstance(result, BaseException):
                if first_error is None:
                    first_error = result
                continue
            any_succeeded = True
            for day in result.days:
                for act in day.activities:
                    target = activities_by_id.get(act.id)
                    if target is None:
                        continue
                    for field in fields:
                        setattr(target, field, getattr(act, field))

        if not any_succeeded and first_error is not None:
            raise first_error
        return merged
