"""Tests for the opt-in LLM_BACKEND=model_dispatcher path.

The legacy httpx-based backend (default) and everything that calls
LLMService._execute (parse_trip_text, agent_interaction, enhance_trip, and
their internal helpers) are covered by test_trip_api.py and are untouched by
this module. These tests cover only: (1) that _execute actually delegates to
services.llm_model_dispatcher when the toggle is on and leaves the legacy
path alone when it's off, and (2) services.llm_model_dispatcher's own
behavior end-to-end, driven by model_dispatcher's own keyless MockProvider so
nothing here needs real network or a real API key.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import pytest

# model-dispatcher is an opt-in extra (requirements-model-dispatcher.txt),
# installed editable from the vendor/model-dispatcher git submodule — not
# present after a plain `pip install -r requirements-dev.txt`. Skip this
# whole module rather than failing collection for anyone who hasn't set that
# up (matches model-dispatcher's own convention for its optional vendor SDKs).
pytest.importorskip("model_dispatcher")

from fastapi import HTTPException  # noqa: E402
from model_dispatcher.providers import MockProvider  # noqa: E402
from model_dispatcher.types import ErrorClass, ModelTier  # noqa: E402

import services.llm_model_dispatcher as md_backend  # noqa: E402
from models import ProviderCredentials  # noqa: E402
from services.llm import LLMService  # noqa: E402

# ---------------------------------------------------------------------------
# LLMService._execute backend selection
# ---------------------------------------------------------------------------


def test_execute_delegates_to_model_dispatcher_backend_when_selected(monkeypatch):
    monkeypatch.setenv("LLM_BACKEND", "model_dispatcher")
    stub = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(md_backend, "execute", stub)

    result = asyncio.run(LLMService._execute("sys", "user", max_tokens=123))

    assert result == {"ok": True}
    stub.assert_awaited_once_with("sys", "user", None, None, None, None, 123)


def test_execute_defaults_to_the_legacy_backend(monkeypatch):
    monkeypatch.delenv("LLM_BACKEND", raising=False)
    stub = AsyncMock(side_effect=AssertionError("model_dispatcher backend must not run"))
    monkeypatch.setattr(md_backend, "execute", stub)

    async def fake_retry(system_prompt, user_content, **kwargs):
        return {"legacy": True}

    monkeypatch.setattr(LLMService, "_execute_with_retry", staticmethod(fake_retry))

    result = asyncio.run(LLMService._execute("sys", "user"))

    assert result == {"legacy": True}
    stub.assert_not_awaited()


def test_execute_backend_param_overrides_the_env_var_toward_model_dispatcher(monkeypatch):
    # Server default is legacy, but this one call explicitly asks for
    # model_dispatcher — the per-request override should win.
    monkeypatch.setenv("LLM_BACKEND", "legacy")
    stub = AsyncMock(return_value={"ok": True})
    monkeypatch.setattr(md_backend, "execute", stub)

    result = asyncio.run(LLMService._execute("sys", "user", backend="model_dispatcher"))

    assert result == {"ok": True}
    stub.assert_awaited_once()


def test_execute_backend_param_overrides_the_env_var_toward_legacy(monkeypatch):
    # Server default is model_dispatcher, but this one call explicitly asks
    # for legacy — the per-request override should win the other way too.
    monkeypatch.setenv("LLM_BACKEND", "model_dispatcher")
    stub = AsyncMock(side_effect=AssertionError("model_dispatcher backend must not run"))
    monkeypatch.setattr(md_backend, "execute", stub)

    async def fake_retry(system_prompt, user_content, **kwargs):
        return {"legacy": True}

    monkeypatch.setattr(LLMService, "_execute_with_retry", staticmethod(fake_retry))

    result = asyncio.run(LLMService._execute("sys", "user", backend="legacy"))

    assert result == {"legacy": True}
    stub.assert_not_awaited()


# ---------------------------------------------------------------------------
# services.llm_model_dispatcher.execute — driven by MockProvider, no network
# ---------------------------------------------------------------------------


def _mock_provider(**kwargs) -> MockProvider:
    return MockProvider("mock:test", tier=ModelTier.CHEAP, **kwargs)


def test_returns_parsed_json_from_the_final_message(monkeypatch):
    provider = _mock_provider(reply='{"title": "Rome trip"}')
    monkeypatch.setattr(md_backend, "_build_provider", lambda name: provider)

    result = asyncio.run(md_backend.execute("sys", "user", None, "a-key", None, "mock", 100))

    assert result == {"title": "Rome trip"}


def test_strips_a_markdown_json_fence_before_parsing(monkeypatch):
    provider = _mock_provider(reply='```json\n{"ok": true}\n```')
    monkeypatch.setattr(md_backend, "_build_provider", lambda name: provider)

    result = asyncio.run(md_backend.execute("sys", "user", None, "a-key", None, "mock", 100))

    assert result == {"ok": True}


def test_pooled_api_keys_rotate_through_the_same_provider(monkeypatch):
    provider = _mock_provider(
        fail_times=1, fail_with=ErrorClass.RATE_LIMIT, reply='{"via": "key2"}'
    )
    monkeypatch.setattr(md_backend, "_build_provider", lambda name: provider)

    result = asyncio.run(
        md_backend.execute("sys", "user", None, None, ["key-one", "key-two"], "mock", 100)
    )

    assert result == {"via": "key2"}
    assert provider.received_api_keys == ["key-one", "key-two"]


def test_credential_groups_are_tried_in_order(monkeypatch):
    """Two provider groups (gemini then groq); gemini's only key is bad, so
    the request should fall through to groq's key and succeed there."""
    gemini = MockProvider(
        "gemini:mock", tier=ModelTier.CHEAP, fail_times=99, fail_with=ErrorClass.AUTH
    )
    groq = MockProvider("groq:mock", tier=ModelTier.CHEAP, reply='{"via": "groq"}')
    built: dict[str, MockProvider] = {"gemini": gemini, "groq": groq}
    monkeypatch.setattr(md_backend, "_build_provider", lambda name: built[name])

    credentials = [
        ProviderCredentials(provider="gemini", api_keys=["g1"]),
        ProviderCredentials(provider="groq", api_keys=["q1"]),
    ]
    result = asyncio.run(md_backend.execute("sys", "user", credentials, None, None, None, 100))

    assert result == {"via": "groq"}
    assert gemini.received_api_keys == ["g1"]
    assert groq.received_api_keys == ["q1"]


