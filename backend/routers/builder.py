from fastapi import APIRouter, HTTPException

from models import AgentInteractRequest, ParseRequest, TripData
from services.llm import LLMService
from services.tts import TTSService

router = APIRouter(prefix="/api/trip", tags=["trip"])


def _activity_count(trip: TripData) -> int:
    return sum(len(day.activities) for day in trip.days)


def _looks_truncated(previous: TripData, updated: TripData) -> bool:
    """Heuristic guard against a truncated/hallucinated agent response that
    silently drops most of the existing itinerary — observed in practice as a
    long multi-day trip collapsing to a single day after one chat message,
    most likely from the LLM's response hitting a token limit mid-echo
    (each agent turn re-sends the *entire* itinerary, not just a diff)."""
    prev_count = _activity_count(previous)
    if prev_count < 4:
        return False
    return _activity_count(updated) < prev_count / 2


class TripBuilder:
    """
    Builder pattern for constructing the trip object in stages.
    Updated to support asynchronous operations required for API integrations.
    """

    def __init__(self) -> None:
        self._trip: TripData | None = None
        self._raw_text: str = ""
        self._preferences: str | None = None
        self._api_key: str | None = None
        self._provider: str | None = None

    def load_initial_text(self, text: str) -> "TripBuilder":
        """Receives the raw text from the user."""
        self._raw_text = text
        return self

    def set_preferences(self, preferences: str | None) -> "TripBuilder":
        """Sets the requesting user's preferences (None for anonymous requests)."""
        self._preferences = preferences
        return self

    def set_api_key(self, api_key: str | None) -> "TripBuilder":
        """Sets the caller's own LLM provider API key (falls back to server env var)."""
        self._api_key = api_key
        return self

    def set_provider(self, provider: str | None) -> "TripBuilder":
        """Sets which LLM provider `api_key` belongs to (falls back to server env var)."""
        self._provider = provider
        return self

    async def extract_with_llm(self) -> "TripBuilder":
        """Invokes the LLMService to parse the text."""
        self._trip = await LLMService.parse_trip_text(
            self._raw_text, self._preferences, api_key=self._api_key, provider=self._provider
        )
        return self

    def load_existing_trip(self, trip_data: TripData) -> "TripBuilder":
        """Loads an existing trip state for subsequent stages."""
        self._trip = trip_data
        return self

    def analyze_missing_requirements(self) -> str | None:
        """
        Analyzes the schedule for deficiencies based on the user's preferences.
        Returns a proactive AI agent message if needed. Anonymous users (no
        preferences set) get no proactive dietary nudge.
        """
        if not self._trip:
            raise ValueError("Trip has not been parsed yet.")

        if not self._preferences or "kosher" not in self._preferences.lower():
            return None

        has_food = any(act.type == "food" for day in self._trip.days for act in day.activities)
        if not has_food:
            return "שמתי לב שאתם שומרים כשרות, אבל לא מצאתי מסעדות בלוז שתכננו. תרצו שאחפש ואוסיף המלצות למסעדות כשרות באזורי הטיול?"
        return None

    async def process_agent_update(self, user_message: str) -> str:
        """Passes the current state and user message to the LLM agent to get the new state."""
        if not self._trip:
            raise ValueError("Trip has not been initialized.")

        previous_trip = self._trip
        agent_response = await LLMService.agent_interaction(
            self._trip,
            user_message,
            self._preferences,
            api_key=self._api_key,
            provider=self._provider,
        )

        if _looks_truncated(previous_trip, agent_response.updated_trip):
            raise HTTPException(
                status_code=502,
                detail="The AI's response looks incomplete — it dropped most of the "
                "existing itinerary, which can happen on long trips. Your itinerary "
                "was left unchanged; try again, or break your request into smaller steps.",
            )

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


@router.post("/parse", response_model=dict)
async def parse_initial_trip(request: ParseRequest) -> dict:
    """
    Endpoint for Stage 1 & 2:
    Receives raw text, parses it using Gemini AI, and returns the structured itinerary.
    `preferences` is an optional free-text dietary/other preference supplied
    directly by the client (e.g. loaded from the user's own Google Drive
    settings) — the backend holds no per-user state of its own. `api_key` is
    the caller's own LLM provider API key; the server's env var is only a
    fallback for local development.
    """
    builder = TripBuilder()
    builder.set_preferences(request.preferences)
    builder.set_api_key(request.api_key)
    builder.set_provider(request.provider)

    # Execute the LLM pipeline asynchronously
    builder.load_initial_text(request.raw_text)
    await builder.extract_with_llm()

    # Proactive Agent logic
    agent_msg = builder.analyze_missing_requirements()

    return {"trip_data": builder.get_trip().model_dump(), "initial_agent_message": agent_msg}


@router.post("/agent", response_model=dict)
async def agent_interaction(request: AgentInteractRequest) -> dict:
    """
    Endpoint for Stage 3:
    Sends user chat + current itinerary to Gemini AI to apply modifications.
    """
    builder = TripBuilder().load_existing_trip(request.trip_data)
    builder.set_preferences(request.preferences)
    builder.set_api_key(request.api_key)
    builder.set_provider(request.provider)

    # AI modifies the trip and generates a reply
    reply_text = await builder.process_agent_update(request.user_message)

    return {"trip_data": builder.get_trip().model_dump(), "agent_reply": reply_text}


@router.post("/generate-media", response_model=dict)
async def generate_media_endpoint(request: AgentInteractRequest) -> dict:
    """
    Endpoint for Stage 4:
    Generates rich media (like TTS Podcasts) for the final app build.
    """
    builder = TripBuilder().load_existing_trip(request.trip_data)

    # Asynchronously generate media
    await builder.generate_media()

    return {"trip_data": builder.get_trip().model_dump(), "status": "Media generated successfully"}
