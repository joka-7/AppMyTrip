import asyncio
import json
import os
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError

from services.tts import PODCASTS_DIR, STATIC_DIR, TTSService

# Load a local backend/.env if present (optional dependency).
try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

app = FastAPI(
    title="TripWeaver AI API",
    description="Production-ready API for building trip apps dynamically using LLMs.",
)

# Serves locally-synthesized TTS audio (see services/tts.py: PiperTTSProvider).
PODCASTS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

# Allow the web client (and later the Android app) to call the API from a
# different origin. Origins are configurable via the CORS_ORIGINS env var
# (comma-separated); defaults to "*" for local prototype development.
_cors_origins = os.environ.get("CORS_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _cors_origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# Configuration & Constants
# ==========================================

# Using environment variable for API key (Best Practice)
# Fallback to empty string assumes the runtime environment injects it if needed
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key={GEMINI_API_KEY}"

# Personalization: Automatically appended to System Prompts
USER_PREFERENCES = "The user strictly eats Kosher food. All food recommendations MUST be Kosher."

# ==========================================
# Data Models (Pydantic - Python 3.12+)
# ==========================================


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


class ParseRequest(BaseModel):
    """Payload for the initial text parsing in Stage 1."""

    raw_text: str


class AgentResponse(BaseModel):
    """Structured response expected from the LLM during Stage 3 chat."""

    updated_trip: TripData
    agent_reply: str = Field(..., description="The friendly reply from the agent in Hebrew")


# ==========================================
# External Services (Service Pattern)
# ==========================================


class LLMService:
    """
    Handles all communication with the external LLM (Gemini).
    Implements exponential backoff for resilience.
    """

    @staticmethod
    async def _execute_with_retry(payload: dict, max_retries: int = 5) -> dict:
        """Executes the HTTP request to the LLM with exponential backoff."""
        delays = [1, 2, 4, 8, 16]

        async with httpx.AsyncClient() as client:
            for attempt in range(max_retries):
                try:
                    response = await client.post(GEMINI_API_URL, json=payload, timeout=30.0)
                    response.raise_for_status()
                    result = response.json()

                    # Extract text from Gemini response structure
                    text_content = (
                        result.get("candidates", [{}])[0]
                        .get("content", {})
                        .get("parts", [{}])[0]
                        .get("text", "")
                    )
                    if not text_content:
                        raise ValueError("Empty response from LLM")

                    return json.loads(text_content)

                except (httpx.HTTPError, ValueError, json.JSONDecodeError) as e:
                    if attempt == max_retries - 1:
                        raise HTTPException(
                            status_code=502, detail=f"LLM API failed after retries: {str(e)}"
                        ) from e
                    await asyncio.sleep(delays[attempt])
        return {}

    @classmethod
    async def parse_trip_text(cls, raw_text: str) -> TripData:
        """Calls the LLM to parse raw text into a structured TripData object."""
        system_prompt = (
            "You are an expert travel planner AI. Your task is to parse the user's free text "
            "into a structured JSON trip schedule. "
            f"IMPORTANT: {USER_PREFERENCES} "
            "If the user asks for food or restaurants, ensure they are Kosher and flag 'is_kosher' as true. "
            "Also, if a location is a historical site, set 'hasPodcast' to true. "
            "Generate realistic latitude ('lat') and longitude ('lng') for 'map_coordinates' for each activity."
        )

        # Pydantic v2 schema generation
        schema = TripData.model_json_schema()

        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {
                    "parts": [
                        {
                            "text": f"User Request: {raw_text}\n\nOutput strict JSON matching this schema: {json.dumps(schema)}"
                        }
                    ]
                }
            ],
            "generationConfig": {"responseMimeType": "application/json"},
        }

        json_data = await cls._execute_with_retry(payload)

        try:
            return TripData(**json_data)
        except ValidationError as e:
            raise HTTPException(
                status_code=422, detail=f"LLM returned invalid schema: {str(e)}"
            ) from e

    @classmethod
    async def agent_interaction(cls, current_trip: TripData, user_message: str) -> AgentResponse:
        """Calls the LLM to update the trip based on user chat and return a conversational reply."""
        system_prompt = (
            "You are a helpful travel assistant AI. The user is reviewing their current trip itinerary. "
            "Your task is to listen to the user's request, update the JSON itinerary accordingly, "
            "and provide a friendly conversational response IN HEBREW. "
            f"IMPORTANT: {USER_PREFERENCES} "
            "Always include realistic 'map_coordinates' for new locations."
        )

        schema = AgentResponse.model_json_schema()

        payload = {
            "systemInstruction": {"parts": [{"text": system_prompt}]},
            "contents": [
                {
                    "parts": [
                        {
                            "text": f"Current Itinerary: {current_trip.model_dump_json()}\nUser Message: {user_message}\n\nUpdate the itinerary and reply. Output strict JSON matching this schema: {json.dumps(schema)}"
                        }
                    ]
                }
            ],
            "generationConfig": {"responseMimeType": "application/json"},
        }

        json_data = await cls._execute_with_retry(payload)

        try:
            return AgentResponse(**json_data)
        except ValidationError as e:
            raise HTTPException(
                status_code=422, detail=f"LLM returned invalid schema: {str(e)}"
            ) from e


