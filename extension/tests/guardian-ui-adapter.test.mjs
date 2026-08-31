import assert from "assert/strict";
import { GuardianUiAdapter } from "../src/guardian/GuardianUiAdapter.js";

const calls = [];
const adapter = new GuardianUiAdapter({ controller: { solve: () => calls.push("solve") } });
const seen = [];
const unsubscribe = adapter.subscribe((state) => seen.push(state.phase));
adapter.publish({ phase: "READY", challenge: { id: "c1" } });
adapter.findSolution();
adapter.publish({ phase: "SOLVED" });
adapter.publish({ phase: "UNKNOWN" });
unsubscribe();
adapter.publish({ phase: "SOLVING" });
assert.deepEqual(calls, ["solve"]);
assert.deepEqual(seen, ["BOOTING", "SBC_DETECTED", "SOLUTION_READY", "INVALID_RESPONSE"]);
console.log("guardian-ui-adapter: all assertions passed");
