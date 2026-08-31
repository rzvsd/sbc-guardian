# Audit 0 — Baseline reproductibil

Date: 2026-08-31

Baseline commit: `5dd04cce7c89b96bb082404afb441d73d407dc08`
Branch: `codex/react-overlay-integration`

## Verificări

- Frontend: `npm test`, temporary-output Vite build, `npm audit` — green; 0 vulnerabilities.
- Extension: `npm test`, `npm run lint`, `npm run typecheck`, `npm run package:all` — green.
- Backend: `python -m pytest -q` — 99 passed; `ruff check src tests migrations` — green.
- Android: blocked in this environment; JDK/`JAVA_HOME` and `java` are unavailable. No Android claim is made.
- `git diff --check` — green.

## Stabilizări

- Extension packaging accepts an explicit temporary output directory through `FSU_DIST_DIR`.
- Bundle tests package into a unique temporary directory and clean it after inspection, without deleting the repository ZIP.
- Frontend has a committed `package-lock.json` and a minimal `npm test` runner.
- Vite was upgraded to a version without the previously reported development-server advisories and is bound to localhost.
