# AppMyTrip

An app that turns a free-text trip summary (e.g. pasted WhatsApp messages) into a
structured, per-day trip app — with day tabs, a map of points of interest, an AI
completion agent, and rich media (historical podcasts). Web first, Android later.

This repository currently contains an early **TripWeaver AI** prototype: a FastAPI
backend that uses an LLM to parse trip text and a React web UI that walks the user
through a 4-step build flow with a live phone preview.

## Structure

```
AppMyTrip/
├── backend/          FastAPI service (LLM parse, AI agent, mock TTS podcasts)
│   ├── trip_api_backend.py
│   ├── test_trip_api.py        offline tests (LLM mocked)
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/         Vite + React + TypeScript + Tailwind prototype
│   └── src/App.tsx             4-step builder UI + live preview
└── main.py           (legacy scaffold placeholder)
```

## Backend

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt

# run tests (no API key / network needed — LLM calls are mocked)
pytest

# run the API (needs GEMINI_API_KEY for the LLM-backed endpoints)
export GEMINI_API_KEY=...     # optional; /generate-media works without it
python trip_api_backend.py    # serves on http://0.0.0.0:8000, docs at /docs
```

Endpoints:
- `POST /api/trip/parse` — raw text → structured itinerary (LLM)
- `POST /api/trip/agent` — chat + current itinerary → updated itinerary (LLM)
- `POST /api/trip/generate-media` — fill TTS podcast URLs for flagged sites (mock, offline)

## Frontend

```bash
cd frontend
npm install
npm run dev       # dev server
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build
```

## Notes

- The backend is wired to Google Gemini (`gemini-2.5-flash`). The `parse` and `agent`
  endpoints require a valid `GEMINI_API_KEY`; `generate-media` uses a mock TTS service.
- The frontend prototype currently uses mock in-memory data and is not yet wired to
  the backend — connecting them is the next step.
- User profile is hardcoded (Kosher food preference) in `USER_PREFERENCES`.
