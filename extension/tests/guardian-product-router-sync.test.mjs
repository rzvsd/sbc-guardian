import assert from "node:assert/strict";
import { GuardianProductRouter } from "../src/guardian/GuardianProductRouter.js";

function product(name) {
  const listeners = new Set();
  const state = { phase: "BOOTING" };
  let opens = 0;
  const adapter = {
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    getState: () => state,
    publish(next) { Object.assign(state, next); for (const listener of listeners) listener(state); },
    open: () => { opens += 1; adapter.publish({ phase: "SBC_DETECTED" }); return `${name}:sbc`; }
  };
  return { uiAdapter: adapter, open: adapter.open, get opens() { return opens; } };
}

let challenge = null;
const fc26 = product("FC26");
const fc27 = product("FC27");
const router = new GuardianProductRouter({
  fc26,
  fc27,
  currentChallenge: () => challenge
});

router.sync();
assert.equal(router.getState().phase, "EA_READY");
challenge = { id: "challenge-1", name: "Starter SBC" };
router.sync();
router.sync();
assert.equal(fc26.opens, 1, "the same challenge must attach once");
assert.equal(router.getState().phase, "SBC_DETECTED");
challenge = { id: "challenge-2", name: "Second SBC" };
router.sync();
assert.equal(fc26.opens, 2, "a new challenge must be attached");
challenge = null;
router.sync();
assert.equal(router.getState().phase, "EA_READY");
console.log("guardian-product-router-sync: all assertions passed");
