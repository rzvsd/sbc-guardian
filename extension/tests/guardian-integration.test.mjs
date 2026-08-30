import assert from "node:assert";
import { createGuardianRuntime, GuardianRuntimeError } from "../src/guardian/runtime.js";

// All irreversible FSU mutations run ONLY through the facade. The low-level
// executors are captured in the facade closure and are never exposed; the only
// public entry is requestGuarded(), which requires a UI confirmation to mint a
// token. These tests prove the critical Action Guard defects are closed.

let calls = [];
const exec = async (payload) => {
  calls.push(payload);
  return { done: true, payload };
};
const execThrow = async () => {
  calls.push("attempt");
  throw new Error("EA_DOWN");
};

function makeFacade(nonce) {
  return createGuardianRuntime({
    sessionNonce: nonce,
    mutations: {
      SBC_SUBMIT: exec,
      MARKET_BUY: exec,
      MARKET_LIST: exec,
      PACK_OPEN: exec,
      SBC_APPLY: exec,
      BATCH_ACTION: exec
    }
  });
}

// 1. A token minted for SBC_SUBMIT cannot be used at MARKET_BUY.
{
  const f = makeFacade("n1");
  const preview = await f.prepare("SBC_SUBMIT", { id: 1 });
  const decision = f.approve(preview.actionId);
  await assert.rejects(
    () => f.execute("MARKET_BUY", { id: 1 }, decision),
    /GUARDIAN_KIND_MISMATCH/
  );
  assert.equal(calls.length, 0, "no mutation executed on kind mismatch");
}

// 2. Confirmed payload different from executed payload -> reject.
{
  calls = [];
  const f = makeFacade("n2");
  const preview = await f.prepare("SBC_SUBMIT", { id: 1, price: 1000 });
  const decision = f.approve(preview.actionId);
  await assert.rejects(
    () => f.execute("SBC_SUBMIT", { id: 1, price: 9999 }, decision),
    /GUARDIAN_PAYLOAD_MISMATCH/
  );
  assert.equal(calls.length, 0);
}

// 3. Payload mutated after preview -> reject.
{
  calls = [];
  const f = makeFacade("n3");
  const payload = { id: 1, price: 1000 };
  const preview = await f.prepare("SBC_SUBMIT", payload);
  payload.price = 5000; // mutate after preview
  const decision = f.approve(preview.actionId);
  await assert.rejects(
    () => f.execute("SBC_SUBMIT", payload, decision),
    /GUARDIAN_PAYLOAD_MISMATCH/
  );
  assert.equal(calls.length, 0);
}

// 4. prepare() without confirm -> execute rejects (no token emitted).
{
  calls = [];
  const f = makeFacade("n4");
  const preview = await f.prepare("SBC_SUBMIT", { id: 1 }); // no token here
  assert.ok(!("decisionId" in preview), "prepare returns no decision token");
  await assert.rejects(
    () => f.execute("SBC_SUBMIT", { id: 1 }, /** @type {any} */ (null)),
    GuardianRuntimeError
  );
  assert.equal(calls.length, 0);
}

// 5. dismiss -> zero tokens, zero mutations.
{
  calls = [];
  const f = makeFacade("n5");
  const preview = await f.prepare("SBC_SUBMIT", { id: 1 });
  f.dismiss(preview.actionId);
  assert.throws(() => f.approve(preview.actionId), /GUARDIAN_NO_PENDING/);
  assert.equal(calls.length, 0, "dismiss produced no token and no mutation");
}

// 6. forged / expired / reused / wrong-session tokens all rejected.
{
  calls = [];
  const fa = makeFacade("n6a");
  const fb = makeFacade("n6b"); // different session
  const preview = await fa.prepare("SBC_SUBMIT", { id: 1 });
  const decision = fa.approve(preview.actionId);

  await assert.rejects(() => fa.execute("SBC_SUBMIT", { id: 1 }, { decisionId: "forged" }), /DECISION_/);
  // A token minted under a different facade/session is rejected. With separate
  // per-session decision stores this surfaces as DECISION_UNKNOWN; the security
  // property (cross-session tokens never execute) holds either way.
  await assert.rejects(() => fb.execute("SBC_SUBMIT", { id: 1 }, decision), /DECISION_(SESSION_MISMATCH|UNKNOWN)/);
  const first = await fa.execute("SBC_SUBMIT", { id: 1 }, decision);
  assert.equal(first.ok, true);
  await assert.rejects(() => fa.execute("SBC_SUBMIT", { id: 1 }, decision), /DECISION_ALREADY_USED/);

  // expiry
  let clock = 1000;
  const fExp = createGuardianRuntime({
    sessionNonce: "exp",
    now: () => clock,
    ttlMs: 100,
    mutations: { SBC_SUBMIT: exec }
  });
  const pExp = await fExp.prepare("SBC_SUBMIT", { id: 1 });
  const dExp = fExp.approve(pExp.actionId);
  clock = 2000; // advance past the 1100 expiry
  await assert.rejects(() => fExp.execute("SBC_SUBMIT", { id: 1 }, dExp), /DECISION_EXPIRED/);
  assert.equal(calls.length, 1, "only the valid first execution ran");
}

// 7. Double confirm (double-click Accept) -> exactly one mutation.
{
  calls = [];
  const f = makeFacade("n7");
  const preview = await f.prepare("SBC_SUBMIT", { id: 1 });
  const decision = f.approve(preview.actionId); // single token minted
  assert.throws(() => f.approve(preview.actionId), /GUARDIAN_NO_PENDING/, "second approve yields no token");
  const out = await f.execute("SBC_SUBMIT", { id: 1 }, decision);
  assert.equal(out.ok, true);
  await assert.rejects(() => f.execute("SBC_SUBMIT", { id: 1 }, decision), /DECISION_ALREADY_USED/);
  assert.equal(calls.length, 1, "exactly one mutation executed");
}

// 8. Executor failure -> no automatic retry.
{
  calls = [];
  const f = createGuardianRuntime({ sessionNonce: "n8", mutations: { SBC_SUBMIT: execThrow } });
  const preview = await f.prepare("SBC_SUBMIT", { id: 1 });
  const decision = f.approve(preview.actionId);
  await assert.rejects(() => f.execute("SBC_SUBMIT", { id: 1 }, decision));
  assert.equal(calls.length, 1, "executor attempted exactly once, no retry");
}

console.log("guardian-integration (protocol): all assertions passed");
