"""Tests for the TripWeaver AI backend.

All external LLM calls are mocked so the suite runs offline with no API key.
"""

import asyncio
import os
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import services.tts as tts_module
import trip_api_backend as backend
from db import Base, get_db
from services.tts import MockTTSProvider, PiperTTSProvider
from trip_api_backend import (
    Activity,
    AgentResponse,
    TripBuilder,
    TripData,
    TripDay,
    TTSService,
    app,
)

# Isolated in-memory DB for the auth/trips tests — keeps them from touching
# the real tripweaver.db file and from leaking state across test runs.
_test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_TestSessionLocal = sessionmaker(bind=_test_engine, autoflush=False, autocommit=False)
Base.metadata.create_all(bind=_test_engine)


def _override_get_db():
    db = _TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = _override_get_db

client = TestClient(app)


def _register(email: str, password: str = "pw123456") -> str:
    resp = client.post("/api/auth/register", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json()["token"]


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


# ---------------------------------------------------------------------------
# Endpoints (LLM mocked)
# ---------------------------------------------------------------------------


def test_parse_endpoint(monkeypatch):
    monkeypatch.setattr(
        backend.LLMService,
        "parse_trip_text",
        AsyncMock(return_value=_sample_trip()),
    )
    resp = client.post("/api/trip/parse", json={"raw_text": "Rome for 3 days"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["trip_data"]["title"] == "Trip to Rome"
    # anonymous request -> no dietary assumption, so no proactive nudge
    assert body["initial_agent_message"] is None


def test_agent_endpoint(monkeypatch):
    updated = _trip_with_food()
    monkeypatch.setattr(
        backend.LLMService,
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
# Auth (register / login / logout / preferences)
# ---------------------------------------------------------------------------


def test_register_and_login():
    token = _register("alice@example.com")

    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.json() == {"email": "alice@example.com", "preferences_text": None}

    resp = client.post(
        "/api/auth/login", json={"email": "alice@example.com", "password": "pw123456"}
    )
    assert resp.status_code == 200
    assert resp.json()["email"] == "alice@example.com"


def test_register_duplicate_email_rejected():
    _register("dup@example.com")
    resp = client.post(
        "/api/auth/register", json={"email": "dup@example.com", "password": "pw123456"}
    )
    assert resp.status_code == 400


def test_login_wrong_password_rejected():
    _register("bob@example.com")
    resp = client.post(
        "/api/auth/login", json={"email": "bob@example.com", "password": "wrong-password"}
    )
    assert resp.status_code == 401


def test_me_requires_auth():
    resp = client.get("/api/me")
    assert resp.status_code == 401


def test_update_preferences():
    token = _register("carol@example.com")
    resp = client.put(
        "/api/me/preferences",
        json={"preferences_text": "Vegan"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert resp.json()["preferences_text"] == "Vegan"


def test_logout_invalidates_token():
    token = _register("dave@example.com")
    resp = client.post("/api/auth/logout", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    resp = client.get("/api/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Trips CRUD + ownership
# ---------------------------------------------------------------------------


def test_trip_crud_and_ownership():
    owner_token = _register("owner@example.com")
    other_token = _register("intruder@example.com")
    headers_owner = {"Authorization": f"Bearer {owner_token}"}
    headers_other = {"Authorization": f"Bearer {other_token}"}

    resp = client.post("/api/trips", json=_sample_trip().model_dump(), headers=headers_owner)
    assert resp.status_code == 200
    trip_id = resp.json()["id"]

    resp = client.get("/api/trips", headers=headers_owner)
    assert resp.status_code == 200
    assert any(t["id"] == trip_id for t in resp.json())

    # Another user's request for the same id is a 404, not a 403, so it
    # doesn't leak that the trip exists for someone else.
    resp = client.get(f"/api/trips/{trip_id}", headers=headers_other)
    assert resp.status_code == 404

    updated = _trip_with_food().model_dump()
    resp = client.put(f"/api/trips/{trip_id}", json=updated, headers=headers_owner)
    assert resp.status_code == 200

    resp = client.delete(f"/api/trips/{trip_id}", headers=headers_owner)
    assert resp.status_code == 200
    resp = client.get(f"/api/trips/{trip_id}", headers=headers_owner)
    assert resp.status_code == 404


def test_trips_require_auth():
    resp = client.get("/api/trips")
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Per-user preferences wired into the LLM prompt
# ---------------------------------------------------------------------------


def test_parse_endpoint_uses_authenticated_user_preferences(monkeypatch):
    token = _register("pref@example.com")
    client.put(
        "/api/me/preferences",
        json={"preferences_text": "Vegan"},
        headers={"Authorization": f"Bearer {token}"},
    )

    captured = {}

    async def fake_parse(raw_text, preferences=None):
        captured["preferences"] = preferences
        return _sample_trip()

    monkeypatch.setattr(backend.LLMService, "parse_trip_text", fake_parse)

    resp = client.post(
        "/api/trip/parse",
        json={"raw_text": "Rome"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert captured["preferences"] == "Vegan"


def test_parse_endpoint_anonymous_gets_no_preferences(monkeypatch):
    captured = {}

    async def fake_parse(raw_text, preferences=None):
        captured["preferences"] = preferences
        return _sample_trip()

    monkeypatch.setattr(backend.LLMService, "parse_trip_text", fake_parse)

    resp = client.post("/api/trip/parse", json={"raw_text": "Rome"})
    assert resp.status_code == 200
    assert captured["preferences"] is None
