"""Pydantic request/response models for the trip-builder API."""

from typing import Literal

from pydantic import BaseModel, Field


class Activity(BaseModel):
    """Represents a single activity in the trip schedule."""

    id: str = Field(..., description="Unique identifier for the activity", max_length=200)
    time: str = Field(..., description="Time of the activity (HH:MM)", max_length=20)
    title: str = Field(..., description="Title of the activity", max_length=300)
    desc: str = Field(..., description="Detailed description of the activity", max_length=4000)
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
    map_url: str | None = Field(
        None,
        max_length=2000,
        description="User-supplied Google Maps link that overrides the one built from "
        "'map_coordinates'. Never invent one — leave as given.",
    )
    travel_mode: Literal["driving", "walking", "bicycling", "transit"] | None = Field(
        None,
        description="How you get to this activity from the previous stop. Null means the "
        "client infers it from the distance and the activity itself.",
    )


class ChecklistItem(BaseModel):
    """One thing to bring/prepare, either for a single day or for the whole trip."""

    id: str = Field(..., max_length=200)
    text: str = Field(..., max_length=300)


class TripDay(BaseModel):
    """Represents a full day in the trip."""

    dayNum: int
    # 150 activities in a single day is already absurd for a real itinerary — the
    # cap exists to bound the payload/token cost of a malicious or malformed
    # request, not to constrain any real trip.
    activities: list[Activity] = Field(default_factory=list, max_length=150)
    checklist: list[ChecklistItem] = Field(
        default_factory=list,
        max_length=100,
        description="What's needed for this specific day (boots for a trail day, "
        "swimsuit for a beach day)",
    )


class TripData(BaseModel):
    """The complete trip model to be sent to the client application."""

    title: str = Field(..., max_length=300)
    dates: str = Field(..., max_length=200)
    # 120 days covers any real trip with wide headroom; exists to bound request
    # size/LLM cost, not to constrain legitimate use.
    days: list[TripDay] = Field(default_factory=list, max_length=120)
    language: str = Field(
        "he",
        max_length=10,
        description="ISO 639-1 code of the dominant language of the trip's source text "
        "(e.g. 'he' if most words/verbs are Hebrew, 'en' if mostly English). All "
        "generated content and agent chat replies should match this language.",
    )
    photo_album_url: str | None = Field(
        None, description="Link to a shared photo album for the whole trip", max_length=2000
    )
    checklist: list[ChecklistItem] = Field(
        default_factory=list,
        max_length=100,
        description="Trip-wide essentials (passport, chargers) — things not tied to one day",
    )


class ProviderCredentials(BaseModel):
    """One LLM provider plus the caller's key(s) for it."""

    provider: str = Field(
        ..., description="Provider id: gemini/openai/anthropic/groq/…", max_length=50
    )
    # A generous ceiling on how many keys one provider group can carry — well past
    # any real user's key collection, just bounding the fan-out an abusive
    # request could trigger (_execute_with_retry tries every key in turn).
    api_keys: list[str] = Field(
        default_factory=list, description="Keys to try, in order", max_length=20
    )


# Shared description for the `credentials` request field.
_CREDENTIALS_DESC = (
    "The caller's saved keys across several providers, tried in order (provider by "
    "provider, key by key). The server only errors once every one fails, so an "
    "exhausted or invalid key/provider doesn't surface an error as long as another "
    "works. Takes precedence over the single-provider api_key/api_keys/provider fields."
)
# A generous ceiling — more than any real user configures — bounding how many
# provider/key combinations one request can make _execute() fan out to.
_MAX_CREDENTIAL_GROUPS = 10
_MAX_LEGACY_API_KEYS = 20
_MAX_PREFERENCES_LENGTH = 1000


class AgentInteractRequest(BaseModel):
    """Payload for interacting with the AI Agent in Stage 3."""

    trip_data: TripData
    # 8000 chars is a very long chat message; the cap bounds prompt size/cost,
    # not realistic typing.
    user_message: str = Field(..., max_length=8000)
    preferences: str | None = Field(
        None,
        max_length=_MAX_PREFERENCES_LENGTH,
        description="Free-text dietary/other preference (e.g. 'Vegan', 'gluten-free')",
    )
    credentials: list[ProviderCredentials] | None = Field(
        None, max_length=_MAX_CREDENTIAL_GROUPS, description=_CREDENTIALS_DESC
    )
    api_key: str | None = Field(
        None,
        max_length=2000,
        description="Caller's own LLM provider API key. Falls back to the server's "
        "GEMINI_API_KEY/OPENAI_API_KEY/ANTHROPIC_API_KEY/GROQ_API_KEY env var if omitted. "
        "Legacy single-key field; prefer `api_keys` for rotation across several keys.",
    )
    api_keys: list[str] | None = Field(
        None,
        max_length=_MAX_LEGACY_API_KEYS,
        description="Caller's own LLM provider API keys, tried in order — when one is "
        "rate-limited (429) the server rotates to the next before failing. Merged with "
        "the legacy `api_key` field if both are sent.",
    )
    provider: str | None = Field(
        None,
        max_length=50,
        description="Which LLM provider `api_key` belongs to: 'gemini', 'openai', "
        "'anthropic', or 'groq'. Falls back to the server's LLM_PROVIDER env var "
        "(default 'gemini') if omitted.",
    )


