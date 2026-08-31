import assert from "assert/strict";
import { SubmitReconciler } from "../src/guardian/SubmitReconciler.js";

let submits = 0; let confirms = 0;
const r = new SubmitReconciler({ guardedSubmit: async () => { submits += 1; return { success: true }; }, confirmBackend: async () => { confirms += 1; return { status: "CONFIRMED" }; } });
const solution = { solutionId: "s1", decisionId: "d1" };
await r.submit(solution); await r.submit(solution);
assert.equal(submits, 1); assert.equal(confirms, 1);
assert.rejects(new SubmitReconciler().submit(solution), /GUARDED/);

const store = new Map();
const storage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: (key) => store.delete(key)
};
store.set("guardian.ea-submit-pending", JSON.stringify({ solutionId: "s1", decisionId: "d1" }));
let resumedEaCalls = 0;
let resumedConfirms = 0;
const resumed = new SubmitReconciler({
  store: storage,
  guardedSubmit: async () => { resumedEaCalls += 1; return { success: true }; },
  confirmBackend: async () => { resumedConfirms += 1; return { status: "CONFIRMED" }; }
});
assert.deepEqual(await resumed.resumePendingConfirmation(), { status: "CONFIRMED" });
assert.equal(resumedEaCalls, 0, "reload must never repeat the EA submit");
assert.equal(resumedConfirms, 1);
console.log("submit-reconciler: all assertions passed");
