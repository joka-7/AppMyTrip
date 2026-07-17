"""Pydantic request/response models for the trip-builder API."""

from typing import Literal

from pydantic import BaseModel, Field


class Activity(BaseModel):
    """Represents a single activity in the trip schedule."""

    id: str = Field(..., description="Unique identifier for the activity")
    time: str = Field(..., description="Time of the activity (HH:MM)")
    title: str = Field(..., description="Title of the activity")
    desc: str = Field(..., description="Detailed description of the activity")
    type: Literal["attraction", "food", "lodging", "transport"]
    hasPodcast: bool = Field(
        False,
        description="Flag indicating if a historical podcast should be generated for this site",
    )
    podcast_url: str | None = Field(
        None, description="URL pointing to the generated TTS audio file"
    )
    podcast_brief: str | None = Field(
        None,
        description="Short historical/contextual brief about the site, narrated in the "
        "podcast in addition to 'desc'",
    )
    map_coordinates: dict[str, float] | None = Field(
        None, description="Dictionary with 'lat' and 'lng' keys for map rendering"
    )
    price: float | None = Field(None, description="Cost of this activity, in the trip's currency")
    url: str | None = Field(None, description="Link to the activity's official site or listing")
    directions_car: str | None = Field(
        None, description="Driving directions/notes to reach this activity from the previous stop"
    )
    directions_transit: str | None = Field(
        None,
        description="Public-transit directions/notes to reach this activity from the previous stop",
    )


class TripDay(BaseModel):
    """Represents a full day in the trip."""

    dayNum: int
    activities: list[Activity] = Field(default_factory=list)


class TripData(BaseModel):
    """The complete trip model to be sent to the client application."""

    title: str
    dates: str
    days: list[TripDay] = Field(default_factory=list)
    language: str = Field(
        "he",
        description="ISO 639-1 code of the dominant language of the trip's source text "
        "(e.g. 'he' if most words/verbs are Hebrew, 'en' if mostly English). All "
        "generated content and agent chat replies should match this language.",
    )
    photo_album_url: str | None = Field(
        None, description="Link to a shared photo album for the whole trip"
    )


class ProviderCredentials(BaseModel):
    """One LLM provider plus the caller's key(s) for it."""

    provider: str = Field(..., description="Provider id: gemini/openai/anthropic/groq/…")
    api_keys: list[str] = Field(default_factory=list, description="Keys to try, in order")


# Shared description for the `credentials` request field.
_CREDENTIALS_DESC = (
    "The caller's saved keys across several providers, tried in order (provider by "
    "provider, key by key). The server only errors once every one fails, so an "
    "exhausted or invalid key/provider doesn't surface an error as long as another "
    "works. Takes precedence over the single-provider api_key/api_keys/provider fields."
)


class AgentInteractRequest(BaseModel):
    """Payload for interacting with the AI Agent in Stage 3."""

    trip_data: TripData
    user_message: str
    preferences: str | None = Field(
        None, description="Free-text dietary/other preference (e.g. 'Vegan', 'gluten-free')"
    )
    credentials: list[ProviderCredentials] | None = Field(None, description=_CREDENTIALS_DESC)
    api_key: str | None = Field(
        None,
        description="Caller's own LLM provider API key. Falls back to the server's "
        "GEMINI_API_KEY/OPENAI_API_KEY/ANTHROPIC_API_KEY/GROQ_API_KEY env var if omitted. "
        "Legacy single-key field; prefer `api_keys` for rotation across several keys.",
    )
    api_keys: list[str] | None = Field(
        None,
        description="Caller's own LLM provider API keys, tried in order — when one is "
        "rate-limited (429) the server rotates to the next before failing. Merged with "
        "the legacy `api_key` field if both are sent.",
    )
    provider: str | None = Field(
        None,
        description="Which LLM provider `api_key` belongs to: 'gemini', 'openai', "
        "'anthropic', or 'groq'. Falls back to the server's LLM_PROVIDER env var "
        "(default 'gemini') if omitted.",
    )


class ParseRequest(BaseModel):
    """Payload for the initial text parsing in Stage 1."""

    raw_text: str
    preferences: str | None = Field(
        None, description="Free-text dietary/other preference (e.g. 'Vegan', 'gluten-free')"
    )
    credentials: list[ProviderCredentials] | None = Field(None, description=_CREDENTIALS_DESC)
    api_key: str | None = Field(
        None,
        description="Caller's own LLM provider API key. Falls back to the server's "
        "GEMINI_API_KEY/OPENAI_API_KEY/ANTHROPIC_API_KEY/GROQ_API_KEY env var if omitted. "
        "Legacy single-key field; prefer `api_keys` for rotation across several keys.",
    )
    api_keys: list[str] | None = Field(
        None,
        description="Caller's own LLM provider API keys, tried in order — when one is "
        "rate-limited (429) the server rotates to the next before failing. Merged with "
        "the legacy `api_key` field if both are sent.",
    )
    provider: str | None = Field(
        None,
        description="Which LLM provider `api_key` belongs to: 'gemini', 'openai', "
        "'anthropic', or 'groq'. Falls back to the server's LLM_PROVIDER env var "
        "(default 'gemini') if omitted.",
    )


class EnhanceOptions(BaseModel):
    """Which optional, LLM-generated extras Stage 2 should fill in. Each one is
    opt-in so a plain parse/chat turn stays fast — these are the slower,
    token-heavy additions the user explicitly checked in the builder."""

    directions_car: bool = False
    directions_transit: bool = False
    prices: bool = False
    podcast: bool = False
    links: bool = False


class EnhanceRequest(BaseModel):
    """Payload for the optional Stage 2 enhancement step."""

    trip_data: TripData
    options: EnhanceOptions
    credentials: list[ProviderCredentials] | None = Field(None, description=_CREDENTIALS_DESC)
    api_key: str | None = Field(
        None,
        description="Caller's own LLM provider API key. Falls back to the server's "
        "GEMINI_API_KEY/OPENAI_API_KEY/ANTHROPIC_API_KEY/GROQ_API_KEY env var if omitted. "
        "Legacy single-key field; prefer `api_keys` for rotation across several keys.",
    )
    api_keys: list[str] | None = Field(
        None,
        description="Caller's own LLM provider API keys, tried in order — when one is "
        "rate-limited (429) the server rotates to the next before failing. Merged with "
        "the legacy `api_key` field if both are sent.",
    )
    provider: str | None = Field(
        None,
        description="Which LLM provider `api_key` belongs to: 'gemini', 'openai', "
        "'anthropic', or 'groq'. Falls back to the server's LLM_PROVIDER env var "
        "(default 'gemini') if omitted.",
    )


class AgentResponse(BaseModel):
    """Structured response expected from the LLM during Stage 3 chat."""

    updated_trip: TripData
    agent_reply: str = Field(..., description="The friendly reply from the agent in Hebrew")
