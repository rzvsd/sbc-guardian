import assert from "node:assert/strict";
import { GuardianActionGate, isIrreversibleKind } from "../src/guardian/actions/GuardianActionGate.js";
import { buildActionPreview, ACTION_KINDS } from "../src/guardian/actions/ActionPreviewBuilder.js";
import { createDecisionStore } from "../src/guardian/actions/ActionDecisionStore.js";

const NONCE = "test-nonce-1";

async function makeGate(ttlMs = 5000, now = () => 1000000) {
  return new GuardianActionGate({ sessionNonce: NONCE, now, ttlMs });
}

// 1. happy path: requestDecision -> confirm runs exactly once
{
  const gate = await makeGate();
  const preview = await gate.buildPreview({
    kind: "SBC_SUBMIT",
    summary: "Submit squad?",
    payload: { a: 1 },
    affectedItemIds: ["x"]
  });
  assert.equal(preview.irreversible, true);
  const decision = gate.requestDecision(preview);
  let ran = false;
  const out = await gate.confirm(decision, (p) => {
    ran = true;
    return { ok: true, previewId: p.actionId };
  });
  assert.equal(ran, true);
  assert.equal(out.ok, true);
  assert.equal(out.decisionId, decision.decisionId);
}

// 2. double confirm is rejected (single-use)
{
  const gate = await makeGate();
  const preview = await gate.buildPreview({ kind: "SBC_SUBMIT", summary: "s", payload: {} });
  const decision = gate.requestDecision(preview);
  await gate.confirm(decision, () => ({ ok: true }));
  await assert.rejects(() => gate.confirm(decision, () => ({ ok: true })), /DECISION_ALREADY_USED/);
}

// 3. expiry rejects
{
  let t = 1000000;
  const gate = await makeGate(1000, () => t);
  const preview = await gate.buildPreview({ kind: "SBC_SUBMIT", summary: "s", payload: {} });
  const decision = gate.requestDecision(preview);
  t = 1000000 + 5000;
  await assert.rejects(() => gate.confirm(decision, () => ({})), /DECISION_EXPIRED/);
}

// 4. unknown action kind rejected
await assert.rejects(
  () => buildActionPreview({ kind: "NOPE", summary: "x" }),
  /unknown action kind/
);

// 5. irreversible classification
assert.equal(isIrreversibleKind("MARKET_BUY"), true);
assert.equal(isIrreversibleKind("SBC_ANALYZE"), false);
assert.ok(ACTION_KINDS.includes("SBC_SUBMIT"));

// 6. decision store: session + payload binding
{
  const store = createDecisionStore({ now: () => 1000 });
  const preview = { actionId: "a1", payloadHash: "h1", expiresAt: new Date(5000).toISOString() };
  const decision = store.create(preview, "nonce-A");
  const p = store.consume(decision, "nonce-A", () => 1500);
  assert.equal(p.actionId, "a1");
  // already consumed -> no re-execution even before expiry
  assert.throws(() => store.consume(decision, "nonce-A", () => 2500), /DECISION_ALREADY_USED/);

  const decision2 = store.create(preview, "nonce-A");
  assert.throws(() => store.consume(decision2, "nonce-B"), /DECISION_SESSION_MISMATCH/);
  assert.throws(
    () => store.consume({ ...decision2, payloadHash: "wrong" }, "nonce-A"),
    /DECISION_PAYLOAD_MISMATCH/
  );
  const ok = store.consume(decision2, "nonce-A");
  assert.equal(ok.actionId, "a1");
  assert.throws(() => store.consume(decision2, "nonce-A"), /DECISION_ALREADY_USED/);

  // expiry: an unused decision must fail closed after it expires
  const store2 = createDecisionStore({ now: () => 1000 });
  const expPreview = { actionId: "a2", payloadHash: "h2", expiresAt: new Date(2000).toISOString() };
  const expDecision = store2.create(expPreview, "nonce-A");
  assert.throws(() => store2.consume(expDecision, "nonce-A", () => 2500), /DECISION_EXPIRED/);
}
