import assert from "node:assert";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createGuardianRuntime, GuardianRuntimeError } from "../src/guardian/runtime.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const autoApprove = (preview, controls) => controls.approve();
const autoDismiss = (preview, controls) => controls.dismiss();

// 9. Kinds WITH a REAL FSU call site route through the facade and run their own
//    executor. The 4 rerouted kinds are: MARKET_BUY, MARKET_LIST, PACK_OPEN
//    (two call sites), SBC_SUBMIT. SBC_APPLY and BATCH_ACTION are guarded by the
//    facade (defense in depth / capability) but have NO FSU call site, so they
//    are reported NOT_APPLICABLE (see static checks below) — NOT "all 6 route".
{
  const calls = [];
  const make = (kind) => async (payload) => {
    calls.push(kind);
    return { kind, payload };
  };
  const f = createGuardianRuntime({
    sessionNonce: "kinds",
    mutations: {
      SBC_APPLY: make("SBC_APPLY"),
      SBC_SUBMIT: make("SBC_SUBMIT"),
      MARKET_BUY: make("MARKET_BUY"),
      MARKET_LIST: make("MARKET_LIST"),
      PACK_OPEN: make("PACK_OPEN"),
      BATCH_ACTION: make("BATCH_ACTION")
    }
  });
  // Only the 4 kinds that FSU actually reroutes.
  const routed = ["SBC_SUBMIT", "MARKET_BUY", "MARKET_LIST", "PACK_OPEN"];
  for (const kind of routed) {
    const out = await f.requestGuarded(kind, { id: kind }, { onPreview: autoApprove });
    assert.equal(out.ok, true);
    assert.equal(calls[calls.length - 1], kind, `${kind} executed its own executor`);
  }
  assert.equal(calls.length, 4, "exactly the 4 rerouted kinds executed");

  // SBC_APPLY and BATCH_ACTION executors ARE guarded (run via requestGuarded)...
  const applyOut = await f.requestGuarded("SBC_APPLY", { id: "apply" }, { onPreview: autoApprove });
  assert.equal(applyOut.ok, true, "SBC_APPLY executor is guarded by the facade");
  const batchOut = await f.requestGuarded("BATCH_ACTION", { actions: [] }, { onPreview: autoApprove });
  assert.equal(batchOut.ok, true, "BATCH_ACTION executor is guarded by the facade");

  // ...but NEITHER has an FSU call site. Static proof: no file under src/fsu
  // references them, so they are NOT rerouted -> NOT_APPLICABLE.
  const fsuDir = path.join(root, "src", "fsu");
  const files = fs.readdirSync(fsuDir, { recursive: true }).filter((f) => String(f).endsWith(".js"));
  let sbcApplyRefs = 0;
  let batchRefs = 0;
  for (const rel of files) {
    const src = fs.readFileSync(path.join(fsuDir, rel), "utf8");
    if (src.includes("SBC_APPLY")) sbcApplyRefs++;
    if (src.includes("BATCH_ACTION")) batchRefs++;
  }
  assert.equal(sbcApplyRefs, 0, "SBC_APPLY has NO FSU call site (NOT_APPLICABLE, not 'routed')");
  assert.equal(batchRefs, 0, "BATCH_ACTION has NO FSU call site (NOT_APPLICABLE, not 'routed')");
}

