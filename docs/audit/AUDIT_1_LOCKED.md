# Audit 1 — Absolute locked-item protection

Date: 2026-08-31

## Repair

- Traditional CP-SAT now excludes `locked` items instead of forcing them into a squad.
- Streamlined excludes `locked` items from its candidate pool.
- API selection validation rejects a solver result containing a locked item.
- The parity test now asserts locked and excluded items are absent; a dedicated Streamlined regression covers a high-point locked item.

## Gates

- Backend: 100 passed; Ruff clean.
- Extension: all tests passed; lint clean; typecheck clean.
- Android: not rerun in this session because the environment still has no JDK/`JAVA_HOME`.
