import re
import unicodedata

from fastapi import APIRouter, HTTPException

from models import (
    AgentInteractRequest,
    EnhanceOptions,
    EnhanceRequest,
    GenerateMediaRequest,
    ParseRequest,
    ProviderCredentials,
    TripData,
)
from services.llm import LLMService
from services.tts import TTSService

router = APIRouter(prefix="/api/trip", tags=["trip"])


def _activity_count(trip: TripData) -> int:
    return sum(len(day.activities) for day in trip.days)


# Words that signal the user themselves asked to delete/remove things — if
# present, a big drop in activity count is the expected outcome, not a
# truncation bug, so the guard below should not fire. Not tied to the trip's
# `language` field on purpose: users often type a chat message in a different
# language than the itinerary's dominant one, so we match broadly instead.
#
# Matched as whole words (see _mentions_deletion below), not as a plain
# substring — e.g. English "remove" used to also fire on any unrelated word
# that merely *contained* "remove" as a substring.
_DELETION_KEYWORDS = (
    # Hebrew
    "מחק",
    "מחיקה",
    "תמחק",
    "הסר",
    "הסרה",
    "תסיר",
    "בטל",
    "ביטול",
    # English
    "delete",
    "remove",
    "cancel",
    # French
    "supprime",
    "supprimer",
    "enlève",
    "enlever",
    "annule",
    "annuler",
    # Spanish
    "elimina",
    "eliminar",
    "borra",
    "borrar",
    "quitar",
    "cancela",
    "cancelar",
    # German
    "lösche",
    "löschen",
    "entferne",
    "entfernen",
    "storniere",
    "stornieren",
    # Italian
    "cancella",
    "cancellare",
    "rimuovi",
    "rimuovere",
    # Portuguese (English "remove" above is spelled identically in Portuguese
    # — intentionally not repeated here)
    "apaga",
    "apagar",
    "remover",
    "cancela",
    "cancelar",
    # Russian
    "удали",
    "удалить",
    "убери",
    "убрать",
    "отмени",
    "отменить",
    # Arabic
    "احذف",
    "حذف",
    "ألغِ",
    "إلغاء",
    "أزل",
    # Turkish
    "silme",
    "kaldır",
    "iptal",
    # Dutch
    "verwijder",
    "verwijderen",
    "annuleer",
    "annuleren",
    # Chinese
    "删除",
    "取消",
    "移除",
    # Japanese
    "削除",
    "取り消",
    "キャンセル",
    # Korean
    "삭제",
    "취소",
    "제거",
    # Hindi
    "हटाओ",
    "हटाना",
    "मिटाओ",
    "मिटाना",
    "रद्द",
)

# Chinese/Japanese/Korean don't delimit words with spaces or punctuation the
# way the other languages above do, so a `\b`-anchored regex can't reliably
# match a keyword sitting inside a longer, unspaced sentence — unlike the
# other scripts, that's *normal*, expected CJK phrasing, not a false-positive
# substring collision. Plain substring matching is the correct approach here.
_CJK_DELETION_KEYWORDS = (
    "删除",
    "取消",
    "移除",
    "削除",
    "取り消",
    "キャンセル",
    "삭제",
    "취소",
    "제거",
)
_WORD_BOUNDARY_DELETION_KEYWORDS = tuple(
    kw for kw in _DELETION_KEYWORDS if kw not in _CJK_DELETION_KEYWORDS
)


def _strip_trailing_combining_marks(word: str) -> str:
    """Drops trailing Unicode combining marks (diacritics/vowel signs) from a
    word before it's used to build a `\\b`-anchored regex.

    Python's `\\b` boundary is defined by transitions to/from `\\w`, and
    combining-mark characters (Unicode categories Mn/Mc — an Arabic diacritic
    like the one on "ألغِ", or a Hindi vowel sign like the "ा" in "हटाना")
    don't count as `\\w`. A keyword ending in one of these would then need its
    *trailing* `\\b` to fall one character short of where the word actually
    ends, so it would never match even when the keyword is properly delimited
    by spaces in real text. Anchoring right after the last base character
    instead (see `_WORD_BOUNDARY_DELETION_PATTERN`) sidesteps that without
    weakening the match anywhere else.
    """
    end = len(word)
    while end > 0 and unicodedata.combining(word[end - 1]):
        end -= 1
    return word[:end]


_WORD_BOUNDARY_DELETION_PATTERN = re.compile(
    "|".join(
        rf"\b{re.escape(_strip_trailing_combining_marks(kw))}(?!\w)"
        for kw in _WORD_BOUNDARY_DELETION_KEYWORDS
    ),
    re.IGNORECASE,
)


def _mentions_deletion(user_message: str) -> bool:
    """True if the user's message contains one of `_DELETION_KEYWORDS` as a
    whole word (or, for CJK scripts, anywhere at all — see
    `_CJK_DELETION_KEYWORDS`)."""
    lowered = user_message.lower()
    if any(keyword in lowered for keyword in _CJK_DELETION_KEYWORDS):
        return True
    return bool(_WORD_BOUNDARY_DELETION_PATTERN.search(lowered))


