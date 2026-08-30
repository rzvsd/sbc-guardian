export class Fc26SolutionPresenter {
  /** @param {any} response @param {any} snapshot */
  present(response, snapshot) {
    const byId = new Map(snapshot.items.map((/** @type {any} */ item) => [String(item.id), item]));
    const players = response.selected.map((/** @type {any} */ id) => {
      const item = byId.get(String(id));
      if (!item) throw new Error("GUARDIAN_STALE_SNAPSHOT");
      const reasons = [];
      if (item.duplicate) reasons.push("duplicate preferred");
      if (!item.tradeable) reasons.push("untradeable preferred");
      if (!reasons.length) reasons.push("meets challenge constraints");
      return { id: String(item.id), name: item.name, rating: item.rating, reasons };
    });
    return {
      status: response.status,
      solutionId: response.solution_id,
      decisionId: response.decision_id,
      snapshotHash: snapshot.snapshot_hash,
      players,
      rating: response.rating_sum,
      warnings: players.filter((/** @type {any} */ player) => byId.get(player.id).special).map((/** @type {any} */ player) => `${player.name}: special item`)
    };
  }
}
