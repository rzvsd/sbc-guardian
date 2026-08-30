# SBC Guardian — Mobile UI/UX Prototype

## Original Problem Statement
Build the complete mobile UI/UX for an Android-first app "SBC Guardian" — a calm, intelligent co-pilot for EA Sports FC Ultimate Team players that helps complete SBCs while protecting valuable players. UI/UX-only prototype with mock data; the real Guardian Android harness, EA integration, solver backend and Guardian Cloud are external systems to be integrated later. Core principles: one dominant action per screen, contextual ⓘ explanations, "why" transparency (selected/avoided/protected/warned), progressive disclosure, premium dark jade design, no AI branding, no technical jargon.

## User Choices
- Mobile-first React web app (not Expo) for instant preview
- EA FC tab = clearly mocked EA-style scenery (production will wrap the real EA FC Web App); Guardian overlay is the design focus
- Deep jade accent with subtle mint highlights
- All 22 prototype states in v1

## Architecture
- `/app/frontend` — Vite + React 18 + Tailwind + framer-motion + @phosphor-icons. Port 3000 via supervisor (`yarn start` → vite).
- `/app/backend` — minimal FastAPI health endpoint (`GET /api/`). No real backend by design (ALL DATA MOCKED).
- Existing repo (`extension/`, `android-wrapper/`, `guardian-cloud/`, `web-portal/`) untouched.
- Mock interfaces in `src/mock/data.js` (SBC, SOLUTION, CLUB); state in `src/state/GuardianContext.jsx` (tab, preset, toggles, scenario, toasts, activity) — designed so real data sources can replace mocks later.

## Implemented (June 2026)
- 3-step onboarding (localStorage flag), Home status/launchpad, EA FC mock + floating Guardian pill + bottom-sheet flow (detected → staged finding → solution summary → player review with why/avoided/risk explanations → apply → destructive submit confirmation → success), Protection presets + auto-protect toggles + collapsed advanced settings, Profile with Prototype Scenarios switcher (normal / noSolution / clubChanged / connectionError / offline), contextual ⓘ InfoSheet system (3 explanation types), toasts, all error/empty/offline states.
- Testing agent iteration_1: 100% pass (frontend + backend health).

## Backlog / Next
- P1: Multiple SBC challenges list & detection variety (different requirements/rewards)
- P1: Manual player lock management screen (currently "12 locked" static)
- P2: Confetti/stronger celebration on completing a full SBC group
- P2: Haptic-style micro-feedback, swipe-to-dismiss sheets
- P2: Port UI to actual React Native/Expo when connecting to real Guardian harness
