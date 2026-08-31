export class Fc27SolveFacade {
  constructor({ api, snapshotAdapter, mode = "BALANCED" }) {
    this.api = api;
    this.snapshotAdapter = snapshotAdapter;
    this.mode = mode;
  }

  async solve(targetCount, rulesetVersion) {
    const snapshot = await this.snapshotAdapter.capture();
    const uploaded = await this.api.uploadSnapshot(snapshot);
    if (!uploaded || uploaded.snapshot_hash !== snapshot.snapshot_hash) throw new Error("GUARDIAN_STALE_SNAPSHOT");
    return this.api.solveStreamlined({ snapshot_id: uploaded.id, snapshot_hash: snapshot.snapshot_hash, target_count: targetCount, ruleset_version: rulesetVersion, mode: this.mode });
  }
}
