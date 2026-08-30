import assert from "node:assert";
import { createGuardianRuntime, setGuardian } from "../src/guardian/runtime.js";
import { setLegacyFallbackForTests } from "../src/guardian/mode.js";
import { MarketActionService } from "../src/fsu/domain/MarketActionService.js";
import { StorePackOpenTransactionService } from "../src/fsu/domain/StorePackOpenTransactionService.js";
import { SbcSubmitTransactionService } from "../src/fsu/domain/SbcSubmitTransactionService.js";
import { BulkPackOpenService } from "../src/fsu/domain/BulkPackOpenService.js";

// Negative / fail-closed proof for the four rerouted irreversible services.
// With no Guardian (or Guardian mounted but kind not registered, or no UI
// handler, or Guardian throwing) every service MUST fail closed:
//   GUARDIAN_UNAVAILABLE / GUARDIAN_NO_CONFIRMATION_UI, ZERO adapter calls,
//   ZERO legacy fallback.

function makeSpy() {
  const calls = [];
  const proxy = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "calls") return calls;
        return (...args) => {
          calls.push({ prop, args });
          return proxy;
        };
      }
    }
  );
  return proxy;
}

function makeFacade(sessionNonce = "fc") {
  return createGuardianRuntime({ sessionNonce, mutations: {} });
}

// ---- MARKET_BUY ----
{
  setLegacyFallbackForTests(false);
  setGuardian(null);
  const ea = makeSpy();
  const service = new MarketActionService();
  const helpers = {
    getInfo: () => ({ base: { sId: "s" } }),
    getCachePrice: () => ({ num: 2_000 }),
    notice: () => {},
    ea,
    getCurrentController: () => ({})
  };

  // 1. Guardian absent => GUARDIAN_UNAVAILABLE, zero adapter calls.
  await assert.rejects(
    () => service.buyPlayer(123, null, helpers),
    /GUARDIAN_UNAVAILABLE/
  );
  assert.equal(ea.calls.length, 0, "MARKET_BUY: no EA adapter call when Guardian absent");

  // 2. Guardian mounted but MARKET_BUY not registered (late mount/registration).
  const f1 = makeFacade("fc1");
  setGuardian(f1);
  await assert.rejects(
    () => service.buyPlayer(123, null, helpers),
    /GUARDIAN_UNAVAILABLE/
  );
  assert.equal(ea.calls.length, 0, "MARKET_BUY: no EA adapter call when kind unregistered");

  // 3. Guardian mounted + registered, but no UI confirmation handler.
  const f2 = makeFacade("fc2");
  setGuardian(f2);
  let executed = false;
  f2.registerMutation("MARKET_BUY", async () => {
    executed = true;
    return { ok: true };
  });
  await assert.rejects(
    () => service.buyPlayer(123, null, helpers),
    /GUARDIAN_NO_CONFIRMATION_UI/
  );
  assert.equal(executed, false, "MARKET_BUY: no mutation without UI confirmation");

  // 4. Guardian throws => no mutation, no legacy fallback.
  const f3 = makeFacade("fc3");
  setGuardian(f3);
  f3.registerMutation("MARKET_BUY", async () => {
    executed = true;
    return { ok: true };
  });
  f3.requestGuarded = () => {
    throw new Error("GUARDIAN_BOOM");
  };
  let threw;
  try {
    await service.buyPlayer(123, null, helpers);
  } catch (e) {
    threw = e;
  }
  assert.ok(threw && threw.message === "GUARDIAN_BOOM", "MARKET_BUY: guardian error propagates, no fallback");
  assert.equal(executed, false, "MARKET_BUY: no mutation when Guardian errors");
  assert.equal(ea.calls.length, 0, "MARKET_BUY: no EA adapter call on guardian error");
}

