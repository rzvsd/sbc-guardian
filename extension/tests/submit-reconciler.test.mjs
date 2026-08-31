import assert from "assert/strict";
import { SubmitReconciler } from "../src/guardian/SubmitReconciler.js";

let submits = 0; let confirms = 0;
const r = new SubmitReconciler({ guardedSubmit: async () => { submits += 1; return { success: true }; }, confirmBackend: async () => { confirms += 1; return { status: "CONFIRMED" }; } });
const solution = { solutionId: "s1", decisionId: "d1" };
await r.submit(solution); await r.submit(solution);
assert.equal(submits, 1); assert.equal(confirms, 1);
assert.rejects(new SubmitReconciler().submit(solution), /GUARDED/);
console.log("submit-reconciler: all assertions passed");
