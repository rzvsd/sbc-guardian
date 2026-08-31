# Audit 3 — UI adapter and state boundary

Production React receives a single `GuardianUiAdapter` instance. It exposes only state subscription and named
intent methods; the adapter never exposes transport/session tokens, EA objects, mutation executors, or approval
methods. Controller phases are normalized to the public union (`READY` becomes `SBC_DETECTED`; unknown phases
become `INVALID_RESPONSE`). Subscribers are notified synchronously and can unsubscribe. The production overlay
uses this adapter and renders a connecting state until the real controller is attached. Preview-only mock state
remains in `frontend/` and is not imported by the extension entry.
