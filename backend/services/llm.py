"""Communication with the external LLM provider, with exponential-backoff retries.

Each request can pick its own provider and supply its own API key(s), so each
user pays for/rate-limits their own usage instead of sharing the server
operator's key. Several keys can be sent per provider and are rotated through
whenever one fails — rate-limited, erroring, or timing out — so a single bad
key doesn't stall the request on its own retry-with-backoff schedule while
other keys sit untried. The per-provider env vars are only a fallback for
local development when no per-request key is supplied:
- gemini     — Google Gemini (GEMINI_API_KEY), free tier — default
- openai     — OpenAI GPT models (OPENAI_API_KEY)
- anthropic  — Anthropic Claude models (ANTHROPIC_API_KEY)
- groq       — Groq's free, OpenAI-compatible API (GROQ_API_KEY)
- openrouter — OpenRouter (OPENROUTER_API_KEY), free models available
- cerebras   — Cerebras (CEREBRAS_API_KEY), free + very fast
- mistral    — Mistral La Plateforme (MISTRAL_API_KEY), free tier
"""

import asyncio
import json
import logging
import os
import re
from typing import Protocol

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from models import (
    AgentDayIntent,
    AgentResponse,
    AgentScopedResponse,
    EnhanceOptions,
    ProviderCredentials,
    TripData,
)

# INFO-level so which provider/key was actually tried (and why it failed) shows
# up in the server's logs (e.g. Vercel's function logs) without extra setup —
# there's otherwise no way to tell from the outside which of several saved
# provider/key combinations a request actually used.
logger = logging.getLogger("llm")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)
logger.setLevel(logging.INFO)


def _mask_key(key: str | None) -> str:
    """Shortens a key to a log-safe, still-recognizable form — never the full secret."""
    if not key:
        return "(server env key)"
    return "****" if len(key) <= 8 else f"{key[:4]}…{key[-4:]}"


# Completion-budget tiers passed as `max_tokens` to LLMService._execute — sized to
# what each kind of call actually needs to return, not the largest possible case.
# Requesting far more than needed isn't just wasteful: some providers (Groq
# notably) cap how large a completion budget a *request* is even allowed to ask
# for on a given model, separate from how big the prompt itself is, and will
# reject an otherwise-tiny request outright for asking too much. Gemini's
# "thinking" models also spend part of this budget internally before writing the
# answer, so these still leave real headroom rather than being cut to the bone.
MAX_TOKENS_CLASSIFY = 1024  # tiny {action, day_numbers} JSON
MAX_TOKENS_SCOPED_EDIT = 8192  # one or a few days' worth of activities
MAX_TOKENS_FULL_TRIP = 16384  # a whole-trip echo-back can be large


def _describe_http_status_error(e: httpx.HTTPStatusError) -> str:
    """A short, user-facing summary of a provider's HTTP failure — which host said
    what — without httpx's verbose `str(e)`, which appends an MDN boilerplate link
    that's noise once this reaches an end user rather than a developer's terminal."""
    host = e.request.url.host
    reason = e.response.reason_phrase or ""
    return (
        f"{host} rejected the request ({e.response.status_code}{f' {reason}' if reason else ''})."
    )


class LLMProvider(Protocol):
    async def complete_json(
        self, system_prompt: str, user_content: str, max_tokens: int = 16384
    ) -> dict:
        """Sends a system + user prompt and returns the parsed JSON response.
        `max_tokens` should reflect how much output the caller actually expects —
        see the MAX_TOKENS_* constants below. Some providers (Groq notably) cap how
        large a completion budget a request is even *allowed* to ask for, separate
        from the prompt's own size — always requesting the largest budget regardless
        of the caller's real needs can get an otherwise-tiny request rejected."""
        ...