# ==========================================
# Builder Pattern Implementation
# ==========================================


class TripBuilder:
    """
    Builder pattern for constructing the trip object in stages.
    Updated to support asynchronous operations required for API integrations.
    """

    def __init__(self) -> None:
        self._trip: TripData | None = None
        self._raw_text: str = ""

    def load_initial_text(self, text: str) -> "TripBuilder":
        """Receives the raw text from the user."""
        self._raw_text = text
        return self

    async def extract_with_llm(self) -> "TripBuilder":
        """Invokes the LLMService to parse the text."""
        self._trip = await LLMService.parse_trip_text(self._raw_text)
        return self

    def load_existing_trip(self, trip_data: TripData) -> "TripBuilder":
        """Loads an existing trip state for subsequent stages."""
        self._trip = trip_data
        return self

    def analyze_missing_requirements(self) -> str | None:
        """
        Analyzes the schedule for deficiencies based on user profile.
        Returns a proactive AI agent message if needed.
        """
        if not self._trip:
            raise ValueError("Trip has not been parsed yet.")

        # Check for Kosher food presence
        has_food = any(act.type == "food" for day in self._trip.days for act in day.activities)
        if not has_food:
            return "שמתי לב שאתם שומרים כשרות, אבל לא מצאתי מסעדות בלוז שתכננו. תרצו שאחפש ואוסיף המלצות למסעדות כשרות באזורי הטיול?"
        return None

    async def process_agent_update(self, user_message: str) -> str:
        """Passes the current state and user message to the LLM agent to get the new state."""
        if not self._trip:
            raise ValueError("Trip has not been initialized.")

        agent_response = await LLMService.agent_interaction(self._trip, user_message)

        # Update builder state with the new trip
        self._trip = agent_response.updated_trip

        # Return the conversational reply
        return agent_response.agent_reply

    async def generate_media(self) -> "TripBuilder":
        """Generates TTS podcasts for flagged activities."""
        if not self._trip:
            return self

        for day in self._trip.days:
            for act in day.activities:
                if act.hasPodcast and not act.podcast_url:
                    act.podcast_url = await TTSService.generate_podcast_for_activity(
                        act.title, act.desc
                    )
        return self

    def get_trip(self) -> TripData:
        """Returns the final compiled trip object."""
        if not self._trip:
            raise ValueError("Trip object is empty")
        return self._trip


# ==========================================
# API Endpoints (FastAPI Routes)
# ==========================================


@app.post("/api/trip/parse", response_model=dict)
async def parse_initial_trip(request: ParseRequest) -> dict:
    """
    Endpoint for Stage 1 & 2:
    Receives raw text, parses it using Gemini AI, and returns the structured itinerary.
    """
    builder = TripBuilder()

    # Execute the LLM pipeline asynchronously
    builder.load_initial_text(request.raw_text)
    await builder.extract_with_llm()

    # Proactive Agent logic
    agent_msg = builder.analyze_missing_requirements()

    return {"trip_data": builder.get_trip().model_dump(), "initial_agent_message": agent_msg}


@app.post("/api/trip/agent", response_model=dict)
async def agent_interaction(request: AgentInteractRequest) -> dict:
    """
    Endpoint for Stage 3:
    Sends user chat + current itinerary to Gemini AI to apply modifications.
    """
    builder = TripBuilder().load_existing_trip(request.trip_data)

    # AI modifies the trip and generates a reply
    reply_text = await builder.process_agent_update(request.user_message)

    return {"trip_data": builder.get_trip().model_dump(), "agent_reply": reply_text}


@app.post("/api/trip/generate-media", response_model=dict)
async def generate_media_endpoint(request: AgentInteractRequest) -> dict:
    """
    Endpoint for Stage 4:
    Generates rich media (like TTS Podcasts) for the final app build.
    """
    builder = TripBuilder().load_existing_trip(request.trip_data)

    # Asynchronously generate media
    await builder.generate_media()

    return {"trip_data": builder.get_trip().model_dump(), "status": "Media generated successfully"}


# Entry point for local testing
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
