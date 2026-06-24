"""Pydantic request/response models for the trip-builder API.

Disambiguated from `models_db.py`, which holds the SQLAlchemy ORM models.
"""

from typing import Literal

from pydantic import BaseModel, Field


class Activity(BaseModel):
    """Represents a single activity in the trip schedule."""

    id: str = Field(..., description="Unique identifier for the activity")
    time: str = Field(..., description="Time of the activity (HH:MM)")
    title: str = Field(..., description="Title of the activity")
    desc: str = Field(..., description="Detailed description of the activity")
    type: Literal["attraction", "food", "lodging", "transport"]
    is_kosher: bool | None = Field(
        None, description="True if the restaurant is Kosher. Mandatory to flag if type is 'food'"
    )
    hasPodcast: bool = Field(
        False,
        description="Flag indicating if a historical podcast should be generated for this site",
    )
    podcast_url: str | None = Field(
        None, description="URL pointing to the generated TTS audio file"
    )
    map_coordinates: dict[str, float] | None = Field(
        None, description="Dictionary with 'lat' and 'lng' keys for map rendering"
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


class AgentInteractRequest(BaseModel):
    """Payload for interacting with the AI Agent in Stage 3."""

    trip_data: TripData
    user_message: str
    preferences: str | None = Field(
        None, description="Free-text dietary/other preference (e.g. 'Kosher', 'Vegan')"
    )


class ParseRequest(BaseModel):
    """Payload for the initial text parsing in Stage 1."""

    raw_text: str
    preferences: str | None = Field(
        None, description="Free-text dietary/other preference (e.g. 'Kosher', 'Vegan')"
    )


class AgentResponse(BaseModel):
    """Structured response expected from the LLM during Stage 3 chat."""

    updated_trip: TripData
    agent_reply: str = Field(..., description="The friendly reply from the agent in Hebrew")