class GeminiProvider:
    def __init__(self, api_key: str | None = None) -> None:
        self.api_key = api_key or os.environ.get("GEMINI_API_KEY", "")
        self.model = os.environ.get("GEMINI_MODEL") or "gemini-2.5-flash"

    async def complete_json(
        self, system_prompt: str, user_content: str, max_tokens: int = 16384
    ) -> dict:
        url = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{self.model}:generateContent?key={self.api_key}"
        )
        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [{"parts": [{"text": user_content}]}],
            # A full-trip echo can run long for multi-day trips with many
            # activities — too low a cap here truncates the JSON mid-day, silently
            # dropping the rest of the trip. Gemini 2.5 models also spend part of
            # this same budget on internal "thinking" before writing the answer,
            # so too low a cap can leave nothing for the actual JSON and come back
            # completely empty rather than merely truncated.
            "generationConfig": {
                "responseMimeType": "application/json",
                "maxOutputTokens": max_tokens,
            },
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json=payload, timeout=60.0)
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

    async def complete_json(
        self, system_prompt: str, user_content: str, max_tokens: int = 16384
    ) -> dict:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "response_format": {"type": "json_object"},
            # A full-trip echo can run long for multi-day trips with many
            # activities — left unset, some providers/models default to a much
            # smaller completion budget than their context window allows, silently
            # truncating the JSON mid-day. But some providers (Groq) also *cap* how
            # large a value here is even allowed to be for a given model and can
            # reject the whole request over it — hence this being a parameter
            # rather than always requesting the largest budget "just in case".
            "max_tokens": max_tokens,
        }
        headers = {"Authorization": f"Bearer {self.api_key}"}
        async with httpx.AsyncClient() as client:
            response = await client.post(self.url, json=payload, headers=headers, timeout=60.0)
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


class OpenRouterProvider(_OpenAICompatibleProvider):
    """OpenRouter — one key, many models incl. several free ones. OpenAI-compatible.
    Get a key at https://openrouter.ai/keys. Override the model via OPENROUTER_MODEL
    (default is a free model; free models come and go, so pick your own if needed)."""

    def __init__(self, api_key: str | None = None) -> None:
        super().__init__(
            api_key,
            "OPENROUTER_API_KEY",
            "OPENROUTER_MODEL",
            "deepseek/deepseek-chat-v3-0324:free",
        )
        self.url = "https://openrouter.ai/api/v1/chat/completions"


class CerebrasProvider(_OpenAICompatibleProvider):
    """Cerebras — free, very fast inference. OpenAI-compatible.
    Get a key at https://cloud.cerebras.ai."""

    def __init__(self, api_key: str | None = None) -> None:
        super().__init__(api_key, "CEREBRAS_API_KEY", "CEREBRAS_MODEL", "llama-3.3-70b")
        self.url = "https://api.cerebras.ai/v1/chat/completions"


