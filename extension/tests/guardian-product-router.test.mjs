import assert from "node:assert/strict";
import { GuardianProductRouter } from "../src/guardian/GuardianProductRouter.js";

const states = [];
const make = (name) => {
  const listeners = new Set();
  const adapter = {
    subscribe(listener) { listeners.add(listener); listener({ phase: name }); return () => listeners.delete(listener); },
    getState: () => ({ phase: name }),
    open: (tool) => `${name}:${tool}`,
    findSolution: () => `${name}:find`,
    openEa: () => `${name}:ea`
  };
  return { uiAdapter: adapter, open: adapter.open };
};
let challenge = { edition: "FC26" };
const router = new GuardianProductRouter({ fc26: make("FC26"), fc27: make("FC27"), currentChallenge: () => challenge });
router.subscribe((state) => states.push(state.phase));
assert.equal(router.open("sbc"), "FC26:sbc");
challenge = { edition: "FC27" };
assert.equal(router.open("sbc"), "FC27:sbc");
assert.equal(router.findSolution(), "FC27:find");
assert.equal(router.openEa(), "FC27:ea");
assert.deepEqual(states, ["FC26", "FC27"]);
challenge = { edition: "FC25" };
assert.throws(() => router.open("sbc"), /GUARDIAN_UNSUPPORTED_EDITION/);
console.log("guardian-product-router: all assertions passed");