def test_raises_401_once_every_saved_key_fails_auth(monkeypatch):
    provider = _mock_provider(fail_times=99, fail_with=ErrorClass.AUTH)
    monkeypatch.setattr(md_backend, "_build_provider", lambda name: provider)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(md_backend.execute("sys", "user", None, "bad-key", None, "mock", 100))

    assert excinfo.value.status_code == 401


def test_raises_504_when_the_deadline_elapses(monkeypatch):
    monkeypatch.setenv("LLM_REQUEST_DEADLINE_SECONDS", "0.01")

    class SlowProvider(MockProvider):
        async def acomplete(self, request, *, api_key=None):
            await asyncio.sleep(0.2)
            return await super().acomplete(request, api_key=api_key)

    provider = SlowProvider("mock:slow", tier=ModelTier.CHEAP, reply="{}")
    monkeypatch.setattr(md_backend, "_build_provider", lambda name: provider)

    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(md_backend.execute("sys", "user", None, "a-key", None, "mock", 100))

    assert excinfo.value.status_code == 504


def test_falls_back_to_the_provider_env_var_when_no_key_is_supplied(monkeypatch):
    """No credentials at all -> registered with api_key=None, so the
    provider's own SDK reads its standard env var (unchanged from the legacy
    path's behaviour). MockProvider doesn't care either way, but the
    registration itself must not raise (a zero-setup tenant with no pooled
    key must resolve, not hit AuthenticationError)."""
    provider = _mock_provider(reply="{}")
    monkeypatch.setattr(md_backend, "_build_provider", lambda name: provider)

    result = asyncio.run(md_backend.execute("sys", "user", None, None, None, "mock", 100))

    assert result == {}
    assert provider.received_api_keys == [None]


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def test_collect_provider_groups_merges_by_provider_name_preserving_order():
    credentials = [
        ProviderCredentials(provider="Gemini", api_keys=["g1"]),
        ProviderCredentials(provider="groq", api_keys=["q1"]),
    ]
    groups = md_backend._collect_provider_groups(
        credentials, api_key="g2", api_keys=None, provider="gemini"
    )
    assert list(groups.items()) == [
        ("gemini", ["g1", "g2"]),
        ("groq", ["q1"]),
    ]


def test_extract_json_handles_bare_and_fenced_json():
    assert md_backend._extract_json('{"a": 1}') == {"a": 1}
    assert md_backend._extract_json('```json\n{"a": 1}\n```') == {"a": 1}
    assert md_backend._extract_json('```\n{"a": 1}\n```') == {"a": 1}
