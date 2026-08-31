# Audit 6 — FC27 Streamlined contract

The extension now has a strict Streamlined response validator and an explicit `/api/v2/solve/streamlined`
client method. Responses must declare FC27 and a ruleset version; malformed or cross-edition responses fail closed.
The existing FC26 capture path remains unchanged. Full FC27 runtime capture/strategy wiring is intentionally the
next implementation slice once an FC27 snapshot adapter is available; no FC26 data is sent to the Streamlined
endpoint.
