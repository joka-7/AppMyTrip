"""Tests for the TripWeaver AI backend.

All external LLM calls are mocked so the suite runs offline with no API key.
The backend holds no per-user state: persistence/sharing lives in Firestore on
the frontend, so there's no DB/auth to test here.
"""

import asyncio
import os
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

import services.tts as tts_module
from models import Activity, AgentResponse, TripData, TripDay
from routers.builder import TripBuilder
from services.llm import GeminiProvider, GroqProvider, LLMService
from services.tts import MockTTSProvider, PiperTTSProvider, TTSService
from trip_api_backend import app

client = TestClient(app)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _sample_trip() -> TripData:
    """Builds a small valid trip used across tests."""
    return TripData(
        title="Trip to Rome",
        dates="Thu - Sun",
        days=[
            TripDay(
                dayNum=1,
                activities=[
                    Activity(
                        id="a1",
                        time="10:00",
                        title="Spanish Steps",
                        desc="A historic landmark.",
                        type="attraction",
                        hasPodcast=True,
                        map_coordinates={"lat": 41.9059, "lng": 12.4827},
                    )
                ],
            )
        ],
    )


def _trip_with_food() -> TripData:
    trip = _sample_trip()
    trip.days[0].activities.append(
        Activity(
            id="f1",
            time="13:00",
            title="Kosher Lunch",
            desc="BaGhetto.",
            type="food",
            is_kosher=True,
            map_coordinates={"lat": 41.8925, "lng": 12.4772},
        )
    )
    return trip


# ---------------------------------------------------------------------------
# Model validation
# ---------------------------------------------------------------------------


def test_activity_defaults():
    act = Activity(id="x", time="09:00", title="t", desc="d", type="attraction")
    assert act.hasPodcast is False
    assert act.podcast_url is None
    assert act.map_coordinates is None


def test_tripdata_roundtrip():
    trip = _sample_trip()
    dumped = trip.model_dump()
    assert dumped["title"] == "Trip to Rome"
    assert dumped["days"][0]["activities"][0]["type"] == "attraction"
    # rebuild from dump
    assert TripData(**dumped).title == trip.title


def test_invalid_activity_type_rejected():
    with pytest.raises(ValidationError):
        Activity(id="x", time="09:00", title="t", desc="d", type="spaceship")


# ---------------------------------------------------------------------------
# Pure builder logic (no network)
# ---------------------------------------------------------------------------


def test_analyze_missing_requirements_flags_missing_food():
    builder = TripBuilder().load_existing_trip(_sample_trip()).set_preferences("Kosher")
    msg = builder.analyze_missing_requirements()
    assert msg is not None  # Hebrew prompt about missing kosher restaurants


def test_analyze_missing_requirements_ok_when_food_present():
    builder = TripBuilder().load_existing_trip(_trip_with_food()).set_preferences("Kosher")
    assert builder.analyze_missing_requirements() is None


def test_analyze_missing_requirements_anonymous_gets_no_nudge():
    # No preferences set (anonymous request) -> no dietary assumption at all.
    builder = TripBuilder().load_existing_trip(_sample_trip())
    assert builder.analyze_missing_requirements() is None


def test_analyze_missing_requirements_raises_without_trip():
    with pytest.raises(ValueError):
        TripBuilder().analyze_missing_requirements()


def test_get_trip_raises_when_empty():
    with pytest.raises(ValueError):
        TripBuilder().get_trip()


# ---------------------------------------------------------------------------
# TTS mock service (no network)
# ---------------------------------------------------------------------------


def test_tts_generates_url():
    url = asyncio.run(TTSService.generate_podcast_for_activity("Spanish Steps", "history"))
    assert url.startswith("https://cdn.tripweaver.ai/podcasts/")
    assert "spanish_steps" in url


def test_generate_media_fills_podcast_urls():
    builder = TripBuilder().load_existing_trip(_sample_trip())
    asyncio.run(builder.generate_media())
    act = builder.get_trip().days[0].activities[0]
    assert act.hasPodcast is True
    assert act.podcast_url is not None


def test_tts_provider_defaults_to_mock(monkeypatch):
    monkeypatch.delenv("TTS_PROVIDER", raising=False)
    provider = TTSService._get_provider()
    assert isinstance(provider, MockTTSProvider)


def test_tts_provider_explicit_mock(monkeypatch):
    monkeypatch.setenv("TTS_PROVIDER", "mock")
    provider = TTSService._get_provider()
    assert isinstance(provider, MockTTSProvider)


def test_tts_provider_unknown_raises_config_error(monkeypatch):
    monkeypatch.setenv("TTS_PROVIDER", "elevenlabs")
    with pytest.raises(RuntimeError, match="Unknown TTS_PROVIDER"):
        TTSService._get_provider()