class MistralProvider(_OpenAICompatibleProvider):
    """Mistral La Plateforme — has a free tier. OpenAI-compatible.
    Get a key at https://console.mistral.ai/api-keys."""

    def __init__(self, api_key: str | None = None) -> None:
        super().__init__(api_key, "MISTRAL_API_KEY", "MISTRAL_MODEL", "mistral-small-latest")
        self.url = "https://api.mistral.ai/v1/chat/completions"


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

    async def complete_json(
        self, system_prompt: str, user_content: str, max_tokens: int = 16384
    ) -> dict:
        headers = {
            "x-api-key": self.api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        payload = {
            "model": self.model,
            # A full-trip echo can run long for multi-day trips with many
            # activities — too low a cap here truncates the JSON mid-day, silently
            # dropping the rest of the trip.
            "max_tokens": max_tokens,
            "system": f"{system_prompt}\nRespond with ONLY valid JSON — no markdown fences, no commentary.",
            "messages": [{"role": "user", "content": user_content}],
        }
        async with httpx.AsyncClient() as client:
            response = await client.post(self.url, json=payload, headers=headers, timeout=60.0)
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


def _coerce_invalid_activity_types_in_days(days_json: object) -> None:
    """LLMs occasionally emit a plausible but off-schema 'type' value (e.g.
    'sightseeing' instead of 'attraction'). Rather than discarding an entire
    otherwise-good response over one enum mismatch, coerce it to a safe
    default in place before validation. Operates on a bare list of day dicts
    (as returned by a day-scoped agent call); see _coerce_invalid_activity_types
    for the whole-trip-dict variant."""
    if not isinstance(days_json, list):
        return
    for day in days_json:
        if not isinstance(day, dict):
            continue
        for act in day.get("activities") or []:
            if isinstance(act, dict) and act.get("type") not in _VALID_ACTIVITY_TYPES:
                act["type"] = "attraction"


def _coerce_invalid_activity_types(trip_json: object) -> None:
    if not isinstance(trip_json, dict):
        return
    _coerce_invalid_activity_types_in_days(trip_json.get("days"))


# Best-effort, multi-language extraction of an explicit day-number mention in a
# chat message (e.g. "day 8", "יום 8", "ליום 8", "jour 8"). Used by
# LLMService._resolve_edit_intent as a free, local first guess at whether a
# message only concerns specific day(s) — deliberately conservative, since an
# empty/ambiguous result just falls back to an LLM classification call rather
# than ever being trusted blindly.
_DAY_NUMBER_PATTERN = re.compile(
    r"(?:\bday\b|\b[לבה]?יום\b|\bjour\b)[\s:#()-]*(?:number|no\.?|מספר)?[\s:#()-]*(\d+)",
    re.IGNORECASE,
)


def _detect_day_numbers(user_message: str) -> list[int]:
    """De-duplicated, sorted list of day numbers explicitly mentioned in the
    message; empty if none found (callers should treat that as 'not confident',
    not as 'no days are relevant')."""
    return sorted({int(n) for n in _DAY_NUMBER_PATTERN.findall(user_message)})


# Catches "add a/another day"-style requests that don't name a specific day
# number at all (e.g. "add another day", "הוסיפו עוד יום", "ajoutez un jour") —
# the common case _DAY_NUMBER_PATTERN can't help with since there's no digit to
# find. Deliberately requires "day"/"יום"/"jour" as a bare word close after the
# add-verb: \bיום\b doesn't match inside "ליום"/"היום" (no word boundary before
# a Hebrew prefix letter), so "add X to the day" (an edit-target reference, ל)
# and "add X today" (היום) correctly don't match; the explicit negative
# lookbehinds additionally rule out "(to) every/each day"/"לכל/בכל יום", which
# read as a bare word but mean "every existing day", not "a new day".
_ADD_DAY_PATTERN = re.compile(
    r"\b(?:add|הוסיפ\w*|תוסיפ\w*|הוסף|תוסיף|נוסיף|ajout\w*)\b"
    r"(?:\s+\S+){0,3}?\s+"
    r"(?<!כל )(?<!לכל )(?<!בכל )(?<!every )(?<!each )"
    r"\b(?:days?|ימים|יום|jours?)\b",
    re.IGNORECASE,
)


def _mentions_adding_a_day(user_message: str) -> bool:
    """True for an 'add a day' request with no specific day number — see
    _ADD_DAY_PATTERN. Only meaningful when _detect_day_numbers found nothing;
    a numbered mention is handled first and takes priority."""
    return bool(_ADD_DAY_PATTERN.search(user_message))


_PROVIDERS: dict[str, type] = {
    "gemini": GeminiProvider,
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "groq": GroqProvider,
    "openrouter": OpenRouterProvider,
    "cerebras": CerebrasProvider,
    "mistral": MistralProvider,
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

    @staticmethod
    def _resolve_key_list(api_key: str | None, api_keys: list[str] | None) -> list[str | None]:
        """Merge the legacy single `api_key` and the newer `api_keys` list into one
        ordered, de-duplicated list of keys to try. Returns ``[None]`` when no keys
        are supplied, so the provider falls back to the server's env var."""
        merged: list[str] = []
        for key in [*(api_keys or []), *([api_key] if api_key else [])]:
            cleaned = (key or "").strip()
            if cleaned and cleaned not in merged:
                merged.append(cleaned)
        return list(merged) if merged else [None]

    @classmethod
    async def _execute_with_retry(
        cls,
        system_prompt: str,
        user_content: str,
        api_keys: list[str | None] | None = None,
        provider: str | None = None,
        max_retries: int = 3,
        max_tokens: int = 16384,
    ) -> dict:
        # Try each supplied key in turn. Whatever the failure — 429, a 5xx, a
        # timeout, a malformed response — a key that isn't the last one gets
        # rotated past immediately rather than burning the full retry-with-
        # backoff budget on it; a fresh key beats waiting on one that just
        # failed. Only once we're down to the last key/option left do we pay
        # the full exponential-backoff schedule before finally giving up, so
        # a transient hiccup on an early key can't stall the request for
        # minutes while later keys sit untried.
        keys = api_keys if api_keys else [None]
        delays = [1, 2, 4, 8, 16]
        last_rate_limit: httpx.HTTPStatusError | None = None

        for key_index, key in enumerate(keys):
            llm_provider = cls._get_provider(key, provider)
            is_last_key = key_index == len(keys) - 1
            key_label = f"{provider or 'default'}/{_mask_key(key)}"

            for attempt in range(max_retries):
                logger.info("llm attempt: %s (try %d/%d)", key_label, attempt + 1, max_retries)
                try:
                    result = await llm_provider.complete_json(
                        system_prompt, user_content, max_tokens=max_tokens
                    )
                    logger.info("llm attempt: %s succeeded", key_label)
                    return result
                except httpx.HTTPStatusError as e:
                    if e.response.status_code == 429:
                        logger.info("llm attempt: %s rate-limited (429)", key_label)
                        last_rate_limit = e
                        if not is_last_key:
                            break  # rotate to the next key immediately
                        if attempt == max_retries - 1:
                            raise cls._all_keys_rate_limited(e) from e
                        retry_after = e.response.headers.get("retry-after")
                        delay = float(retry_after) if retry_after else delays[attempt]
                        await asyncio.sleep(delay)
                        continue
                    logger.info(
                        "llm attempt: %s failed with HTTP %d: %s",
                        key_label,
                        e.response.status_code,
                        e,
                    )
                    if not is_last_key:
                        break  # rotate to the next key immediately
                    # A non-429 4xx (e.g. a 404 from a misconfigured/deprecated model, a
                    # 400 from a malformed request, or a 413 payload-too-large) is the
                    # server rejecting this exact request — retrying the identical
                    # request can never change that outcome, so fail immediately instead
                    # of burning the whole retry budget (and the seconds that come with
                    # it) on a request that can't succeed. Only 5xx (a transient
                    # server-side issue) still retries. The upstream status is preserved
                    # rather than flattened to a generic 502 so the caller can tell them
                    # apart (e.g. the frontend has a specific, actionable message for
                    # 413 — "split this into smaller requests" — that a blanket "provider
                    # down" would otherwise hide).
                    if 400 <= e.response.status_code < 500:
                        raise HTTPException(
                            status_code=e.response.status_code,
                            detail=_describe_http_status_error(e),
                        ) from e
                    if attempt == max_retries - 1:
                        raise HTTPException(
                            status_code=502, detail=_describe_http_status_error(e)
                        ) from e
                    await asyncio.sleep(delays[attempt])
                except (httpx.HTTPError, ValueError, json.JSONDecodeError) as e:
                    logger.info("llm attempt: %s failed: %s", key_label, e)
                    if not is_last_key:
                        break  # rotate to the next key immediately
                    if attempt == max_retries - 1:
                        raise HTTPException(
                            status_code=502, detail=f"LLM API failed after retries: {str(e)}"
                        ) from e
                    await asyncio.sleep(delays[attempt])

        # Reached only when every key broke out on a 429 without succeeding.
        if last_rate_limit is not None:
            raise cls._all_keys_rate_limited(last_rate_limit) from last_rate_limit
        return {}

    @staticmethod
    def _all_keys_rate_limited(source: Exception) -> HTTPException:
        return HTTPException(
            status_code=429,
            detail="All of your API keys are rate-limited right now. Add another key in "
            "settings, wait a bit before trying again, or switch provider.",
        )

    @classmethod
    def _resolve_credential_groups(
        cls,
        credentials: list[ProviderCredentials] | None,
        api_key: str | None,
        api_keys: list[str] | None,
        provider: str | None,
    ) -> list[tuple[str | None, list[str | None]]]:
        """Ordered list of (provider, keys) groups to try, in turn. Prefers the
        multi-provider `credentials` list; otherwise builds a single group from the
        legacy api_key/api_keys/provider fields. De-duplicates (provider, key) pairs
        across groups so the same key isn't tried twice."""
        groups: list[tuple[str | None, list[str | None]]] = []
        seen: set[tuple[str | None, str | None]] = set()

        def add(
            prov: str | None, raw_keys: list[str] | None, legacy_key: str | None = None
        ) -> None:
            prov_norm = (prov or "").strip().lower() or None
            keys: list[str | None] = []
            for k in cls._resolve_key_list(legacy_key, raw_keys):
                if k is None:
                    continue
                if (prov_norm, k) not in seen:
                    seen.add((prov_norm, k))
                    keys.append(k)
            if keys:
                groups.append((prov_norm, keys))

        if credentials:
            for cred in credentials:
                add(cred.provider, cred.api_keys)
        add(provider, api_keys, api_key)

        if groups:
            return groups
        # No keys supplied anywhere → a single group that falls back to the env var.
        return [((provider or "").strip().lower() or None, [None])]

    @classmethod
    async def _execute(
        cls,
        system_prompt: str,
        user_content: str,
        credentials: list[ProviderCredentials] | None = None,
        api_key: str | None = None,
        api_keys: list[str] | None = None,
        provider: str | None = None,
        max_retries: int = 3,
        max_tokens: int = 16384,
    ) -> dict:
        """Run the prompt against every saved provider/key in order, falling through
        to the next provider when one fails, and only raising once all have failed —
        so a single exhausted or invalid key/provider doesn't surface an error.
        `max_tokens` should reflect the caller's actual expected output size — see
        the MAX_TOKENS_* constants; passing the full-trip-sized default for a small
        scoped call risks a provider (Groq notably) rejecting the request outright
        for asking too large a completion budget, regardless of prompt size."""
        groups = cls._resolve_credential_groups(credentials, api_key, api_keys, provider)
        logger.info(
            "llm request: trying %d provider group(s): %s",
            len(groups),
            ", ".join(f"{prov or 'default'} ({len(keys)} key(s))" for prov, keys in groups),
        )
        errors: list[HTTPException] = []
        for prov, keys in groups:
            try:
                result = await cls._execute_with_retry(
                    system_prompt,
                    user_content,
                    api_keys=keys,
                    provider=prov,
                    max_retries=max_retries,
                    max_tokens=max_tokens,
                )
                logger.info("llm request: succeeded via provider group '%s'", prov or "default")
                return result
            except HTTPException as e:
                logger.info(
                    "llm request: provider group '%s' exhausted (%d: %s)",
                    prov or "default",
                    e.status_code,
                    e.detail,
                )
                errors.append(e)
                continue
        logger.info("llm request: all %d provider group(s) failed", len(groups))
        raise cls._summarize_failures(errors)

    @staticmethod
    def _summarize_failures(errors: list[HTTPException]) -> HTTPException:
        """Pick the most useful error to surface after every provider/key failed."""
        if not errors:
            return HTTPException(status_code=502, detail="No LLM provider was reachable.")
        statuses = {e.status_code for e in errors}
        if statuses == {429}:
            return errors[0]  # already the friendly "all rate-limited" message
        if statuses <= {401, 403}:
            return HTTPException(
                status_code=401,
                detail="None of your saved API keys worked — check that they're valid and "
                "have access, or add another key/provider in settings.",
            )
        # Prefer a concrete non-rate-limit failure over a generic one.
        for e in errors:
            if e.status_code not in (429, 401, 403):
                return e
        return errors[0]

    @classmethod
    async def parse_trip_text(
        cls,
        raw_text: str,
        preferences: str | None = None,
        api_key: str | None = None,
        provider: str | None = None,
        api_keys: list[str] | None = None,
        credentials: list[ProviderCredentials] | None = None,
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

        json_data = await cls._execute(
            system_prompt,
            user_content,
            credentials=credentials,
            api_key=api_key,
            api_keys=api_keys,
            provider=provider,
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
        api_keys: list[str] | None = None,
        credentials: list[ProviderCredentials] | None = None,
    ) -> AgentResponse:
        """Calls the LLM to update the trip based on user chat and return a conversational
        reply. Re-sending/regenerating the *entire* trip on every chat turn (the
        _agent_interaction_full path below) gets slow — and risks provider/platform
        timeouts — as a trip grows, so this first tries to scope the call to only the
        day(s) the message actually needs (see _resolve_edit_intent). Falls back to the
        reliable full-trip path whenever that optimization doesn't cleanly apply, or its
        result doesn't check out — so a bad classification or a malformed scoped
        response can never corrupt the trip, only cost the time it would have taken
        anyway."""
        intent = await cls._resolve_edit_intent(
            current_trip, user_message, credentials, api_key, api_keys, provider
        )
        try:
            if intent.action == "add_days":
                return await cls._agent_add_days(
                    current_trip,
                    user_message,
                    preferences,
                    api_key,
                    provider,
                    api_keys,
                    credentials,
                )
            if intent.action == "edit_days" and intent.day_numbers:
                return await cls._agent_edit_days(
                    current_trip,
                    user_message,
                    intent.day_numbers,
                    preferences,
                    api_key,
                    provider,
                    api_keys,
                    credentials,
                )
        except (ValueError, ValidationError):
            pass  # the scoped attempt didn't check out — fall through below
        return await cls._agent_interaction_full(
            current_trip, user_message, preferences, api_key, provider, api_keys, credentials
        )

    @classmethod
    async def _resolve_edit_intent(
        cls,
        current_trip: TripData,
        user_message: str,
        credentials: list[ProviderCredentials] | None,
        api_key: str | None,
        api_keys: list[str] | None,
        provider: str | None,
    ) -> AgentDayIntent:
        """Cheaply decides how much of the trip a chat turn actually needs to touch.
        Tries two free, local heuristics first — an explicit day number mentioned in
        the message (compared against which days already exist), then an unnumbered
        "add a day" phrasing — and only falls back to a small classification LLM call
        when neither applies."""
        existing_nums = {d.dayNum for d in current_trip.days}
        mentioned = _detect_day_numbers(user_message)
        if mentioned:
            if all(n not in existing_nums for n in mentioned):
                return AgentDayIntent(action="add_days")
            if all(n in existing_nums for n in mentioned):
                return AgentDayIntent(action="edit_days", day_numbers=mentioned)
            # A mix of new and existing day numbers — genuinely ambiguous, ask the model.
        elif _mentions_adding_a_day(user_message):
            return AgentDayIntent(action="add_days")
        return await cls._classify_intent_via_llm(
            current_trip, user_message, credentials, api_key, api_keys, provider
        )

    @classmethod
    async def _classify_intent_via_llm(
        cls,
        current_trip: TripData,
        user_message: str,
        credentials: list[ProviderCredentials] | None,
        api_key: str | None,
        api_keys: list[str] | None,
        provider: str | None,
    ) -> AgentDayIntent:
        """Small/fast fallback classification when the day-number heuristic can't tell —
        sends only a one-line summary of each day (never full content), so this stays
        quick regardless of trip size. Any failure here (provider error, bad JSON,
        schema mismatch) just means 'general' — classification is a pure optimization,
        never a source of truth, so it must fail safe rather than fail loud."""
        if not current_trip.days:
            return AgentDayIntent(action="general")
        day_summaries = "\n".join(
            f"Day {d.dayNum}: " + (", ".join(a.title for a in d.activities)[:200] or "(empty)")
            for d in current_trip.days
        )
        system_prompt = (
            "You are triaging a travel-itinerary chat message so the server knows how much "
            "of the trip to send for the actual edit — you are NOT performing the edit "
            "itself. Given a one-line summary of each existing day and the user's message, "
            "decide: 'add_days' if the message only asks to add one or more brand-new "
            "day(s) and nothing existing needs to change; 'edit_days' if it asks to change, "
            "remove from, or add something to specific existing day(s) — list every day "
            "number it affects; 'general' if it's ambiguous, references the whole trip, or "
            "needs restructuring (reordering/renumbering days, changing the trip title/dates, "
            "or anything spanning many days). When unsure, choose 'general' — it's always "
            "safe, just slower."
        )
        schema = AgentDayIntent.model_json_schema()
        user_content = (
            f"Existing days:\n{day_summaries}\n\nUser message: {user_message}\n\n"
            f"Output strict JSON matching this schema: {json.dumps(schema)}"
        )
        try:
            json_data = await cls._execute(
                system_prompt,
                user_content,
                credentials=credentials,
                api_key=api_key,
                api_keys=api_keys,
                provider=provider,
                max_retries=2,
                max_tokens=MAX_TOKENS_CLASSIFY,
            )
            return AgentDayIntent(**json_data)
        except (HTTPException, ValidationError, TypeError):
            return AgentDayIntent(action="general")

    @classmethod
    async def _agent_add_days(
        cls,
        current_trip: TripData,
        user_message: str,
        preferences: str | None,
        api_key: str | None,
        provider: str | None,
        api_keys: list[str] | None,
        credentials: list[ProviderCredentials] | None,
    ) -> AgentResponse:
        """Handles a chat turn that only adds new day(s) to the end of the trip — sends
        just the trip's basic info and its last existing day (for continuity), not the
        whole itinerary, since nothing earlier needs to change or even be looked at."""
        existing_nums = {d.dayNum for d in current_trip.days}
        next_num = max(existing_nums, default=0) + 1
        last_day = current_trip.days[-1] if current_trip.days else None
        preferences_fragment = f"IMPORTANT: {preferences} " if preferences else ""
        system_prompt = (
            "You are a helpful travel assistant AI adding brand-new day(s) to the end of "
            "an existing trip itinerary. You're only shown the trip's basic info and its "
            "last existing day for continuity — every earlier day is unaffected and "
            "already fine, so don't regenerate them; only output the new day(s) in 'days'. "
            f"Number the new day(s) starting from {next_num} and increasing by 1. "
            f"The itinerary's language (ISO 639-1, currently '{current_trip.language}') "
            "indicates which language to write 'agent_reply' and the new activities in. "
            f"{preferences_fragment}"
            "Always include realistic 'map_coordinates' for new locations, but leave "
            "'price', 'url', 'hasPodcast', 'podcast_brief', 'directions_car' and "
            "'directions_transit' null/false on the new activities — those are filled in "
            "later by an optional, opt-in enhancement step."
        )
        schema = AgentScopedResponse.model_json_schema()
        context = {
            "title": current_trip.title,
            "dates": current_trip.dates,
            "existing_day_count": len(current_trip.days),
            "last_day": last_day.model_dump() if last_day else None,
        }
        user_content = (
            f"Trip context: {json.dumps(context)}\nUser Message: {user_message}\n\n"
            f"Output strict JSON matching this schema: {json.dumps(schema)}"
        )
        json_data = await cls._execute(
            system_prompt,
            user_content,
            credentials=credentials,
            api_key=api_key,
            api_keys=api_keys,
            provider=provider,
            max_tokens=MAX_TOKENS_SCOPED_EDIT,
        )
        if isinstance(json_data, dict):
            _coerce_invalid_activity_types_in_days(json_data.get("days"))
        scoped = AgentScopedResponse(**json_data)
        new_nums = {d.dayNum for d in scoped.days}
        if not new_nums or new_nums & existing_nums:
            raise ValueError("agent returned no new days, or a day-number collision")
        merged_trip = current_trip.model_copy(update={"days": [*current_trip.days, *scoped.days]})
        return AgentResponse(updated_trip=merged_trip, agent_reply=scoped.agent_reply)

    @classmethod
    async def _agent_edit_days(
        cls,
        current_trip: TripData,
        user_message: str,
        day_numbers: list[int],
        preferences: str | None,
        api_key: str | None,
        provider: str | None,
        api_keys: list[str] | None,
        credentials: list[ProviderCredentials] | None,
    ) -> AgentResponse:
        """Handles a chat turn that only touches specific existing day(s) — sends just
        those day(s), not the whole itinerary. Every other day is guaranteed unaffected,
        since it's never shown to the model in the first place."""
        target_days = [d for d in current_trip.days if d.dayNum in day_numbers]
        if not target_days:
            raise ValueError("none of the classified day numbers exist in the trip")
        preferences_fragment = f"IMPORTANT: {preferences} " if preferences else ""
        system_prompt = (
            "You are a helpful travel assistant AI editing specific day(s) of a larger "
            "trip itinerary. Only the day(s) below are shown to you — every other day "
            "already exists and is unaffected, so don't worry about them or try to "
            "reproduce them. The 'Days' below are the full source of truth for these "
            "day(s), including activities the user added manually that may be missing "
            "fields like 'map_coordinates' or 'hasPodcast' — copy each one through to the "
            "output UNCHANGED unless the user's request specifically asks you to add, "
            "remove, or modify it. Never drop an activity just because it looks "
            "incomplete; preserve its id and other fields as-is. "
            f"The itinerary's language (ISO 639-1, currently '{current_trip.language}') "
            "indicates which language to write 'agent_reply' in. "
            f"{preferences_fragment}"
            "Always include realistic 'map_coordinates' for new locations, but leave "
            "'price', 'url', 'hasPodcast', 'podcast_brief', 'directions_car' and "
            "'directions_transit' null/false on newly added activities — those are filled "
            "in later by an optional, opt-in enhancement step."
        )
        schema = AgentScopedResponse.model_json_schema()
        days_json = json.dumps([d.model_dump() for d in target_days])
        user_content = (
            f"Days: {days_json}\nUser Message: {user_message}\n\n"
            f"Output strict JSON matching this schema: {json.dumps(schema)}"
        )
        json_data = await cls._execute(
            system_prompt,
            user_content,
            credentials=credentials,
            api_key=api_key,
            api_keys=api_keys,
            provider=provider,
            max_tokens=MAX_TOKENS_SCOPED_EDIT,
        )
        if isinstance(json_data, dict):
            _coerce_invalid_activity_types_in_days(json_data.get("days"))
        scoped = AgentScopedResponse(**json_data)
        returned_nums = {d.dayNum for d in scoped.days}
        if not returned_nums or not returned_nums <= set(day_numbers):
            raise ValueError("agent returned an unexpected day number")
        by_num = {d.dayNum: d for d in scoped.days}
        merged_days = [by_num.get(d.dayNum, d) for d in current_trip.days]
        merged_trip = current_trip.model_copy(update={"days": merged_days})
        return AgentResponse(updated_trip=merged_trip, agent_reply=scoped.agent_reply)

    @classmethod
    async def _agent_interaction_full(
        cls,
        current_trip: TripData,
        user_message: str,
        preferences: str | None = None,
        api_key: str | None = None,
        provider: str | None = None,
        api_keys: list[str] | None = None,
        credentials: list[ProviderCredentials] | None = None,
    ) -> AgentResponse:
        """The original whole-trip agent turn: sends the entire itinerary and expects
        the entire itinerary back. Used directly for edits that genuinely need full
        context (reordering, renumbering, trip-wide changes), and as the safety-net
        fallback when the day-scoped path above doesn't apply or its result doesn't
        check out."""
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

        json_data = await cls._execute(
            system_prompt,
            user_content,
            credentials=credentials,
            api_key=api_key,
            api_keys=api_keys,
            provider=provider,
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
        credentials: list[ProviderCredentials] | None,
        api_key: str | None,
        api_keys: list[str] | None,
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
        json_data = await cls._execute(
            system_prompt,
            user_content,
            credentials=credentials,
            api_key=api_key,
            api_keys=api_keys,
            provider=provider,
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
        api_keys: list[str] | None = None,
        credentials: list[ProviderCredentials] | None = None,
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
                cls._enhance_one(
                    current_trip, instruction, credentials, api_key, api_keys, provider
                )
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
