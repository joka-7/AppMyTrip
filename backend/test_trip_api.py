"""Tests for the TripWeaver AI backend.

All external LLM calls are mocked so the suite runs offline with no API key.
The backend holds no per-user state: persistence/sharing lives in Firestore on
the frontend, so there's no DB/auth to test here.
"""

import asyncio
import json
import os
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

import services.tts as tts_module
from models import Activity, AgentResponse, EnhanceOptions, TripData, TripDay
from routers.builder import TripBuilder
from services.llm import AnthropicProvider, GeminiProvider, GroqProvider, LLMService, OpenAIProvider
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
            title="Trattoria Lunch",
            desc="BaGhetto.",
            type="food",
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
    assert isinstance(LLMService._get_provider(api_key="test-key"), GeminiProvider)


def test_llm_provider_explicit_groq(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("GROQ_API_KEY", "test-key")
    assert isinstance(LLMService._get_provider(), GroqProvider)


def test_llm_provider_explicit_openai(monkeypatch):
    assert isinstance(
        LLMService._get_provider(api_key="test-key", provider="openai"), OpenAIProvider
    )


def test_llm_provider_explicit_anthropic(monkeypatch):
    assert isinstance(
        LLMService._get_provider(api_key="test-key", provider="anthropic"), AnthropicProvider
    )


def test_llm_provider_param_overrides_env_var(monkeypatch):
    # Per-request provider choice takes precedence over the server's LLM_PROVIDER env var.
    monkeypatch.setenv("LLM_PROVIDER", "gemini")
    assert isinstance(LLMService._get_provider(api_key="test-key", provider="groq"), GroqProvider)


def test_llm_provider_unknown_raises_config_error(monkeypatch):
    monkeypatch.setenv("LLM_PROVIDER", "claude")
    with pytest.raises(RuntimeError, match="Unknown LLM provider"):
        LLMService._get_provider(api_key="test-key")


def test_llm_provider_requires_an_api_key(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    with pytest.raises(HTTPException) as exc_info:
        LLMService._get_provider()
    assert exc_info.value.status_code == 401


def test_execute_with_retry_raises_429_after_exhausting_retries(monkeypatch):
    request = httpx.Request("POST", "https://api.groq.com/openai/v1/chat/completions")
    response = httpx.Response(429, request=request, headers={"retry-after": "0"})
    error = httpx.HTTPStatusError("rate limited", request=request, response=response)

    class RateLimitedProvider:
        async def complete_json(self, system_prompt, user_content):
            raise error

    monkeypatch.setattr(
        LLMService,
        "_get_provider",
        staticmethod(lambda api_key=None, provider=None: RateLimitedProvider()),
    )

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
        json={"trip_data": _sample_trip().model_dump(), "user_message": "add a restaurant"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["agent_reply"] == "הוספתי מסעדה"
    types = [a["type"] for d in body["trip_data"]["days"] for a in d["activities"]]
    assert "food" in types


def _multi_day_trip(num_days: int) -> TripData:
    """A trip with one activity per day, used to exercise the truncation guard."""
    return TripData(
        title="Trip to Georgia",
        dates="9 days",
        days=[
            TripDay(
                dayNum=day,
                activities=[
                    Activity(
                        id=f"d{day}_a1",
                        time="10:00",
                        title=f"Day {day} activity",
                        desc="...",
                        type="attraction",
                        hasPodcast=False,
                        map_coordinates={"lat": 41.0, "lng": 44.0},
                    )
                ],
            )
            for day in range(1, num_days + 1)
        ],
    )


def test_agent_endpoint_rejects_legitimate_bulk_delete_request(monkeypatch):
    # The user explicitly asks to delete most of their trip (not a hallucinated
    # truncation) — today the guard can't tell the two apart and blocks this
    # with a 502, even though the AI did exactly what was asked.
    kept_only_day1 = _multi_day_trip(1)
    monkeypatch.setattr(
        LLMService,
        "agent_interaction",
        AsyncMock(return_value=AgentResponse(updated_trip=kept_only_day1, agent_reply="מחקתי")),
    )
    resp = client.post(
        "/api/trip/agent",
        json={
            "trip_data": _multi_day_trip(9).model_dump(),
            "user_message": "מחק את כל הימים חוץ מהיום הראשון",
        },
    )
    assert resp.status_code == 200


def test_agent_endpoint_rejects_response_that_drops_most_of_the_trip(monkeypatch):
    # Simulates a truncated/hallucinated LLM response that echoes back only the
    # last day of a long itinerary instead of the whole thing.
    collapsed = _multi_day_trip(1)
    collapsed.days[0].dayNum = 9
    monkeypatch.setattr(
        LLMService,
        "agent_interaction",
        AsyncMock(return_value=AgentResponse(updated_trip=collapsed, agent_reply="עדכנתי")),
    )
    resp = client.post(
        "/api/trip/agent",
        json={
            "trip_data": _multi_day_trip(9).model_dump(),
            "user_message": "add a coffee stop on day 3",
        },
    )
    assert resp.status_code == 502
    assert "incomplete" in resp.json()["detail"]


def test_agent_endpoint_allows_a_legitimate_partial_change(monkeypatch):
    # A normal edit (e.g. adding one activity) shouldn't trip the guard.
    updated = _trip_with_food()
    monkeypatch.setattr(
        LLMService,
        "agent_interaction",
        AsyncMock(return_value=AgentResponse(updated_trip=updated, agent_reply="הוספתי מסעדה")),
    )
    resp = client.post(
        "/api/trip/agent",
        json={"trip_data": _sample_trip().model_dump(), "user_message": "add a restaurant"},
    )
    assert resp.status_code == 200


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

    async def fake_parse(raw_text, preferences=None, api_key=None, provider=None):
        captured["preferences"] = preferences
        return _sample_trip()

    monkeypatch.setattr(LLMService, "parse_trip_text", fake_parse)

    resp = client.post("/api/trip/parse", json={"raw_text": "Rome", "preferences": "Vegan"})
    assert resp.status_code == 200
    assert captured["preferences"] == "Vegan"


def test_parse_endpoint_no_preferences_supplied(monkeypatch):
    captured = {}

    async def fake_parse(raw_text, preferences=None, api_key=None, provider=None):
        captured["preferences"] = preferences
        return _sample_trip()

    monkeypatch.setattr(LLMService, "parse_trip_text", fake_parse)

    resp = client.post("/api/trip/parse", json={"raw_text": "Rome"})
    assert resp.status_code == 200
    assert captured["preferences"] is None


def test_parse_endpoint_passes_through_caller_api_key(monkeypatch):
    captured = {}

    async def fake_parse(raw_text, preferences=None, api_key=None, provider=None):
        captured["api_key"] = api_key
        return _sample_trip()

    monkeypatch.setattr(LLMService, "parse_trip_text", fake_parse)

    resp = client.post("/api/trip/parse", json={"raw_text": "Rome", "api_key": "user-supplied-key"})
    assert resp.status_code == 200
    assert captured["api_key"] == "user-supplied-key"


def test_parse_endpoint_passes_through_caller_provider(monkeypatch):
    captured = {}

    async def fake_parse(raw_text, preferences=None, api_key=None, provider=None):
        captured["provider"] = provider
        return _sample_trip()

    monkeypatch.setattr(LLMService, "parse_trip_text", fake_parse)

    resp = client.post(
        "/api/trip/parse",
        json={"raw_text": "Rome", "api_key": "user-supplied-key", "provider": "anthropic"},
    )
    assert resp.status_code == 200
    assert captured["provider"] == "anthropic"


def test_parse_endpoint_requires_api_key_when_none_configured(monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    resp = client.post("/api/trip/parse", json={"raw_text": "Rome"})
    assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Realistic raw AI JSON payloads, fed through the real LLMService.agent_interaction
# validation path (not just router-level mocks) via a fake provider, to check
# our code's reaction to the kinds of responses an LLM can actually return.
# ---------------------------------------------------------------------------


class _FakeProvider:
    """Stands in for a real LLM provider, returning a canned JSON dict."""

    def __init__(self, json_data: dict) -> None:
        self._json_data = json_data

    async def complete_json(self, system_prompt: str, user_content: str) -> dict:
        return self._json_data


def _agent_interaction_with(monkeypatch, json_data: dict):
    monkeypatch.setattr(
        LLMService,
        "_get_provider",
        staticmethod(lambda api_key=None, provider=None: _FakeProvider(json_data)),
    )
    return asyncio.run(LLMService.agent_interaction(_sample_trip(), "add a coffee stop"))


def test_agent_interaction_accepts_manually_added_activity_echoed_back(monkeypatch):
    # A manually-added activity (no map_coordinates/podcast info) that the AI
    # correctly echoes back untouched, alongside one it added itself.
    manual_activity = {
        "id": "manual-1",
        "time": "16:00",
        "title": "Gelato break",
        "desc": "Self-added stop",
        "type": "food",
    }
    new_trip = _sample_trip().model_dump()
    new_trip["days"][0]["activities"].append(manual_activity)
    new_trip["days"][0]["activities"].append(
        {
            "id": "ai-1",
            "time": "17:00",
            "title": "Coffee stop",
            "desc": "Added by the AI",
            "type": "food",
            "map_coordinates": {"lat": 41.9, "lng": 12.49},
        }
    )
    result = _agent_interaction_with(
        monkeypatch, {"updated_trip": new_trip, "agent_reply": "Added a coffee stop"}
    )
    ids = {a.id for d in result.updated_trip.days for a in d.activities}
    assert {"manual-1", "ai-1", "a1"} <= ids
    # The manually-added activity's missing fields stay None, not crash/coerce.
    manual = next(a for d in result.updated_trip.days for a in d.activities if a.id == "manual-1")
    assert manual.map_coordinates is None


def test_agent_endpoint_silently_drops_a_single_unrelated_activity(monkeypatch):
    # Known gap: the truncation guard only fires when MORE THAN HALF the
    # activities vanish. A single manually-added activity dropped alongside
    # an otherwise-legitimate edit currently slips through undetected — this
    # documents that residual risk rather than asserting desired behavior.
    trip = _trip_with_food()  # 2 activities: "a1" and "f1"
    dropped_one = TripData(
        title=trip.title,
        dates=trip.dates,
        days=[TripDay(dayNum=1, activities=[trip.days[0].activities[0]])],  # only "a1" survives
    )
    monkeypatch.setattr(
        LLMService,
        "agent_interaction",
        AsyncMock(return_value=AgentResponse(updated_trip=dropped_one, agent_reply="עדכנתי")),
    )
    resp = client.post(
        "/api/trip/agent",
        json={"trip_data": trip.model_dump(), "user_message": "rename the landmark"},
    )
    assert resp.status_code == 200  # guard does NOT catch this — see comment above
    ids = {a["id"] for d in resp.json()["trip_data"]["days"] for a in d["activities"]}
    assert "f1" not in ids


def test_agent_interaction_rejects_missing_required_field(monkeypatch):
    # A malformed/truncated AI response missing a required Activity field.
    new_trip = _sample_trip().model_dump()
    new_trip["days"][0]["activities"][0].pop("title")
    with pytest.raises(HTTPException) as exc_info:
        _agent_interaction_with(monkeypatch, {"updated_trip": new_trip, "agent_reply": "עדכנתי"})
    assert exc_info.value.status_code == 422


def test_agent_interaction_tolerates_unexpected_extra_fields(monkeypatch):
    # LLMs sometimes add fields we didn't ask for (e.g. a stray "notes" key);
    # pydantic should ignore them rather than fail the whole response.
    new_trip = _sample_trip().model_dump()
    new_trip["days"][0]["activities"][0]["notes"] = "unexpected extra field"
    new_trip["weather_summary"] = "sunny"
    result = _agent_interaction_with(
        monkeypatch, {"updated_trip": new_trip, "agent_reply": "עדכנתי"}
    )
    assert result.updated_trip.days[0].activities[0].title == "Spanish Steps"


def test_agent_interaction_handles_reordered_and_renumbered_days(monkeypatch):
    # Moving an activity to a new day and renumbering days should round-trip cleanly.
    new_trip = {
        "title": "Trip to Rome",
        "dates": "Thu - Sun",
        "days": [
            {"dayNum": 1, "activities": []},
            {
                "dayNum": 2,
                "activities": [
                    {
                        "id": "a1",
                        "time": "10:00",
                        "title": "Spanish Steps",
                        "desc": "A historic landmark.",
                        "type": "attraction",
                        "hasPodcast": True,
                        "map_coordinates": {"lat": 41.9059, "lng": 12.4827},
                    }
                ],
            },
        ],
    }
    result = _agent_interaction_with(
        monkeypatch, {"updated_trip": new_trip, "agent_reply": "הזזתי את הפעילות ליום 2"}
    )
    assert result.updated_trip.days[0].activities == []
    assert result.updated_trip.days[1].activities[0].id == "a1"


def test_agent_interaction_raises_502_on_non_json_provider_response(monkeypatch):
    # Provider fails to return parseable JSON at all (a real HTTP/decode failure).
    class BrokenProvider:
        async def complete_json(self, system_prompt, user_content):
            raise json.JSONDecodeError("bad json", "doc", 0)

    monkeypatch.setattr(
        LLMService,
        "_get_provider",
        staticmethod(lambda api_key=None, provider=None: BrokenProvider()),
    )
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(LLMService._execute_with_retry("sys", "user", max_retries=1))
    assert exc_info.value.status_code == 502


# ---------------------------------------------------------------------------
# Enhance (Stage 2 opt-in extras)
# ---------------------------------------------------------------------------


def test_enhance_trip_returns_unchanged_when_no_options_selected():
    trip = _trip_with_food()
    result = asyncio.run(LLMService.enhance_trip(trip, EnhanceOptions()))
    assert result == trip


def test_enhance_trip_fires_one_concurrent_call_per_option_and_merges_only_that_field(
    monkeypatch,
):
    # Regression test: previously all checked options were folded into a single
    # combined prompt, which got slow (and could time out/fail) the more boxes
    # the user checked. Each option should now fire its own small call, and the
    # merge must only ever take the specific field(s) that call was responsible
    # for — even if a call's response carries noise in unrelated fields (e.g. a
    # truncated/hallucinated title), that noise must not leak into the result.
    trip = _trip_with_food()

    def _response_with(**field_overrides) -> dict:
        data = trip.model_dump()
        for day in data["days"]:
            for act in day["activities"]:
                act.update(field_overrides)
                act["title"] = "SHOULD NOT BE USED"
        return data

    responses = [
        _response_with(price=42),
        _response_with(hasPodcast=True, podcast_brief="Some history."),
        _response_with(url="https://example.com"),
    ]
    mock_execute = AsyncMock(side_effect=responses)
    monkeypatch.setattr(LLMService, "_execute_with_retry", mock_execute)

    options = EnhanceOptions(prices=True, podcast=True, links=True)
    result = asyncio.run(LLMService.enhance_trip(trip, options))

    assert mock_execute.await_count == 3
    original_titles = {act.id: act.title for day in trip.days for act in day.activities}
    for day in result.days:
        for act in day.activities:
            assert act.price == 42
            assert act.hasPodcast is True
            assert act.podcast_brief == "Some history."
            assert act.url == "https://example.com"
            # Fields not targeted by any selected option (or noise from another
            # option's response) must be untouched.
            assert act.title == original_titles[act.id]


def test_enhance_endpoint(monkeypatch):
    trip = _trip_with_food()
    enhanced = trip.model_copy(deep=True)
    enhanced.days[0].activities[0].price = 10
    monkeypatch.setattr(LLMService, "enhance_trip", AsyncMock(return_value=enhanced))

    resp = client.post(
        "/api/trip/enhance",
        json={"trip_data": trip.model_dump(), "options": {"prices": True}},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trip_data"]["days"][0]["activities"][0]["price"] == 10


def test_enhance_trip_applies_succeeding_options_when_another_option_fails(monkeypatch):
    # Regression test: 5 checked options now fire 5 concurrent calls instead of
    # one, which makes hitting a rate limit (or any other single-call failure)
    # more likely. One failing option must not discard the others that succeeded.
    trip = _trip_with_food()

    def _response_with(**field_overrides) -> dict:
        data = trip.model_dump()
        for day in data["days"]:
            for act in day["activities"]:
                act.update(field_overrides)
        return data

    async def _flaky_execute(system_prompt, user_content, **kwargs):
        if "price" in system_prompt:
            raise HTTPException(status_code=429, detail="rate limited")
        return _response_with(url="https://example.com")

    monkeypatch.setattr(LLMService, "_execute_with_retry", _flaky_execute)

    options = EnhanceOptions(prices=True, links=True)
    result = asyncio.run(LLMService.enhance_trip(trip, options))

    for day in result.days:
        for act in day.activities:
            assert act.url == "https://example.com"
            assert act.price is None  # the failed option left this field untouched


def test_enhance_trip_fills_missing_coordinates_even_with_no_options_selected(monkeypatch):
    # An activity added manually via the live preview's "+" button has no real
    # location yet (map_coordinates is None) — enhance_trip must always look one
    # up for it, regardless of which (if any) Step 2 options were checked.
    trip = _sample_trip()
    trip.days[0].activities.append(
        Activity(
            id="new",
            time="15:00",
            title="Manually Added Spot",
            desc="",
            type="attraction",
        )
    )
    assert trip.days[0].activities[1].map_coordinates is None

    def _response_with_coordinates(system_prompt, user_content, **kwargs):
        data = trip.model_dump()
        for day in data["days"]:
            for act in day["activities"]:
                act["map_coordinates"] = {"lat": 1.0, "lng": 2.0}
                act["title"] = "SHOULD NOT BE USED"
        return data

    mock_execute = AsyncMock(side_effect=_response_with_coordinates)
    monkeypatch.setattr(LLMService, "_execute_with_retry", mock_execute)

    result = asyncio.run(LLMService.enhance_trip(trip, EnhanceOptions()))

    assert mock_execute.await_count == 1
    new_act = next(a for day in result.days for a in day.activities if a.id == "new")
    assert new_act.map_coordinates == {"lat": 1.0, "lng": 2.0}
    # The merge must scope strictly to map_coordinates, ignoring noise in other fields.
    assert new_act.title == "Manually Added Spot"
    existing_act = next(a for day in result.days for a in day.activities if a.id == "a1")
    assert existing_act.title == "Spanish Steps"


def test_enhance_trip_raises_when_every_selected_option_fails(monkeypatch):
    async def _always_fails(system_prompt, user_content, **kwargs):
        raise HTTPException(status_code=429, detail="rate limited")

    monkeypatch.setattr(LLMService, "_execute_with_retry", _always_fails)

    trip = _trip_with_food()
    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(LLMService.enhance_trip(trip, EnhanceOptions(prices=True, links=True)))
    assert exc_info.value.status_code == 429
