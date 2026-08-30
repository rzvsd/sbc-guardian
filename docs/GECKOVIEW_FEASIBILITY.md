# GeckoView Feasibility

Goal (M1): prove early that FSU can be the product base in **both** Chrome and GeckoView,
before any backend migration.

## What is in place at M1

- `manifest.gecko.json` — Firefox/GeckoView MV3 manifest with `background.scripts`
  (not `service_worker`) and `browser_specific_settings.gecko.id`.
- `src/background-gecko.js` — thin Gecko entry that loads the shared core and registers
  against the `browser.*` namespace.
- `src/platform/background-core.js` — API-agnostic request/sender policy core, reused by
  both Chrome and Gecko entries (no fork of FSU core for Gecko).
- `src/platform/webextension-api.js` — `chrome.*`/`browser.*` adapter.
- `shared-contracts/native-bridge/` — envelope + validator shared with the Android wrapper.
- `android-wrapper/` — new Android project skeleton (GeckoView host).

## Feasibility spike (M1 §8) — status

| # | Check | Status |
|---|-------|--------|
| 1 | GeckoView starts | NOT VERIFIED (no Android SDK in build env) |
| 2 | Opens EA Web App | NOT VERIFIED |
| 3 | User authenticates to EA directly | NOT VERIFIED (by design: EA creds never leave device) |
| 4 | Built-in WebExtension installs | NOT VERIFIED (skeleton only) |
| 5 | FSU detects Web App | NOT VERIFIED |
| 6 | FSU panel appears | NOT VERIFIED |
| 7 | Reads an SBC without mutating | NOT VERIFIED |
| 8 | Restart keeps Gecko cookies | NOT VERIFIED |
| 9 | EA logout works | NOT VERIFIED |
| 10 | No EA cookie/token in logs or traffic to Guardian | DESIGN ENFORCED (see DATA_BOUNDARY); runtime not verified |

## Stop / kill gate (M1 §stop)

Rebuild does NOT proceed if: GeckoView cannot run the EA Web App; built-in extension is not
stable; FSU needs a major fork for Gecko; FSU sends EA tokens off-device; the package is not
reproducibly built; or upstream FSU tests cannot be returned to green.

At M1, the **code** gate is satisfied: manifests validate, packaging is reproducible via
`adm-zip`, and upstream FSU tests stay green. The **runtime** gate (items 1–10) requires an
Android device/emulator with GeckoView and is out of scope for this environment.

Next: M2 wires the Guardian UX and shared contracts; the Android spike is executed on real
hardware before M5 (FC26 beta).