def test_piper_provider_requires_voice_model(monkeypatch):
    monkeypatch.delenv("PIPER_VOICE_MODEL", raising=False)
    with pytest.raises(RuntimeError, match="PIPER_VOICE_MODEL"):
        PiperTTSProvider()


@pytest.mark.skipif(
    not os.environ.get("PIPER_VOICE_MODEL"),
    reason="requires a downloaded Piper voice model (PIPER_VOICE_MODEL); skipped by default in CI",
)
def test_piper_provider_synthesizes_real_audio(tmp_path, monkeypatch):
    monkeypatch.setattr(tts_module, "PODCASTS_DIR", tmp_path)
    provider = PiperTTSProvider()
    url = asyncio.run(provider.synthesize("Hello from Piper", "test_clip"))
    assert url == "/static/podcasts/test_clip.wav"
    assert (tmp_path / "test_clip.wav").exists()


def test_llm_provider_defaults_to_gemini(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    assert isinstance(LLMService._get_provider(), GeminiProvider)


def test_llm_provider_explicit_groq(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    assert isinstance(LLMService._get_provider(), GroqProvider)


def test_llm_provider_unknown_raises_config_error(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "claude")
    with pytest.raises(RuntimeError, match="Unknown LLM_PROVIDER"):
        LLMService._get_provider()


def test_execute_with_retry_raises_429_after_exhausting_retries(monkeypatch):
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(429, request=request, headers={"retry-after": "0"})
    error = httpx.HTTPStatusError("rate limited", request=request, response=response)

    class RateLimitedProvider:
        async def complete_json(self, system_prompt, user_content):
            raise error

    monkeypatch.setattr(LLMService, "_get_provider", staticmethod(lambda: RateLimitedProvider()))

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(LLMService._execute_with_retry("sys", "user", max_retries=2))
    assert exc_info.value.status_code == 429


# ---------------------------------------------------------------------------
# Endpoints (LLM mocked)
# ---------------------------------------------------------------------------


def test_parse_endpoint(monkeypatch):
    monkeypatch.setattr(
        LLMService,
        "parse_trip_text",
        AsyncMock(return_value=_sample_trip()),
    )
    resp = client.post("/api/trip/parse", json={"raw_text": "Rome for 3 days"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["trip_data"]["title"] == "Trip to Rome"
    # no preferences supplied -> no dietary assumption, so no proactive nudge
    assert body["initial_agent_message"] is None


def test_agent_endpoint(monkeypatch):
    updated = _trip_with_food()
    monkeypatch.setattr(
        LLMService,
        "agent_interaction",
        AsyncMock(return_value=AgentResponse(updated_trip=updated, agent_reply="הוספתי מסעדה")),
    )
    resp = client.post(
        "/api/trip/agent",
        json={"trip_data": _sample_trip().model_dump(), "user_message": "add kosher food"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_reply"] == "הוספתי מסעדה"
    types = [a["type"] for d in body["trip_data"]["days"] for a in d["activities"]]
    assert "food" in types


def test_cors_headers_present():
    # A cross-origin POST should be echoed an Access-Control-Allow-Origin header.
    resp = client.post(
        "/api/trip/generate-media",
        json={"trip_data": _sample_trip().model_dump(), "user_message": ""},
        headers={"Origin": "http://localhost:5173"},
    )
    assert resp.status_code == 200
    assert "access-control-allow-origin" in {k.lower() for k in resp.headers}


def test_generate_media_endpoint():
    resp = client.post(
        "/api/trip/generate-media",
        json={"trip_data": _sample_trip().model_dump(), "user_message": ""},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "Media generated successfully"
    act = body["trip_data"]["days"][0]["activities"][0]
    assert act["podcast_url"] is not None


# ---------------------------------------------------------------------------
# Client-supplied preferences wired into the LLM prompt
# ---------------------------------------------------------------------------


def test_parse_endpoint_passes_through_supplied_preferences(monkeypatch):
    captured = {}

    async def fake_parse(raw_text, preferences=None):
        captured["preferences"] = preferences
        return _sample_trip()

    monkeypatch.setattr(LLMService, "parse_trip_text", fake_parse)

    resp = client.post("/api/trip/parse", json={"raw_text": "Rome", "preferences": "Vegan"})
    assert resp.status_code == 200
    assert captured["preferences"] == "Vegan"


def test_parse_endpoint_no_preferences_supplied(monkeypatch):
    captured = {}

    async def fake_parse(raw_text, preferences=None):
        captured["preferences"] = preferences
        return _sample_trip()

    monkeypatch.setattr(LLMService, "parse_trip_text", fake_parse)

    resp = client.post("/api/trip/parse", json={"raw_text": "Rome"})
    assert resp.status_code == 200
    assert captured["preferences"] is None