class ParseRequest(BaseModel):
    """Payload for the initial text parsing in Stage 1."""

    # 20000 chars comfortably covers a pasted WhatsApp thread for a long trip;
    # the cap exists to bound prompt size/cost on an unauthenticated endpoint,
    # not to constrain realistic input.
    raw_text: str = Field(..., max_length=20000)
    preferences: str | None = Field(
        None,
        max_length=_MAX_PREFERENCES_LENGTH,
        description="Free-text dietary/other preference (e.g. 'Vegan', 'gluten-free')",
    )
    credentials: list[ProviderCredentials] | None = Field(
        None, max_length=_MAX_CREDENTIAL_GROUPS, description=_CREDENTIALS_DESC
    )
    api_key: str | None = Field(
        None,
        max_length=2000,
        description="Caller's own LLM provider API key. Falls back to the server's "
        "GEMINI_API_KEY/OPENAI_API_KEY/ANTHROPIC_API_KEY/GROQ_API_KEY env var if omitted. "
        "Legacy single-key field; prefer `api_keys` for rotation across several keys.",
    )
    api_keys: list[str] | None = Field(
        None,
        max_length=_MAX_LEGACY_API_KEYS,
        description="Caller's own LLM provider API keys, tried in order — when one is "
        "rate-limited (429) the server rotates to the next before failing. Merged with "
        "the legacy `api_key` field if both are sent.",
    )
    provider: str | None = Field(
        None,
        max_length=50,
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
    packing: bool = False
    travel_mode: bool = False


class EnhanceRequest(BaseModel):
    """Payload for the optional Stage 2 enhancement step."""

    trip_data: TripData
    options: EnhanceOptions
    credentials: list[ProviderCredentials] | None = Field(
        None, max_length=_MAX_CREDENTIAL_GROUPS, description=_CREDENTIALS_DESC
    )
    api_key: str | None = Field(
        None,
        max_length=2000,
        description="Caller's own LLM provider API key. Falls back to the server's "
        "GEMINI_API_KEY/OPENAI_API_KEY/ANTHROPIC_API_KEY/GROQ_API_KEY env var if omitted. "
        "Legacy single-key field; prefer `api_keys` for rotation across several keys.",
    )
    api_keys: list[str] | None = Field(
        None,
        max_length=_MAX_LEGACY_API_KEYS,
        description="Caller's own LLM provider API keys, tried in order — when one is "
        "rate-limited (429) the server rotates to the next before failing. Merged with "
        "the legacy `api_key` field if both are sent.",
    )
    provider: str | None = Field(
        None,
        max_length=50,
        description="Which LLM provider `api_key` belongs to: 'gemini', 'openai', "
        "'anthropic', or 'groq'. Falls back to the server's LLM_PROVIDER env var "
        "(default 'gemini') if omitted.",
    )


class GenerateMediaRequest(BaseModel):
    """Payload for Stage 4 TTS/podcast generation.

    Unlike agent chat, this endpoint only needs the trip — there is no user
    message to process.
    """

    trip_data: TripData


class AgentResponse(BaseModel):
    """Structured response expected from the LLM during Stage 3 chat."""

    updated_trip: TripData
    agent_reply: str = Field(..., description="The friendly reply from the agent in Hebrew")


class AgentDayIntent(BaseModel):
    """Cheap classification of a chat message's scope, used to decide whether the
    server can send/regenerate only a subset of days instead of the whole trip
    for this turn — see LLMService._resolve_edit_intent."""

    action: Literal["add_days", "edit_days", "general"]
    day_numbers: list[int] = Field(
        default_factory=list,
        description="For 'edit_days', the existing day numbers the message affects. "
        "Ignored for 'add_days' and 'general'.",
    )


class AgentScopedResponse(BaseModel):
    """Structured response for a day-scoped agent turn (add_days/edit_days) — only
    the new/changed day(s) are returned, not the whole trip."""

    days: list[TripDay]
    agent_reply: str = Field(..., description="The friendly reply from the agent")