// 9b. BATCH_ACTION hardening: the preview's payload hash covers the full ordered
//     sub-action list, so add/remove/reorder/modify after preview is rejected;
//     an unregistered sub-kind yields zero batch execution; mid-failure => no retry.
{
  const subCalls = [];
  const f = createGuardianRuntime({
    sessionNonce: "batch",
    mutations: {
      SBC_APPLY: async (_p) => {
        subCalls.push("SBC_APPLY");
        return "a";
      },
      MARKET_BUY: async (_p) => {
        subCalls.push("MARKET_BUY");
        return "b";
      }
    }
  });
  f.registerMutation("BATCH_ACTION", async (p) => {
    const actions = (p && p.actions) || [];
    for (const sub of actions) {
      if (!f.isRegistered(sub.kind)) {
        throw new GuardianRuntimeError("GUARDIAN_UNKNOWN_MUTATION:" + String(sub.kind));
      }
    }
    const results = [];
    for (const sub of actions) {
      results.push(await f.runRegistered(sub.kind, sub.payload));
    }
    return results;
  });

  // Add a sub-action AFTER preview -> payload hash mismatch.
  const base = {
    actions: [
      { kind: "SBC_APPLY", payload: { id: 1 } },
      { kind: "MARKET_BUY", payload: { id: 2 } }
    ]
  };
  await assert.rejects(
    () =>
      f.requestGuarded("BATCH_ACTION", base, {
        onPreview: (preview, controls) => {
          base.actions.push({ kind: "SBC_APPLY", payload: { id: 99 } });
          controls.approve();
        }
      }),
    /GUARDIAN_PAYLOAD_MISMATCH/
  );
  assert.equal(subCalls.length, 0, "BATCH_ACTION: tampered payload => zero sub-execution");

  // Unregistered sub-kind => zero batch execution.
  const unreg = { actions: [{ kind: "GHOST", payload: {} }] };
  await assert.rejects(
    () => f.requestGuarded("BATCH_ACTION", unreg, { onPreview: autoApprove }),
    /GUARDIAN_UNKNOWN_MUTATION/
  );
  assert.equal(subCalls.length, 0, "BATCH_ACTION: unregistered sub-kind => zero batch");

  // Valid batch runs each sub-action exactly once, in order.
  const ok = {
    actions: [
      { kind: "SBC_APPLY", payload: { id: 1 } },
      { kind: "MARKET_BUY", payload: { id: 2 } }
    ]
  };
  const out = await f.requestGuarded("BATCH_ACTION", ok, { onPreview: autoApprove });
  assert.equal(out.ok, true);
  assert.deepEqual(subCalls, ["SBC_APPLY", "MARKET_BUY"], "batch runs sub-actions in order, once each");

  // Mid-failure => no retry and no later sub-action runs.
  const subCalls2 = [];
  const f2 = createGuardianRuntime({
    sessionNonce: "batch2",
    mutations: {
      SBC_APPLY: async () => {
        throw new Error("SUB_FAIL");
      },
      MARKET_BUY: async (_p) => {
        subCalls2.push("MARKET_BUY");
        return "b";
      }
    }
  });
  f2.registerMutation("BATCH_ACTION", async (p) => {
    const actions = (p && p.actions) || [];
    for (const sub of actions) {
      if (!f2.isRegistered(sub.kind)) {
        throw new GuardianRuntimeError("GUARDIAN_UNKNOWN_MUTATION:" + String(sub.kind));
      }
    }
    const results = [];
    for (const sub of actions) {
      results.push(await f2.runRegistered(sub.kind, sub.payload));
    }
    return results;
  });
  const bad = {
    actions: [
      { kind: "SBC_APPLY", payload: {} },
      { kind: "MARKET_BUY", payload: { id: 2 } }
    ]
  };
  await assert.rejects(
    () => f2.requestGuarded("BATCH_ACTION", bad, { onPreview: autoApprove }),
    /SUB_FAIL/
  );
  assert.equal(subCalls2.length, 0, "BATCH_ACTION: mid-failure => no retry, no later sub-action");
}

