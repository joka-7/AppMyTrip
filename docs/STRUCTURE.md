# Repository structure

Every file in this repo and what is inside it. The tree below is **generated** —
run `python .ai/skills/repo_tree/gen_tree.py --project . --output docs/STRUCTURE.md`
to refresh it, and never edit between the markers by hand.

<!-- BEGIN GENERATED TREE (depth=all entries=all) -->
```text
AppMyTrip/
├── .github/
│   ├── workflows/
│   │   ├── ci.yml
│   │   ├── docs.yml
│   │   └── security.yml
│   ├── copilot-instructions.md       # Copilot's copy of AGENTS.md (generated)
│   └── dependabot.yml
├── .run/                             # Shared PyCharm/WebStorm run configurations
│   ├── Backend (FastAPI).run.xml
│   ├── Backend tests (pytest).run.xml
│   └── Frontend (npm dev).run.xml
├── backend/                          # FastAPI service (LLM parse, AI agent, TTS podcasts) — stateless
│   ├── api/                          # Vercel serverless entrypoint (re-exports the ASGI app)
│   │   └── index.py
│   ├── routers/
│   │   ├── __init__.py
│   │   └── builder.py                # /api/trip/* endpoints
│   ├── services/
│   │   ├── __init__.py
│   │   ├── llm.py                    # Communication with the external LLM provider, with exponential-backoff…
│   │   ├── llm_model_dispatcher.py   # LLM calls routed through the shared ModelDispatcher library
│   │   ├── rate_limit.py             # Per-user rate limiting
│   │   └── tts.py                    # Text-to-speech provider abstraction.
│   ├── static/
│   │   └── podcasts/
│   │       └── .gitkeep
│   ├── vendor/
│   │   └── model-dispatcher          # Vendored copy of ModelDispatcher (see joka-7/ModelDispatcher)
│   ├── .env.example
│   ├── models.py                     # Pydantic request/response models for the trip-builder API.
│   ├── pyproject.toml
│   ├── requirements-dev.txt
│   ├── requirements-model-dispatcher.txt
│   ├── requirements.txt
│   ├── test_llm_model_dispatcher.py  # Tests for the ModelDispatcher-backed LLM path
│   ├── test_trip_api.py              # Offline tests (LLM mocked)
│   ├── trip_api_backend.py           # Entrypoint: app creation, CORS, static mount, routers
│   ├── uv.lock
│   └── vercel.json
├── docs/                             # Design documentation
│   ├── screenshots/                  # Screenshots referenced from README.md
│   │   ├── step1-overview.png
│   │   ├── step2-overview.png
│   │   ├── step3-overview.png
│   │   ├── step4-customized.png
│   │   ├── step4-design-panel.png
│   │   ├── step4-live-preview.png
│   │   ├── step4-overview.png
│   │   ├── step4-preview-customized.png
│   │   └── step4-preview-map.png
│   ├── .structure-notes.toml
│   ├── HLD.md                        # High-Level Design (architecture + flows)
│   ├── LLD.md                        # Low-Level Design (modules, classes, contracts)
│   └── STRUCTURE.md                  # Repository structure
├── frontend/                         # Vite + React + TypeScript + Tailwind web app — the 4-step build flow and live…
│   ├── e2e/                          # Playwright end-to-end tests (real browser, backend mocked)
│   │   ├── a11y.spec.ts
│   │   ├── builder-flow.spec.ts
│   │   ├── mixed-day.spec.ts
│   │   ├── mobile-layout.spec.ts
│   │   └── screenshots.spec.ts
│   ├── public/
│   │   ├── apple-touch-icon.png
│   │   ├── favicon-64.png
│   │   ├── icon-192.png
│   │   ├── icon-512.png
│   │   ├── icon-maskable-512.png
│   │   └── logo.png
│   ├── src/
│   │   ├── components/               # Builder steps (1-4), AppFrame, MapView, CloudMenu, and shared UI
│   │   │   ├── AiSettingsPanel.test.tsx
│   │   │   ├── AiSettingsPanel.tsx
│   │   │   ├── ApiKeyMenu.test.tsx
│   │   │   ├── ApiKeyMenu.tsx
│   │   │   ├── ApiNotice.tsx
│   │   │   ├── AppFrame.test.tsx
│   │   │   ├── AppFrame.tsx
│   │   │   ├── BuilderStep1.test.tsx
│   │   │   ├── BuilderStep1.tsx
│   │   │   ├── BuilderStep2.test.tsx
│   │   │   ├── BuilderStep2.tsx
│   │   │   ├── BuilderStep3.test.tsx
│   │   │   ├── BuilderStep3.tsx
│   │   │   ├── BuilderStep4.test.tsx
│   │   │   ├── BuilderStep4.tsx
│   │   │   ├── ChatPanel.test.tsx
│   │   │   ├── ChatPanel.tsx
│   │   │   ├── ChecklistPanel.test.tsx
│   │   │   ├── ChecklistPanel.tsx
│   │   │   ├── CloudMenu.test.tsx
│   │   │   ├── CloudMenu.tsx
│   │   │   ├── ErrorBoundary.test.tsx
│   │   │   ├── ErrorBoundary.tsx
│   │   │   ├── ExternalChatLinks.tsx
│   │   │   ├── FileActions.test.tsx
│   │   │   ├── FileActions.tsx
│   │   │   ├── GithubIcon.tsx
│   │   │   ├── InstallAppButton.tsx
│   │   │   ├── ItineraryList.test.tsx
│   │   │   ├── ItineraryList.tsx
│   │   │   ├── LanguageIndicator.tsx
│   │   │   ├── LanguageSwitcher.test.tsx
│   │   │   ├── LanguageSwitcher.tsx
│   │   │   ├── LinkDisplay.test.tsx
│   │   │   ├── LinkDisplay.tsx
│   │   │   ├── LocationPicker.tsx
│   │   │   ├── MapView.test.tsx
│   │   │   ├── MapView.tsx
│   │   │   ├── PhonePreview.tsx
│   │   │   ├── PodcastPlayer.tsx
│   │   │   ├── PriceSummary.test.tsx
│   │   │   ├── PriceSummary.tsx
│   │   │   ├── ProgressBar.tsx
│   │   │   ├── SettingsMenu.test.tsx
│   │   │   ├── SettingsMenu.tsx
│   │   │   ├── SharedAppPage.test.tsx
│   │   │   ├── SharedAppPage.tsx
│   │   │   ├── ThemeSelector.test.tsx
│   │   │   └── ThemeSelector.tsx
│   │   ├── data/
│   │   │   ├── agentResponseSchema.json
│   │   │   └── tripDataSchema.json
│   │   ├── hooks/                    # Podcast player, install prompt, trip branding, checklist, editing
│   │   │   ├── useChecklistSuggest.ts
│   │   │   ├── useChecklistTicks.ts
│   │   │   ├── useDismissable.test.ts
│   │   │   ├── useDismissable.ts
│   │   │   ├── useInstallPrompt.ts
│   │   │   ├── usePodcastPlayer.test.ts
│   │   │   ├── usePodcastPlayer.ts
│   │   │   ├── useRotatingHint.ts
│   │   │   ├── useTripBranding.test.ts
│   │   │   ├── useTripBranding.ts
│   │   │   ├── useTripEditing.test.ts
│   │   │   └── useTripEditing.ts
│   │   ├── i18n/                     # UI language store + he/en/fr dictionaries
│   │   │   ├── translations/
│   │   │   │   ├── en.ts
│   │   │   │   ├── fr.ts
│   │   │   │   └── he.ts
│   │   │   ├── store.test.ts
│   │   │   ├── store.ts
│   │   │   └── useI18n.ts
│   │   ├── services/                 # TripsStore, appDesign, tripFile, apiKey, and other pure/service logic
│   │   │   ├── activityTypes.ts
│   │   │   ├── apiKey.test.ts
│   │   │   ├── apiKey.ts
│   │   │   ├── appDesign.test.ts
│   │   │   ├── appDesign.ts
│   │   │   ├── draftStore.test.ts
│   │   │   ├── draftStore.ts
│   │   │   ├── env.test.ts
│   │   │   ├── env.ts
│   │   │   ├── externalChat.test.ts
│   │   │   ├── externalChat.ts
│   │   │   ├── externalTripPrompt.test.ts
│   │   │   ├── externalTripPrompt.ts
│   │   │   ├── externalTripReply.test.ts
│   │   │   ├── externalTripReply.ts
│   │   │   ├── hebrewDate.test.ts
│   │   │   ├── hebrewDate.ts
│   │   │   ├── icsExport.test.ts
│   │   │   ├── icsExport.ts
│   │   │   ├── id.ts
│   │   │   ├── language.ts
│   │   │   ├── mapLinks.test.ts
│   │   │   ├── mapLinks.ts
│   │   │   ├── normalizeTrip.test.ts
│   │   │   ├── normalizeTrip.ts
│   │   │   ├── pdfExport.ts
│   │   │   ├── safeUrl.test.ts
│   │   │   ├── safeUrl.ts
│   │   │   ├── sequenceLabel.test.ts
│   │   │   ├── sequenceLabel.ts
│   │   │   ├── shareLink.test.ts
│   │   │   ├── shareLink.ts
│   │   │   ├── staleChunkRecovery.test.ts
│   │   │   ├── staleChunkRecovery.ts
│   │   │   ├── travelMode.test.ts
│   │   │   ├── travelMode.ts
│   │   │   ├── tripEnhance.ts
│   │   │   ├── tripFile.test.ts
│   │   │   ├── tripFile.ts
│   │   │   ├── tripsStore.test.ts
│   │   │   └── tripsStore.ts
│   │   ├── test/
│   │   │   └── setup.ts
│   │   ├── App.shared.test.tsx
│   │   ├── App.test.tsx
│   │   ├── App.tsx                   # 4-step builder UI + live preview / shared-trip viewer
│   │   ├── api.test.ts
│   │   ├── api.ts
│   │   ├── firebase.ts               # Firebase init (Google sign-in + Firestore)
│   │   ├── index.css
│   │   ├── main.tsx
│   │   └── vite-env.d.ts
│   ├── .env.example
│   ├── .prettierignore
│   ├── .prettierrc
│   ├── eslint.config.js
│   ├── firestore.rules               # Firestore security rules (per-user + public shares)
│   ├── index.html
│   ├── package-lock.json
│   ├── package.json
│   ├── playwright.config.ts
│   ├── postcss.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   ├── tsconfig.node.json
│   ├── vercel.json
│   ├── vite.config.ts
│   └── vitest.config.ts
├── .ai                               # Ogen-ai submodule — the shared source of rules, skills and the ai-sync…
├── .gitignore
├── .gitmodules
├── AGENTS.md                         # The compiled coding rules every AI assistant reads — generated, do not…
├── CLAUDE.md                         # Claude Code's copy of AGENTS.md (generated)
├── GEMINI.md                         # Gemini CLI's copy of AGENTS.md (generated)
├── LICENSE
├── README.md                         # AppMyTrip
├── SECURITY.md                       # Security Policy
└── ai-config.toml                    # Which rule fragments and target tools ai-sync compiles for this repo
```
<!-- END GENERATED TREE -->
