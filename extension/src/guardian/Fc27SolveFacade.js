export class Fc27SolveFacade {
  /** @param {{api:any, snapshotAdapter:any, mode?:string}} config */
  constructor({ api, snapshotAdapter, mode = "BALANCED" }) {
    this.api = api;
    this.snapshotAdapter = snapshotAdapter;
    this.mode = mode;
  }

  /** @param {number} targetCount @param {string} rulesetVersion */
  async solve(targetCount, rulesetVersion) {
    const snapshot = await this.snapshotAdapter.capture();
    const uploaded = await this.api.uploadSnapshot(snapshot);
    if (!uploaded || uploaded.snapshot_hash !== snapshot.snapshot_hash) throw new Error("GUARDIAN_STALE_SNAPSHOT");
    const response = await this.api.solveStreamlined({ snapshot_id: uploaded.id, snapshot_hash: snapshot.snapshot_hash, target_count: targetCount, ruleset_version: rulesetVersion, mode: this.mode });
    const byId = new Map(snapshot.items.map((/** @type {any} */ item) => [String(item.id), item]));
    return { ...response, solutionId: response.solution_id, decisionId: response.decision_id, snapshotHash: snapshot.snapshot_hash,
      players: (response.selected || []).map((/** @type {string} */ id) => { const item = byId.get(String(id)); if (!item) throw new Error("GUARDIAN_STALE_SNAPSHOT"); return { id: String(id), name: item.name, rating: item.rating, reasons: ["server-scored FC27 item"] }; }), warnings: [] };
  }
}
