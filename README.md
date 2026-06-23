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

# lint / format (ruff)
ruff check .
ruff format .

# run the API (needs GEMINI_API_KEY for the LLM-backed endpoints)
export GEMINI_API_KEY=...     # optional; /generate-media works without it
python trip_api_backend.py    # serves on http://0.0.0.0:8000, docs at /docs
```

Endpoints:
- `POST /api/trip/parse` — raw text → structured itinerary (LLM)
- `POST /api/trip/agent` — chat + current itinerary → updated itinerary (LLM)
- `POST /api/trip/generate-media` — fill TTS podcast URLs for flagged sites

### Text-to-speech provider

`backend/services/tts.py` selects a provider via the `TTS_PROVIDER` env var:

- `mock` (default) — instant fake URLs, no network, no cost. Used in dev/test/CI.
- `piper` — synthesizes real audio locally with the open-source
  [Piper](https://github.com/rhasspy/piper) engine (`piper-tts` package, already in
  `requirements.txt`). Fully offline, no API key, no per-request cost. Requires a
  one-time voice model download, then:
  ```bash
  export TTS_PROVIDER=piper
  export PIPER_VOICE_MODEL=/path/to/en_US-amy-medium.onnx
  ```
  Generated `.wav` files are written to `backend/static/podcasts/` and served at
  `/static/podcasts/<file>.wav`.

## Frontend

```bash
cd frontend
npm install
npm run dev           # dev server
npm run build         # type-check + production build into dist/
npm run preview       # serve the production build

# lint / format (eslint + prettier)
npm run lint
npm run format
npm run format:check

# run tests (vitest + React Testing Library)
npm run test
```

## How they connect

The frontend calls the backend through `frontend/src/api.ts`. The base URL is set
by `VITE_API_URL` (see `frontend/.env.example`, default `http://localhost:8000`).

- Step 1 "create app structure" → `POST /api/trip/parse`
- Step 3 agent chat → `POST /api/trip/agent`
- Step 3 → 4 "continue to design" → `POST /api/trip/generate-media`

If the backend is unreachable (or the `parse`/`agent` calls fail because no
`GEMINI_API_KEY` is set), the UI shows a notice and falls back to local mock
behaviour so the prototype stays demoable. The backend enables CORS (configurable
via the `CORS_ORIGINS` env var, default `*`) so the browser can reach it.

To run the full stack: start the backend (`python trip_api_backend.py`), then the
frontend (`npm run dev`), and set `GEMINI_API_KEY` for live LLM parsing.

## Notes

- The backend is wired to Google Gemini (`gemini-2.5-flash`). The `parse` and `agent`
  endpoints require a valid `GEMINI_API_KEY`; `generate-media` uses a mock TTS service.
- User profile is hardcoded (Kosher food preference) in `USER_PREFERENCES`.