def _looks_truncated(previous: TripData, updated: TripData, user_message: str = "") -> bool:
    """Heuristic guard against a truncated/hallucinated agent response that
    silently drops most of the existing itinerary — observed in practice as a
    long multi-day trip collapsing to a single day after one chat message,
    most likely from the LLM's response hitting a token limit mid-echo
    (each agent turn re-sends the *entire* itinerary, not just a diff).

    Skipped when the user's own message asks to delete/remove something —
    a big drop is then the intended result, not a truncation bug. Tuned to
    only fire on near-total collapses (>65% dropped, on trips with at least
    6 activities to begin with) so legitimate large restructurings (e.g.
    "shorten this to just the weekend") aren't mistaken for truncation."""
    if _mentions_deletion(user_message):
        return False
    prev_count = _activity_count(previous)
    if prev_count < 6:
        return False
    return _activity_count(updated) < prev_count * 0.35


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
        self._api_keys: list[str] | None = None
        self._provider: str | None = None
        self._credentials: list[ProviderCredentials] | None = None

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

    def set_api_keys(self, api_keys: list[str] | None) -> "TripBuilder":
        """Sets the caller's LLM provider API keys to rotate through on rate limits
        (merged with the legacy single `api_key`; falls back to server env var)."""
        self._api_keys = api_keys
        return self

    def set_provider(self, provider: str | None) -> "TripBuilder":
        """Sets which LLM provider `api_key` belongs to (falls back to server env var)."""
        self._provider = provider
        return self

    def set_credentials(self, credentials: list[ProviderCredentials] | None) -> "TripBuilder":
        """Sets the caller's keys across several providers, tried in order — the
        request only fails once every provider/key has failed (takes precedence
        over the single-provider api_key/api_keys/provider fields)."""
        self._credentials = credentials
        return self

    async def extract_with_llm(self) -> "TripBuilder":
        """Invokes the LLMService to parse the text."""
        self._trip = await LLMService.parse_trip_text(
            self._raw_text,
            self._preferences,
            api_key=self._api_key,
            provider=self._provider,
            api_keys=self._api_keys,
            credentials=self._credentials,
        )
        return self

    def load_existing_trip(self, trip_data: TripData) -> "TripBuilder":
        """Loads an existing trip state for subsequent stages."""
        self._trip = trip_data
        return self

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
            api_keys=self._api_keys,
            credentials=self._credentials,
        )

        if _looks_truncated(previous_trip, agent_response.updated_trip, user_message):
            # Truncation is often a one-off token-budget hiccup rather than a
            # consistent failure, so retry once server-side before giving up.
            agent_response = await LLMService.agent_interaction(
                previous_trip,
                user_message,
                self._preferences,
                api_key=self._api_key,
                provider=self._provider,
                api_keys=self._api_keys,
                credentials=self._credentials,
            )
            if _looks_truncated(previous_trip, agent_response.updated_trip, user_message):
                # 409, not 502/504: this isn't an upstream/provider failure, it's our
                # own guard rejecting an otherwise-successful response — the frontend
                # tells these apart to give more specific guidance.
                raise HTTPException(
                    status_code=409,
                    detail="The AI's response looks incomplete — it dropped most of the "
                    "existing itinerary, which can happen on long trips. Your itinerary "
                    "was left unchanged; try again, or break your request into smaller steps.",
                )

        # Update builder state with the new trip
        self._trip = agent_response.updated_trip

        # Return the conversational reply
        return agent_response.agent_reply

    async def enhance(self, options: EnhanceOptions) -> "TripBuilder":
        """Fills in the optional extras the user opted into in Step 2."""
        if not self._trip:
            raise ValueError("Trip has not been initialized.")
        self._trip = await LLMService.enhance_trip(
            self._trip,
            options,
            api_key=self._api_key,
            provider=self._provider,
            api_keys=self._api_keys,
            credentials=self._credentials,
        )
        return self

    async def generate_media(self) -> "TripBuilder":
        """Generates TTS podcasts for flagged activities."""
        if not self._trip:
            return self

        for day in self._trip.days:
            for act in day.activities:
                if act.hasPodcast and not act.podcast_url:
                    act.podcast_url = await TTSService.generate_podcast_for_activity(
                        act.title, act.desc, act.podcast_brief
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
    builder.set_api_keys(request.api_keys)
    builder.set_provider(request.provider)
    builder.set_credentials(request.credentials)

    # Execute the LLM pipeline asynchronously
    builder.load_initial_text(request.raw_text)
    await builder.extract_with_llm()

    return {"trip_data": builder.get_trip().model_dump(), "initial_agent_message": None}


@router.post("/agent", response_model=dict)
async def agent_interaction(request: AgentInteractRequest) -> dict:
    """
    Endpoint for Stage 3:
    Sends user chat + current itinerary to Gemini AI to apply modifications.
    """
    builder = TripBuilder().load_existing_trip(request.trip_data)
    builder.set_preferences(request.preferences)
    builder.set_api_key(request.api_key)
    builder.set_api_keys(request.api_keys)
    builder.set_provider(request.provider)
    builder.set_credentials(request.credentials)

    # AI modifies the trip and generates a reply
    reply_text = await builder.process_agent_update(request.user_message)

    return {"trip_data": builder.get_trip().model_dump(), "agent_reply": reply_text}


@router.post("/enhance", response_model=dict)
async def enhance_trip_endpoint(request: EnhanceRequest) -> dict:
    """
    Endpoint for the optional Stage 2 enhancements (directions, prices, podcast
    briefs, links) — opt-in per checkbox so the default parse/chat turns stay fast.
    """
    builder = TripBuilder().load_existing_trip(request.trip_data)
    builder.set_api_key(request.api_key)
    builder.set_api_keys(request.api_keys)
    builder.set_provider(request.provider)
    builder.set_credentials(request.credentials)

    await builder.enhance(request.options)

    return {"trip_data": builder.get_trip().model_dump()}


@router.post("/generate-media", response_model=dict)
async def generate_media_endpoint(request: GenerateMediaRequest) -> dict:
    """
    Endpoint for Stage 4:
    Generates rich media (like TTS Podcasts) for the final app build.
    """
    builder = TripBuilder().load_existing_trip(request.trip_data)

    # Asynchronously generate media
    await builder.generate_media()

    return {"trip_data": builder.get_trip().model_dump(), "status": "Media generated successfully"}
