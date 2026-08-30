# Old Repo Import Map

This document tracks what (if anything) is imported from the archived legacy SBC Guardian
(`_SBCGuardian-legacy-archive/2026-08-27/repos/SBCGuardian`). Per the architecture rules, old
code is NOT a foundation; only specific, license-clean capabilities are ported selectively.

| Legacy area | Decision | Target milestone | Notes |
|-------------|----------|-----------------|-------|
| Solvers (SBC solve logic) | IMPORT SELECTIVELY | M3/M5 | Re-implement against FSU domain services; no UI port. |
| Guardian panel/UX | REIMPLEMENT | M2 | New UX is English-first + Romanian; old screens (Club/Solve/Guardian/Me) are dropped. |
| Auth0 roles/accounts | IMPORT SELECTIVELY | M4 | Only role model + config; no old account data. |
| Useful reference data (SBC sets, ratings) | IMPORT AS DATA | M3 | Normalized, no code. |
| admin/ backend | NOT IMPORTED | — | New backend (M3) is greenfield, API v2, PostgreSQL. |
| android/ old app | NOT IMPORTED | — | Replaced by `android-wrapper/` GeckoView skeleton. |
| site/ | NOT IMPORTED (archived) | — | Archived only; not built. NOTE: `site/` was not present in the archive at M0 — see M0 report. |
| extension/ old | NOT IMPORTED | — | FSU is the extension base, not the old extension. |

Any import must preserve its original license and be recorded in
`third-party-notices/OSS_REGISTER.json` if it carries a third-party dependency.
