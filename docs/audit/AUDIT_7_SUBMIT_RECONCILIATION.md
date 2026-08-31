# Audit 7 — Submit confirmation reconciliation

Fixed the native Gecko confirmation cleanup key: decisions are looked up by `requestId`, so the same key is now
removed after a valid response. This prevents stale confirmation entries and duplicate resolution attempts. The EA
submit interceptor remains the single mutation owner; React has no direct EA submit path. Full end-to-end browser
reconciliation (EA success followed by backend confirm/offline resume) remains a runtime gate for the final audit.
