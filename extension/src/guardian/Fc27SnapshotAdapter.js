import { FsuSnapshotAdapter } from "./FsuSnapshotAdapter.js";

export class Fc27SnapshotAdapter extends FsuSnapshotAdapter {
  async capture() {
    const snapshot = await super.capture();
    const items = snapshot.items.map((/** @type {any} */ item) => ({ ...item, scoring_category: String(item.scoring_category || "").toUpperCase() }));
    return { ...snapshot, edition: "FC27", schema_version: 2, taxonomy_verified: false, items };
  }
}