// 10. Boundary: public API surface is requestGuarded + read-only diagnostics
//     ONLY. No registerMutations / approve / prepare / execute / executor refs.
{
  // requestGuarded without a confirmation UI emits no token and runs no mutation.
  const f = createGuardianRuntime({ sessionNonce: "bnd", mutations: { SBC_SUBMIT: async () => ({}) } });
  let executed = false;
  f.originals.set("SBC_SUBMIT", async () => {
    executed = true;
    return { ok: true };
  });
  await assert.rejects(
    () => f.requestGuarded("SBC_SUBMIT", { id: 1 }), // no onPreview, no default handler
    /GUARDIAN_NO_CONFIRMATION_UI/
  );
  assert.equal(executed, false, "no mutation without UI confirmation");

  // index.js must not expose any token-minting or registration surface.
  const indexSrc = fs.readFileSync(path.join(root, "src/guardian/index.js"), "utf8");
  assert.ok(!/export\s+function\s+approve/.test(indexSrc), "index.js must not export approve()");
  assert.ok(!/export\s+function\s+prepare/.test(indexSrc), "index.js must not export prepare()");
  assert.ok(!/export\s+function\s+execute/.test(indexSrc), "index.js must not export execute()");
  assert.ok(!/registerMutations:/.test(indexSrc), "index.js must not expose registerMutations public property");
  assert.ok(/export\s+function\s+mountGuardian/.test(indexSrc));
  assert.ok(/export\s+function\s+getGuardian/.test(indexSrc));

  // FSU public method must delegate to guardian, not call the EA adapter itself.
  const mkt = fs.readFileSync(path.join(root, "src/fsu/domain/MarketActionService.js"), "utf8");
  const buyStart = mkt.indexOf("async buyPlayer");
  const buyImpl = mkt.indexOf("async _buyPlayerImpl");
  const segment = mkt.slice(buyStart, buyImpl);
  assert.ok(segment.includes("guardianOrFailClosed"), "buyPlayer delegates to guardian");
  assert.ok(!segment.includes("purchaseItemToClub"), "buyPlayer public method does not call EA adapter directly");
}

// 11. Integration with fake EA adapters for SBC submit / buy / list / pack open.
{
  const adapters = {
    sbcSubmit: async (payload) => ({ submitted: true, challenge: payload.args }),
    buy: async (payload) => ({ bought: true, defId: payload.player }),
    list: async (payload) => ({ listed: true, item: payload.item }),
    packOpen: async (payload) => ({ opened: true, packId: payload.packId })
  };
  const f = createGuardianRuntime({
    sessionNonce: "integ",
    mutations: {
      SBC_SUBMIT: (p) => adapters.sbcSubmit(p),
      MARKET_BUY: (p) => adapters.buy(p),
      MARKET_LIST: (p) => adapters.list(p),
      PACK_OPEN: (p) => adapters.packOpen(p)
    }
  });

  const submit = await f.requestGuarded(
    "SBC_SUBMIT",
    { args: { id: 5 }, observerContext: {}, invoke: () => {}, onSuccess: () => {}, onDiagnostic: () => {} },
    { onPreview: autoApprove }
  );
  assert.equal(submit.result.submitted, true);

  const buy = await f.requestGuarded("MARKET_BUY", { player: 123 }, { onPreview: autoApprove });
  assert.equal(buy.result.bought, true);

  const list = await f.requestGuarded("MARKET_LIST", { item: 9 }, { onPreview: autoApprove });
  assert.equal(list.result.listed, true);

  const pack = await f.requestGuarded("PACK_OPEN", { packId: 7 }, { onPreview: autoApprove });
  assert.equal(pack.result.opened, true);

  // payload tampering mid-flight is detected even through requestGuarded
  const payload = { player: 555 };
  await assert.rejects(
    (async () => {
      return f.requestGuarded("MARKET_BUY", payload, {
        onPreview: (preview, controls) => {
          payload.player = 999; // mutate after preview
          controls.approve();
        }
      });
    })(),
    /GUARDIAN_PAYLOAD_MISMATCH/
  );

  // dismiss -> zero mutation (pack adapter not called)
  let packCalled = false;
  f.originals.set("PACK_OPEN", async (p) => {
    packCalled = true;
    return adapters.packOpen(p);
  });
  await assert.rejects(
    () => f.requestGuarded("PACK_OPEN", { packId: 1 }, { onPreview: autoDismiss }),
    /GUARDIAN_DISMISSED/
  );
  assert.equal(packCalled, false, "dismiss ran zero mutations");
}

// 12. Bundle/package smoke confirms Guardian is included.
{
  const userscript = fs.readFileSync(path.join(root, "src/userscript.js"), "utf8");
  assert.ok(userscript.includes("GuardianMutationFacade"));
  assert.ok(userscript.includes("requestGuarded"));
  assert.ok(userscript.includes("GUARDIAN_KIND_MISMATCH"));
  assert.ok(userscript.includes("mountGuardian"));
}

console.log("guardian-facade: all assertions passed");
