"""Communication with the external LLM (Gemini), with exponential-backoff retries."""

import asyncio
import json
import os

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from models import AgentResponse, TripData

# Using environment variable for API key (Best Practice)
# Fallback to empty string assumes the runtime environment injects it if needed
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key={GEMINI_API_KEY}"


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
    async def parse_trip_text(cls, raw_text: str, preferences: str | None = None) -> TripData:
        """Calls the LLM to parse raw text into a structured TripData object.

        `preferences` is the requesting user's dietary/other free-text preference
        (set via PUT /api/me/preferences). Anonymous requests pass None — no
        dietary assumption is injected into the prompt.
        """
        preferences_fragment = f"IMPORTANT: {preferences} " if preferences else ""
        system_prompt = (
            "You are an expert travel planner AI. Your task is to parse the user's free text "
            "into a structured JSON trip schedule. "
            f"{preferences_fragment}"
            "If the user mentions a dietary preference for restaurants, flag 'is_kosher' accordingly. "
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
    async def agent_interaction(
        cls, current_trip: TripData, user_message: str, preferences: str | None = None
    ) -> AgentResponse:
        """Calls the LLM to update the trip based on user chat and return a conversational reply."""
        preferences_fragment = f"IMPORTANT: {preferences} " if preferences else ""
        system_prompt = (
            "You are a helpful travel assistant AI. The user is reviewing their current trip itinerary. "
            "Your task is to listen to the user's request, update the JSON itinerary accordingly, "
            "and provide a friendly conversational response IN HEBREW. "
            f"{preferences_fragment}"
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