// ---- MARKET_LIST ----
{
  setLegacyFallbackForTests(false);
  setGuardian(null);
  const ea = makeSpy();
  const service = new MarketActionService();
  const helpers = {
    getInfo: () => ({ base: { sId: "s" } }),
    getCachePrice: () => ({ num: 2_000 }),
    notice: () => {},
    ea
  };

  await assert.rejects(
    () => service.playerToAuction("item", 1000, 1, helpers),
    /GUARDIAN_UNAVAILABLE/
  );
  assert.equal(ea.calls.length, 0, "MARKET_LIST: no EA adapter call when Guardian absent");

  const f = makeFacade("fl");
  setGuardian(f);
  let executed = false;
  f.registerMutation("MARKET_LIST", async () => {
    executed = true;
    return {};
  });
  await assert.rejects(
    () => service.playerToAuction("item", 1000, 1, helpers),
    /GUARDIAN_NO_CONFIRMATION_UI/
  );
  assert.equal(executed, false, "MARKET_LIST: no mutation without UI confirmation");
}

// ---- PACK_OPEN (store single) ----
{
  setLegacyFallbackForTests(false);
  setGuardian(null);
  const adapter = {
    calls: [],
    prepare: (...args) => {
      adapter.calls.push(args);
      return {
        success: true,
        data: { tracked: true, key: "pack-key", packId: 1, initialCount: 1 }
      };
    }
  };
  const service = new StorePackOpenTransactionService({ adapter });
  const options = {
    controller: {},
    args: [1],
    invoke: () => "invoked",
    onSuccess: () => {},
    onDiagnostic: () => {}
  };

  assert.throws(() => service.intercept(options), /GUARDIAN_UNAVAILABLE/);
  assert.equal(adapter.calls.length, 0, "PACK_OPEN(store): no adapter call when Guardian absent");

  const f = makeFacade("fs");
  setGuardian(f);
  let executed = false;
  f.registerMutation("PACK_OPEN", async () => {
    executed = true;
    return {};
  });
  await assert.rejects(() => service.intercept(options), /GUARDIAN_NO_CONFIRMATION_UI/);
  assert.equal(executed, false, "PACK_OPEN(store): no mutation without UI confirmation");
}

// ---- PACK_OPEN (bulk) ----
{
  setLegacyFallbackForTests(false);
  setGuardian(null);
  const adapter = makeSpy();
  const service = new BulkPackOpenService({ adapter });

  await assert.rejects(
    () => service.run({ packId: 1, count: 2, context: {} }),
    /GUARDIAN_UNAVAILABLE/
  );
  assert.equal(adapter.calls.length, 0, "PACK_OPEN(bulk): no adapter call when Guardian absent");

  const f = makeFacade("fb");
  setGuardian(f);
  let executed = false;
  f.registerMutation("PACK_OPEN_BULK", async () => {
    executed = true;
    return {};
  });
  await assert.rejects(
    () => service.run({ packId: 1, count: 2, context: {} }),
    /GUARDIAN_NO_CONFIRMATION_UI/
  );
  assert.equal(executed, false, "PACK_OPEN(bulk): no mutation without UI confirmation");
}

// ---- SBC_SUBMIT ----
{
  setLegacyFallbackForTests(false);
  setGuardian(null);
  const observableAdapter = makeSpy();
  const service = new SbcSubmitTransactionService({ observableAdapter });
  const options = {
    args: [{ id: 5, canSubmit: () => true }, {}],
    observerContext: {},
    invoke: () => ({}),
    onSuccess: () => {},
    onDiagnostic: () => {}
  };

  assert.throws(() => service.intercept(options), /GUARDIAN_UNAVAILABLE/);
  assert.equal(observableAdapter.calls.length, 0, "SBC_SUBMIT: no adapter call when Guardian absent");

  const f = makeFacade("fsu");
  setGuardian(f);
  let executed = false;
  f.registerMutation("SBC_SUBMIT", async () => {
    executed = true;
    return { submitted: true };
  });
  await assert.rejects(() => service.intercept(options), /GUARDIAN_NO_CONFIRMATION_UI/);
  assert.equal(executed, false, "SBC_SUBMIT: no mutation without UI confirmation");
}

// Restore clean state.
setGuardian(null);
setLegacyFallbackForTests(false);

console.log("guardian-fail-closed: all negative/fail-closed assertions passed");
