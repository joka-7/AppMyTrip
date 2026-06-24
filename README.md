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
├── backend/          FastAPI service (LLM parse, AI agent, TTS podcasts) — stateless
│   ├── trip_api_backend.py     entrypoint: app creation, CORS, static mount, routers
│   ├── models.py                Pydantic request/response models (Activity, TripData, ...)
│   ├── services/                llm.py (Gemini), tts.py (Piper/mock TTS)
│   ├── routers/                builder.py (/api/trip/*)
│   ├── test_trip_api.py        offline tests (LLM mocked)
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/         Vite + React + TypeScript + Tailwind prototype
│   ├── src/App.tsx             4-step builder UI + live preview
│   ├── src/firebase.ts         Firebase init (Google sign-in only, no Firestore/Hosting)
│   ├── src/services/googleDrive.ts   save/load/share trips in the user's own Drive
│   └── e2e/                    Playwright end-to-end tests (real browser, backend mocked)
├── .run/             shared PyCharm/WebStorm run configurations
└── main.py           (legacy scaffold placeholder)
```

## Backend

With [`uv`](https://docs.astral.sh/uv/) (fast, free, no network cost beyond the
one-time install — recommended):

```bash
cd backend
uv sync --group dev    # creates .venv/ and installs from uv.lock

uv run pytest                # run tests (no API key / network needed — LLM calls are mocked)
uv run ruff check . && uv run ruff format .   # lint / format

export GEMINI_API_KEY=...    # optional; /generate-media works without it
uv run python trip_api_backend.py   # serves on http://0.0.0.0:8000, docs at /docs
```

Or with plain `pip`:

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

The backend is fully stateless — no database, no auth, no server-side persistence:
- `POST /api/trip/parse` — raw text (+ optional `preferences` string) → structured
  itinerary (LLM)
- `POST /api/trip/agent` — chat + current itinerary (+ optional `preferences`) →
  updated itinerary (LLM)
- `POST /api/trip/generate-media` — fill TTS podcast URLs for flagged sites

`preferences` (e.g. "Kosher", "Vegan") is a plain free-text field the frontend sends
with each request — there's no hardcoded global assumption and no per-account storage
on the backend. Saving/loading/sharing trips, and remembering a preferences string
between sessions, is handled entirely client-side via each user's own Google Drive
(see "Frontend" → "Google Drive integration" below) — no database to run, back up, or
pay for.

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

# end-to-end tests (Playwright — real browser, real dev server, backend mocked)
npx playwright install chromium   # one-time browser download
npm run test:e2e
```

### Google Drive integration (save / load / share trips)

Each user can sign in with their own Google account and save trips as JSON files in
their **own** Google Drive — there's no backend database and no storage cost to us.
The app uses the `drive.file` OAuth scope, which only grants access to files the app
itself creates (or files the user explicitly opens with it), so this never sees the
rest of the user's Drive. Sharing a trip reuses Drive's native "anyone with the link"
permission on that one file — also free.

Firebase is used **only** for the Google sign-in popup (to obtain a Drive-scoped OAuth
access token via `firebase/auth`) — there is no Firestore and no Firebase Hosting
involved, so this stays within Firebase's free Spark plan with normal usage.

Setup (free, no billing required):
1. Create a project at the [Firebase console](https://console.firebase.google.com/).
2. **Build → Authentication → Sign-in method** → enable the **Google** provider.
3. **Project settings → General → Your apps** → add a Web app, copy the config values.
4. Copy `frontend/.env.example` to `.env.local` and fill in:
   ```bash
   VITE_FIREBASE_API_KEY=...
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project
   VITE_FIREBASE_APP_ID=...
   ```
5. In **Authentication → Settings → Authorized domains**, add `localhost` (already
   there by default) and your Vercel domain once deployed.

In the app, the cloud icon in the top-right of the navbar lets a user sign in, save
the current trip to Drive, browse/load previously saved trips, and share/delete them.

## Deploying

- **Frontend → Vercel** (free Hobby tier): import the repo, set the root directory to
  `frontend/`, build command `npm run build`, output directory `dist`. Add the
  `VITE_FIREBASE_*` and `VITE_API_URL` env vars from above in the Vercel project
  settings. A `frontend/vercel.json` is included so SPA routes don't 404 on refresh.
- **Backend**: stateless FastAPI app — deploy anywhere that runs a long-lived Python
  process (e.g. a free-tier instance on Render/Fly.io/a VM). It doesn't fit Vercel's
  serverless functions well as a single long-running app, and isn't deployed there.
- **Auth/Drive → Firebase**: no separate deploy step — Firebase Authentication is a
  managed service; you only need the project + Web app config from the setup steps
  above.

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

## IDE run configurations

`.run/` contains shared PyCharm/WebStorm run configurations (the VCS-friendly
alternative to per-user `.idea/` files, which stay gitignored):
- **Backend (FastAPI)** — runs `trip_api_backend.py`
- **Backend tests (pytest)** — runs the backend test suite
- **Frontend (npm dev)** — runs the Vite dev server

They assume a `backend/.venv` (e.g. created by `uv sync --group dev`) and a
frontend Node interpreter configured in the IDE's Node settings.

## Notes

- The backend is wired to Google Gemini (`gemini-2.5-flash`). The `parse` and `agent`
  endpoints require a valid `GEMINI_API_KEY`; `generate-media` defaults to a mock TTS
  service (see "Text-to-speech provider" above for the free local Piper option).
- Dietary/other preferences are entered as free text in the builder UI and sent with
  each request — not a hardcoded assumption, and not stored server-side (see
  "Backend" above and "Google Drive integration" under "Frontend").
- Everything in this app is free to run: Gemini's free tier, local Piper TTS, Vercel's
  Hobby tier, Firebase's Spark plan, and each user's own Google Drive storage.
