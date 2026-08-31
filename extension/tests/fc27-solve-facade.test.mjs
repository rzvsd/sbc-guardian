import assert from "node:assert/strict";

import { Fc27SolveFacade } from "../src/guardian/Fc27SolveFacade.js";

const localItems = [{ id: "p1", name: "One", rating: 80, scoring_category: "", points: 0 }];
const snapshotAdapter = { capture: async () => ({ edition: "FC27", schema_version: 2, taxonomy_verified: false, snapshot_hash: "raw", items: localItems }) };
const calls = [];
const api = {
  getActiveScoringRuleset: async () => ({ edition: "FC27", ruleset_version: "v1", taxonomy_version: 2, active: true }),
  uploadRawSnapshot: async (value) => { calls.push(["uploadRaw", value.snapshot_hash]); return { id: "raw-id", snapshot_hash: "raw" }; },
  getLatestVerifiedSnapshot: async () => ({ id: "verified-id", edition: "FC27", schema_version: 2, taxonomy_verified: true, snapshot_hash: "verified" }),
  getSnapshotItems: async () => ({ snapshot_id: "verified-id", snapshot_hash: "verified", items: [{ ...localItems[0], scoring_category: "GOLD_COMMON" }] }),
  solveStreamlined: async (body) => {
    calls.push(["solve", body.snapshot_id, body.snapshot_hash]);
    return { status: "SOLVED", selected: ["p1"], solution_id: "sol", decision_id: "dec", edition: "FC27", ruleset_version: "v1" };
  }
};
const result = await new Fc27SolveFacade({ api, snapshotAdapter }).solve(1, "v1");
assert.deepEqual(calls, [["uploadRaw", "raw"], ["solve", "verified-id", "verified"]]);
assert.equal(result.snapshotHash, "raw");
assert.equal(result.serverSnapshotHash, "verified");
assert.equal(result.players[0].id, "p1");

await assert.rejects(
  () => new Fc27SolveFacade({
    api: { ...api, getSnapshotItems: async () => ({ snapshot_id: "verified-id", snapshot_hash: "verified", items: [{ id: "other", rating: 80, scoring_category: "GOLD_COMMON" }] }) },
    snapshotAdapter
  }).solve(1, "v1"),
  /GUARDIAN_STALE_SNAPSHOT/
);

await assert.rejects(
  () => new Fc27SolveFacade({
    api: { ...api, getLatestVerifiedSnapshot: async () => { const error = new Error("missing"); error.status = 404; throw error; } },
    snapshotAdapter
  }).solve(1, "v1"),
  /GUARDIAN_TAXONOMY_UNVERIFIED/
);

await assert.rejects(
  () => new Fc27SolveFacade({ api, snapshotAdapter }).solve(1, "old"),
  /GUARDIAN_RULESET_CHANGED/
);

console.log("fc27-solve-facade: all assertions passed");
