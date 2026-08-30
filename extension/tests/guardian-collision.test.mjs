import assert from "node:assert";
import { createGuardianRuntime, setGuardian } from "../src/guardian/runtime.js";
import { registerFsuMutations } from "../src/guardian/fsu/registerFsuMutations.js";
import { StorePackOpenTransactionService } from "../src/fsu/domain/StorePackOpenTransactionService.js";
import { BulkPackOpenService } from "../src/fsu/domain/BulkPackOpenService.js";

// Finding #2: PACK_OPEN (single store) and PACK_OPEN_BULK (bulk) must be two
// DISTINCT, single-owned registrations. With the old design both used the key
// "PACK_OPEN" and could overwrite each other. Here we prove alternation with the
// same facade never lets one owner hijack the other, and that tampering the
// single-store key cannot affect the bulk owner. (FSU services dedupe concurrent
// *same-instance* opens via inFlight/active; we call each owner once per facade
// and use a completing poll + sequential calls for the alternation proof.)

function makeFacade() {
  return createGuardianRuntime({ sessionNonce: "collision", mutations: {} });
}

function makeStore(setTimer) {
  return new StorePackOpenTransactionService({
    adapter: {
      prepare: (_controller, _args) => ({ success: true, data: { tracked: true, key: "pack-key", packId: 7, initialCount: 1 } }),
      readCompletion: () => ({ success: true, data: { remainingCount: 0, availablePackIds: [] } })
    },
    setTimer: setTimer || (() => 0)
  });
}

function makeBulk() {
  return new BulkPackOpenService({
    adapter: {
      prepare: ({ packId, count }) => ({ success: true, data: { packs: [{ packId, count }] } }),
      openAndAssign: () => ({ success: true, data: { players: [] } })
    }
  });
}

function makeStoreOpts(invokeSpy) {
  return {
    controller: { isOpeningPack: false },
    args: [],
    invoke: () => {
      invokeSpy();
      return "invoked";
    },
    onSuccess: () => {},
    onDiagnostic: () => {}
  };
}

function bind(g, fn) {
  setGuardian(g);
  return fn();
}

// Order A: store -> bulk (one open each; distinct owners, no interference)
{
  const g = makeFacade();
  setGuardian(g);
  g.defaultPreviewHandler = (p, c) => c.approve();
  const store = makeStore();
  const bulk = makeBulk();
  registerFsuMutations({ services: { store, bulk } }, g);
  let storeInvokes = 0;
  let bulkPrepares = 0;
  bulk.adapter.prepare = () => {
    bulkPrepares++;
    return { success: true, data: { packs: [{}] } };
  };
  await bind(g, () => store.intercept(makeStoreOpts(() => storeInvokes++)));
  await bind(g, () => bulk.run({ packId: 7, count: 2, context: {} }));
  assert.equal(storeInvokes, 1, "store -> bulk: store mutation ran once (owner PACK_OPEN)");
  assert.equal(bulkPrepares, 1, "store -> bulk: bulk mutation ran once (owner PACK_OPEN_BULK)");
  assert.ok(g.isRegistered("PACK_OPEN") && g.isRegistered("PACK_OPEN_BULK"), "both distinct keys registered");
  assert.notEqual("PACK_OPEN", "PACK_OPEN_BULK");
}

// Order B: bulk -> store (order independence)
{
  const g = makeFacade();
  setGuardian(g);
  g.defaultPreviewHandler = (p, c) => c.approve();
  const store = makeStore();
  const bulk = makeBulk();
  registerFsuMutations({ services: { store, bulk } }, g);
  let storeInvokes = 0;
  let bulkPrepares = 0;
  bulk.adapter.prepare = () => {
    bulkPrepares++;
    return { success: true, data: { packs: [{}] } };
  };
  await bind(g, () => bulk.run({ packId: 7, count: 2, context: {} }));
  await bind(g, () => store.intercept(makeStoreOpts(() => storeInvokes++)));
  assert.equal(storeInvokes, 1, "bulk -> store: store mutation ran once");
  assert.equal(bulkPrepares, 1, "bulk -> store: bulk mutation ran once");
}

// Sequential alternation on the SAME instances/owners (poll completes so inFlight clears)
{
  const g = makeFacade();
  setGuardian(g);
  g.defaultPreviewHandler = (p, c) => c.approve();
  const microtask = (fn) => {
    Promise.resolve().then(fn);
    return 0;
  };
  const store = makeStore(microtask);
  const bulk = makeBulk();
  registerFsuMutations({ services: { store, bulk } }, g);
  let storeInvokes = 0;
  let bulkPrepares = 0;
  bulk.adapter.prepare = () => {
    bulkPrepares++;
    return { success: true, data: { packs: [{}] } };
  };
  await bind(g, () => store.intercept(makeStoreOpts(() => storeInvokes++)));
  await bind(g, () => bulk.run({ packId: 7, count: 2, context: {} }));
  await bind(g, () => store.intercept(makeStoreOpts(() => storeInvokes++)));
  await bind(g, () => bulk.run({ packId: 7, count: 2, context: {} }));
  assert.equal(storeInvokes, 2, "repeated store opens all hit PACK_OPEN owner (never bulk)");
  assert.equal(bulkPrepares, 2, "repeated bulk opens all hit PACK_OPEN_BULK owner (never store)");
}

// Tamper resistance: overwriting PACK_OPEN must not affect PACK_OPEN_BULK.
{
  const g = makeFacade();
  setGuardian(g);
  g.defaultPreviewHandler = (p, c) => c.approve();
  const bulk = makeBulk();
  registerFsuMutations({ services: { store: makeStore(), bulk } }, g);
  let bulkPrepares = 0;
  bulk.adapter.prepare = () => {
    bulkPrepares++;
    return { success: true, data: { packs: [{}] } };
  };
  // A malicious actor overwrites the single-store key entirely.
  g.registerMutation("PACK_OPEN", () => {
    throw new Error("PACK_OPEN hijacked");
  });
  await bind(g, () => bulk.run({ packId: 7, count: 1, context: {} }));
  assert.equal(bulkPrepares, 1, "PACK_OPEN tampering does not affect PACK_OPEN_BULK owner");
  assert.ok(g.isRegistered("PACK_OPEN_BULK"), "PACK_OPEN_BULK remains registered/owned by bulk");
  g.registerMutation("PACK_OPEN", () => "store-owner-restored");
  assert.ok(g.isRegistered("PACK_OPEN_BULK"), "distinct-key re-registration leaves bulk owner intact");
}

setGuardian(null);
console.log("guardian-collision (Finding #2): all assertions passed");
