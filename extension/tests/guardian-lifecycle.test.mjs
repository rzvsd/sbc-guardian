import assert from "node:assert";
import { createGuardianRuntime } from "../src/guardian/runtime.js";

function clean(facade, label) {
  assert.deepEqual(
    facade.getLifecycleDiagnostics(),
    { pending: 0, contexts: 0, timers: 0 },
    label
  );
}

export async function runGuardianLifecycleTests() {
{
  const f = createGuardianRuntime({ sessionNonce: "success", mutations: { MARKET_BUY: () => true } });
  f.defaultPreviewHandler = (_p, c) => c.approve();
  await f.requestGuarded("MARKET_BUY", { defId: 1 }, { context: { helper: true } });
  clean(f, "success cleans lifecycle state");
}

{
  const f = createGuardianRuntime({ sessionNonce: "dismiss", mutations: { MARKET_BUY: () => true } });
  f.defaultPreviewHandler = (_p, c) => c.dismiss();
  await assert.rejects(() => f.requestGuarded("MARKET_BUY", { defId: 1 }, { context: {} }), /GUARDIAN_DISMISSED/);
  clean(f, "dismiss cleans lifecycle state");
}

{
  const f = createGuardianRuntime({ sessionNonce: "failure", mutations: { MARKET_BUY: () => { throw new Error("executor-failed"); } } });
  f.defaultPreviewHandler = (_p, c) => c.approve();
  await assert.rejects(() => f.requestGuarded("MARKET_BUY", { defId: 1 }, { context: {} }), /executor-failed/);
  clean(f, "executor failure cleans lifecycle state");
}

{
  const f = createGuardianRuntime({ sessionNonce: "mismatch", mutations: { MARKET_BUY: () => true } });
  const dto = { defId: 1 };
  f.defaultPreviewHandler = (_p, c) => { dto.defId = 2; c.approve(); };
  await assert.rejects(() => f.requestGuarded("MARKET_BUY", dto, { context: {} }), /GUARDIAN_PAYLOAD_MISMATCH/);
  clean(f, "payload mismatch cleans lifecycle state");
}

{
  const f = createGuardianRuntime({ sessionNonce: "handler", mutations: { MARKET_BUY: () => true } });
  f.defaultPreviewHandler = () => { throw new Error("handler-failed"); };
  await assert.rejects(() => f.requestGuarded("MARKET_BUY", { defId: 1 }, { context: {} }), /handler-failed/);
  clean(f, "handler failure cleans lifecycle state");
}

{
  let uiCleanups = 0;
  const f = createGuardianRuntime({ sessionNonce: "expiry", ttlMs: 5, mutations: { MARKET_BUY: () => true } });
  f.defaultPreviewHandler = () => () => { uiCleanups++; };
  await assert.rejects(() => f.requestGuarded("MARKET_BUY", { defId: 1 }, { context: {} }), /GUARDIAN_DECISION_EXPIRED/);
  clean(f, "expiry cleans lifecycle state");
  assert.equal(uiCleanups, 1, "expiry disposes UI exactly once");
}

console.log("guardian-lifecycle: all assertions passed");
}
