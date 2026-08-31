export class GuardianSolveFacade {
  /** @param {{api:any, snapshotAdapter:any, requirementAdapter:any, presenter:any}} config */
  constructor({ api, snapshotAdapter, requirementAdapter, presenter }) {
    this.api = api;
    this.snapshotAdapter = snapshotAdapter;
    this.requirementAdapter = requirementAdapter;
    this.presenter = presenter;
  }

  /** @param {any} challenge @param {{previousSolutionId?:string}} [options] */
  async solve(challenge, options = {}) {
    const compiled = this.requirementAdapter.compile(challenge);
    const snapshot = await this.snapshotAdapter.capture();
    const uploaded = await this.api.uploadSnapshot(snapshot);
    if (!uploaded || uploaded.snapshot_hash !== snapshot.snapshot_hash) {
      throw new Error("GUARDIAN_STALE_SNAPSHOT");
    }
    const response = await this.api.solveTraditional({
      request: compiled.request,
      snapshot_id: uploaded.id,
      snapshot_hash: snapshot.snapshot_hash,
      challenge_id: compiled.challengeId,
      ...(options.previousSolutionId ? { previous_solution_id: options.previousSolutionId } : {})
    });
    if (response.status !== "SOLVED") {
      return { status: response.status, players: [], warnings: [] };
    }
    return this.presenter.present(response, snapshot);
  }

  /** @param {any} challenge @param {{solutionId?:string}} previous */
  async tryAlternative(challenge, previous) {
    return this.solve(challenge, { previousSolutionId: previous?.solutionId });
  }
}
