# OSS Baseline

SBC Guardian is rebuilt from two Open-Source foundations, both with verifiable licenses.

## Primary foundation — FSU FUT Enhancer

- Repository: https://github.com/color8892/fsu-fut-enhancer
- License: MIT
- Pinned commit: `c318f5018c7a3447103158d1cc28b24bfbce1dce`
- Audited version: 26.10.0
- Role: desktop Chrome extension + shared userscript core. This is the ONLY code base the
  new extension is built from. The legacy SBC Guardian application is NOT imported.

## Secondary foundation — Mozilla GeckoView

- Repository: https://github.com/mozilla/geckoview
- License: MPL-2.0
- Role: Android runtime that opens the EA FUT Web App and hosts the built-in FSU
  WebExtension. The Android UI is a thin wrapper, not a port of the old Guardian app.

## Provenance rules

1. New Git root derives from FSU history only.
2. Old Guardian code (admin/, android/, backend/, site/) is archived, never imported.
3. PaLeTools / FUTBIN / EasySBC are used for UX inspiration only — no code, assets, or
   branding are copied without a verifiable OSS license.
4. The full component register (with versions, licenses, and approval) lives in
   `third-party-notices/OSS_REGISTER.json`. The MIT text of FSU is preserved in this repo.

See also: `GECKOVIEW_FEASIBILITY.md`, `DATA_BOUNDARY.md`, `OLD_REPO_IMPORT_MAP.md`.
