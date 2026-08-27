"""ModelDispatcher-backed implementation of ``LLMService._execute``.

Selected via the ``LLM_BACKEND=model_dispatcher`` env var (default stays
``"legacy"`` — the hand-rolled httpx retry/rotation logic in ``llm.py``). This
module is a drop-in alternative for exactly that one low-level primitive:
same inputs, same ``dict`` return, same :class:`~fastapi.HTTPException`
status-code contract — so ``parse_trip_text``, ``agent_interaction``,
``enhance_trip``, and every internal helper that calls ``LLMService._execute``
are completely unaffected by which backend is active, and none of them (or
the existing tests that exercise the legacy path's internals directly) needed
to change.

The "provider groups" concept ``LLMService._resolve_credential_groups`` /
``_execute_with_retry`` implement by hand — try each saved provider in order,
rotating through every key saved for it before moving to the next provider —
maps almost exactly onto model-dispatcher's own machinery: register one
provider per group (in order, so its registry-insertion-order fallback chain
tries them in the same sequence), and pool each group's keys under that
provider's ``user_key:<family>`` tenant-metadata entry so
``CredentialResolver``/``ModelInvocationHandler`` rotate through them.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import time

from fastapi import HTTPException
from model_dispatcher import (
    CompletionRequest,
    Message,
    ModelGateway,
    ModelTier,
    ProviderRegistry,
    Role,
    TenantContext,
    TenantId,
    TenantQuota,
)
from model_dispatcher.exceptions import (
    AllProvidersExhausted,
    AuthenticationError,
    PerimeterViolation,
    QuotaExceededError,
)
from model_dispatcher.providers import (
    AnthropicProvider,
    CerebrasProvider,
    GeminiProvider,
    GroqProvider,
    MistralProvider,
    ModelProvider,
    OpenAIProvider,
    OpenRouterProvider,
)

from models import ProviderCredentials

__all__ = ["execute"]

# Same wall-clock ceiling the legacy path enforces via REQUEST_DEADLINE_SECONDS
# (llm.py) — read independently rather than imported from there, so this
# module has no import-time dependency on llm.py (llm.py lazily imports this
# module instead, to keep model-dispatcher fully optional when the toggle is
# off).
_DEFAULT_DEADLINE_SECONDS = 45.0

# Every provider AppMyTrip's legacy path supports, mapped onto its
# model-dispatcher adapter, the env var it reads for a model override, and
# the same default model the legacy path itself defaults to (see
# services/llm.py and .env.example) — kept identical so switching backends
# doesn't silently change which model actually answers.
_PROVIDER_SPECS: dict[str, tuple[str, str, type[ModelProvider]]] = {
    "gemini": ("GEMINI_MODEL", "gemini-2.5-flash", GeminiProvider),
    "openai": ("OPENAI_MODEL", "gpt-4o-mini", OpenAIProvider),
    "anthropic": ("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929", AnthropicProvider),
    "groq": ("GROQ_MODEL", GroqProvider._DEFAULT_MODEL, GroqProvider),
    "openrouter": ("OPENROUTER_MODEL", OpenRouterProvider._DEFAULT_MODEL, OpenRouterProvider),
    "cerebras": ("CEREBRAS_MODEL", CerebrasProvider._DEFAULT_MODEL, CerebrasProvider),
    "mistral": ("MISTRAL_MODEL", MistralProvider._DEFAULT_MODEL, MistralProvider),
}

# A generous, effectively-unlimited quota: AppMyTrip already has its own
# separate request-rate limiting (services/rate_limit.py) — model-dispatcher's
# own per-tenant token accounting is not meant to double up as a second one
# here, just to stay out of the way.
_UNLIMITED_QUOTA = TenantQuota(
    requests_per_min=10_000, tokens_per_min=10_000_000, tokens_per_day=100_000_000
)

_JSON_FENCE = re.compile(r"^```(?:json)?\s*|\s*```\s*$", re.MULTILINE)


def _deadline_seconds() -> float:
    raw = os.environ.get("LLM_REQUEST_DEADLINE_SECONDS")
    if not raw:
        return _DEFAULT_DEADLINE_SECONDS
    try:
        return float(raw)
    except ValueError:
        return _DEFAULT_DEADLINE_SECONDS


def _extract_json(text: str) -> dict:
    """Strip an optional ```json fence before parsing.

    Mirrors the defensive parsing the legacy Anthropic path already does
    (Anthropic has no JSON-mode response_format) — applied uniformly here so
    every provider gets the same tolerance for an accidental markdown fence.
    """
    cleaned = _JSON_FENCE.sub("", text).strip()
    return json.loads(cleaned)


def _resolve_key_list(legacy_key: str | None, keys: list[str] | None) -> list[str]:
    """Same merge/de-dup semantics as ``LLMService._resolve_key_list``, minus
    the ``[None]`` sentinel — an empty list here just means "no explicit key
    for this provider", handled by the caller."""
    merged: list[str] = []
    for key in [*(keys or []), *([legacy_key] if legacy_key else [])]:
        cleaned = (key or "").strip()
        if cleaned and cleaned not in merged:
            merged.append(cleaned)
    return merged


def _build_provider(name: str) -> ModelProvider:
    try:
        env_var, default_model, provider_cls = _PROVIDER_SPECS[name]
    except KeyError:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown LLM provider '{name}'. Valid options: {', '.join(_PROVIDER_SPECS)}",
        ) from None
    model = os.environ.get(env_var) or default_model
    # api_key=None here (never a hardcoded server key) — a provider with no
    # pooled user key falls back to its own SDK's standard *_API_KEY env-var
    # lookup, matching the legacy path's "no key supplied -> server env var"
    # behaviour. See the is_zero_setup comment in execute() below.
    return provider_cls(model=model, tier=ModelTier.CHEAP)


def _collect_provider_groups(
    credentials: list[ProviderCredentials] | None,
    api_key: str | None,
    api_keys: list[str] | None,
    provider: str | None,
) -> dict[str, list[str]]:
    """Ordered {provider_name: [keys]} — insertion order is try-order.

    Unlike ``LLMService._resolve_credential_groups`` (which can produce two
    separate groups for the same provider name if it's named both in
    ``credentials`` and the legacy fields), this merges by provider name: all
    keys ever mentioned for a given provider end up pooled under one registry
    entry, tried in the order they were first seen. Behaviourally equivalent
    for the realistic case (the frontend doesn't send the same provider
    twice with different keys) and simpler to reason about here.
    """
    groups: dict[str, list[str]] = {}

    def add(prov: str | None, raw_keys: list[str] | None, legacy_key: str | None = None) -> None:
        name = (prov or os.environ.get("LLM_PROVIDER", "gemini")).strip().lower()
        bucket = groups.setdefault(name, [])
        for key in _resolve_key_list(legacy_key, raw_keys):
            if key not in bucket:
                bucket.append(key)

    if credentials:
        for cred in credentials:
            add(cred.provider, cred.api_keys)
    add(provider, api_keys, api_key)

    return groups


def _deadline_exceeded_error() -> HTTPException:
    return HTTPException(
        status_code=504,
        detail="The AI took too long to respond. This can happen on a long trip or "
        "a slow provider — try again, split your request into smaller steps, or "
        "switch provider in settings.",
    )


async def _run_one_group(
    name: str,
    keys: list[str],
    system_prompt: str,
    user_content: str,
    max_tokens: int,
    timeout: float,
) -> dict:
    """Dispatch through a single provider, rotating its pooled keys on
    failure via model-dispatcher's own CredentialResolver/
    ModelInvocationHandler. Raises HTTPException on any failure — including
    once every pooled key for *this* provider is exhausted — so the caller
    can decide whether to move on to the next group.
    """
    registry = ProviderRegistry()
    registry.register(_build_provider(name))
    tenant = TenantContext(
        tenant_id=TenantId("appmytrip"),
        quota=_UNLIMITED_QUOTA,
        # Always True: this only ever affects the *last-resort* branch of
        # CredentialResolver, reached solely when this provider has no pooled
        # user_key metadata at all — exactly the "fall back to the provider's
        # own server-env-var key" case, which is what we want. When pooled
        # keys *are* present they're resolved first regardless of this flag,
        # so it never overrides an explicit caller-supplied key.
        is_zero_setup=True,
        metadata={f"user_key:{name}": ",".join(keys)} if keys else {},
    )
    request = CompletionRequest(
        messages=(
            Message(role=Role.SYSTEM, content=system_prompt),
            Message(role=Role.USER, content=user_content),
        ),
        tenant=tenant.tenant_id,
        max_tokens=max_tokens,
    )

    gateway = ModelGateway.create(registry)
    try:
        result = await asyncio.wait_for(gateway.adispatch(request, tenant), timeout=timeout)
    except TimeoutError as exc:
        raise _deadline_exceeded_error() from exc
    except AuthenticationError as exc:
        raise HTTPException(
            status_code=401,
            detail=f"The saved key(s) for '{name}' didn't work: {exc}",
        ) from exc
    except QuotaExceededError as exc:
        raise HTTPException(
            status_code=exc.http_status,
            detail=f"'{name}' is rate-limited right now.",
        ) from exc
    except AllProvidersExhausted as exc:
        raise HTTPException(status_code=502, detail=f"'{name}' failed: {exc}") from exc
    except PerimeterViolation as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc

    text = result.final_message.content or ""
    if not text:
        raise HTTPException(status_code=502, detail="Empty response from LLM")
    try:
        return _extract_json(text)
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(status_code=502, detail=f"LLM API failed after retries: {exc}") from exc


async def execute(
    system_prompt: str,
    user_content: str,
    credentials: list[ProviderCredentials] | None,
    api_key: str | None,
    api_keys: list[str] | None,
    provider: str | None,
    max_tokens: int,
) -> dict:
    """The model-dispatcher-backed equivalent of ``LLMService._execute``.

    Tries each provider group in turn (see ``_collect_provider_groups``),
    only moving on once every key pooled *for that provider* is exhausted —
    same two-level "provider group, then key within it" structure as the
    legacy path's ``_execute``/``_execute_with_retry``, and the same reason:
    model-dispatcher's own fallback chain deliberately does *not* treat an
    exhausted credential as cause to try a *different provider* (a bad/
    exhausted key is surfaced immediately by design, elsewhere in this
    library) — so that layer is handled here instead, one single-provider
    ``ModelGateway`` dispatch per group.

    Raises:
        HTTPException: Same status-code conventions as the legacy path —
            401 once every saved key/provider fails auth, 429 once every
            key is rate-limited, 502 for other exhaustion or a malformed/
            non-JSON reply, 504 once ``LLM_REQUEST_DEADLINE_SECONDS``
            elapses.
    """
    groups = _collect_provider_groups(credentials, api_key, api_keys, provider)
    deadline = time.monotonic() + _deadline_seconds()
    errors: list[HTTPException] = []

    for name, keys in groups.items():
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            errors.append(_deadline_exceeded_error())
            break
        try:
            return await _run_one_group(
                name, keys, system_prompt, user_content, max_tokens, remaining
            )
        except HTTPException as exc:
            errors.append(exc)
            continue

    # Reuse the legacy path's own "pick the most useful error to surface"
    # logic (429s -> the friendly all-rate-limited message; 401/403s -> a
    # generic bad-keys message; otherwise the first concrete failure) rather
    # than duplicating it — it's pure and backend-agnostic.
    from services.llm import LLMService

    raise LLMService._summarize_failures(errors)
