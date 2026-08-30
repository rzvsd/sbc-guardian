import assert from "node:assert";
import { createGuardianRuntime, setGuardian } from "../src/guardian/runtime.js";
import { MarketActionService } from "../src/fsu/domain/MarketActionService.js";
import { canonicalize } from "../src/guardian/actions/payloadHash.js";

// Finding #3: payloads actually passed to the call sites contain view/helpers/
// controller/callbacks (non-serializable). The confirmation DTO must be a small,
// serializable, hash-safe projection; the runtime context is bound internally
// and never enters the hash or the public surface.

// canonicalize must survive circular references (no stack overflow).
{
  const a = {};
  a.self = a;
  let threw = false;
  let out;
  try {
    out = canonicalize(a);
  } catch {
    threw = true;
  }
  assert.equal(threw, false, "canonicalize handles circular references without throwing");
  assert.ok(out && out.self === undefined, "circular reference is dropped to undefined (no infinite recursion)");
  let stringified = false;
  try {
    JSON.stringify(out);
    stringified = true;
  } catch {
    // JSON.stringify must not throw on the canonicalized (cycle-safe) form.
  }
  assert.equal(stringified, true, "canonicalized circular form is JSON-safe");
}

// canonicalize drops functions.
{
  const out = canonicalize({ a: 1, fn: () => 42, nested: { b: 2, fn2: () => 1 } });
  const text = JSON.stringify(out);
  assert.equal(text.includes("fn"), false, "functions are dropped from the canonical form");
}

// The DTO given to the executor is primitives-only; the functions/circular
// runtime context is bound internally and never hashed or exposed.
{
  const g = createGuardianRuntime({ sessionNonce: "dto", mutations: {} });
  setGuardian(g);
  g.defaultPreviewHandler = (p, c) => c.approve();
  let capturedP = null;
  let capturedCtx = null;
  g.registerMutation("MARKET_BUY", (_p, _pv, ctx) => {
    capturedP = _p;
    capturedCtx = ctx;
    return { ok: true };
  });
  const service = new MarketActionService();
  const helpers = { ea: {}, showLoader() {}, hideLoader() {}, getCachePrice: () => ({ num: 2_000 }) };
  helpers.self = helpers; // circular
  await service.buyPlayer({ defId: 99 }, null, helpers);

  assert.ok(capturedP && typeof capturedP === "object", "executor received a DTO");
  assert.equal(capturedP.defId, 99, "DTO carries the primitive identity");
  assert.equal("helpers" in capturedP, false, "DTO must not contain helpers");
  assert.equal("view" in capturedP, false, "DTO must not contain view");
  assert.equal("controller" in capturedP, false, "DTO must not contain controller");
  assert.equal(JSON.stringify(capturedP).includes("function"), false, "DTO has no functions in its serialized form");
  // The runtime context (functions + circular ref) is bound internally only.
  assert.ok(capturedCtx && capturedCtx.helpers === helpers, "context carries the runtime helpers (internal only)");
}

// Modifying the runtime context after the preview cannot change the confirmed
// operation: the operation identity is pinned to the hash-safe DTO.
{
  const g = createGuardianRuntime({ sessionNonce: "dto3", mutations: {} });
  setGuardian(g);
  let capturedP = null;
  g.registerMutation("MARKET_BUY", (_p) => {
    capturedP = _p;
    return { ok: true };
  });
  const prepared = [];
  const origPrepare = g.prepare.bind(g);
  g.prepare = async (kind, payload, opts) => {
    prepared.push(payload);
    return origPrepare(kind, payload, opts);
  };
  g.defaultPreviewHandler = (p, c) => c.approve();
  const service = new MarketActionService();
  const helpers = { ea: {}, getCachePrice: () => ({ num: 2_000 }) };
  await service.buyPlayer({ defId: 5 }, null, helpers);
  assert.equal(prepared[0].defId, 5, "prepared DTO reflects call-time identity");
  helpers.ea = { hijacked: true };
  assert.equal(prepared[0].defId, 5, "mutating context after preview does not change the confirmed DTO");
  assert.equal(capturedP.defId, 5, "executor ran with the confirmed DTO");
}

// A page that holds a reference to the payload and mutates it after preview is
// rejected by the facade (GUARDIAN_PAYLOAD_MISMATCH).
{
  const g = createGuardianRuntime({ sessionNonce: "mismatch", mutations: {} });
  setGuardian(g);
  g.registerMutation("MARKET_BUY", () => ({ ok: true }));
  const payload = { defId: 1 };
  await assert.rejects(
    () =>
      g.requestGuarded("MARKET_BUY", payload, {
        onPreview: (preview, controls) => {
          payload.defId = 999; // tamper the same object after preview
          controls.approve(); // runs the internal execute path (hash is re-checked)
        }
      }),
    /GUARDIAN_PAYLOAD_MISMATCH/
  );
}

setGuardian(null);
console.log("guardian-payload-safety (Finding #3): all assertions passed");
