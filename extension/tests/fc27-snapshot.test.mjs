import assert from "assert/strict";
import { Fc27SnapshotAdapter } from "../src/guardian/Fc27SnapshotAdapter.js";

const adapter = new Fc27SnapshotAdapter({ readClubItems: () => ({ success: true, items: [{ id: "x", rating: 80, scoring_category: "rare" }] }) });
const snapshot = await adapter.capture();
assert.equal(snapshot.edition, "FC27");
assert.equal(snapshot.schema_version, 2);
assert.equal(snapshot.taxonomy_verified, true);
await assert.rejects(() => new Fc27SnapshotAdapter({ readClubItems: () => ({ success: true, items: [{ id: "x", rating: 80 }] }) }).capture(), /TAXONOMY/);
console.log("fc27-snapshot: all assertions passed");
