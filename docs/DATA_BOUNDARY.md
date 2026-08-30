# Data Boundary

Hard invariant: EA credentials, cookies, `X-UT-SID`, and EA session tokens **never leave the
browser/GeckoView runtime**. The cloud receives only normalized snapshots.

## On-device (trusted)

- EA login session (cookies, `X-UT-SID`, tokens) — stays inside Chrome/GeckoView profile.
- FSU background request policy (allow-listed read-only endpoints, `credentials: "omit"`).
- Native bridge `sessionNonce` — random per app session, regenerated each launch.

## Off-device (cloud / Guardian backend)

- Only normalized snapshots: e.g. an SBC's required players/ratings, a solver result, a
  price snapshot (optional), a capability flag. Never raw cookies or `X-UT-SID`.
- Every payload is validated against `shared-contracts/native-bridge/envelope.schema.json`
  and rejected fail-closed on unknown `protocolVersion`, unknown `type`, or stale `sessionNonce`.

## Irreversible actions

No EA mutation (submit, list, trade) runs without an explicit user confirmation
(`ACTION_PREVIEW` → `ACTION_DECISION` → `ACTION_RESULT`). There is no hidden auto-submit.

## Logging

No EA cookie/token is written to logs, crash reports, or outbound traffic. The package smoke
test (`scripts/package-smoke.cjs`) rejects archives containing `cookie`, `session`, or
`X-UT-SID` substrings as a build-time guard.
