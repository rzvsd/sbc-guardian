export class Fc27SolveFacade {
  /** @param {{api:any, snapshotAdapter:any, mode?:string}} config */
  constructor({ api, snapshotAdapter, mode = "BALANCED" }) {
    this.api = api;
    this.snapshotAdapter = snapshotAdapter;
    this.mode = mode;
  }

  /** @param {number} targetCount @param {string} rulesetVersion @param {{previousSolutionId?:string}} [options] */
  async solve(targetCount, rulesetVersion, options = {}) {
    let activeRuleset;
    try {
      activeRuleset = await this.api.getActiveScoringRuleset("FC27");
    } catch (error) {
      const source = /** @type {any} */ (error);
      if (source && source.status === 404) throw new Error("GUARDIAN_NO_ACTIVE_RULESET", { cause: error });
      throw error;
    }
    if (rulesetVersion && rulesetVersion !== activeRuleset.ruleset_version) {
      throw new Error("GUARDIAN_RULESET_CHANGED");
    }
    const resolvedRulesetVersion = activeRuleset.ruleset_version;
    const snapshot = await this.snapshotAdapter.capture();
    await this.api.uploadRawSnapshot(snapshot);
    let verified;
    try {
      verified = await this.api.getLatestVerifiedSnapshot("FC27");
    } catch (error) {
      const source = /** @type {any} */ (error);
      if (source && source.status === 404) throw new Error("GUARDIAN_TAXONOMY_UNVERIFIED", { cause: error });
      throw error;
    }
    if (!verified || verified.edition !== "FC27" || verified.schema_version !== 2 || verified.taxonomy_verified !== true) {
      throw new Error("GUARDIAN_TAXONOMY_UNVERIFIED");
    }
    const serverSnapshot = await this.api.getSnapshotItems(verified.id);
    if (!sameInventory(snapshot.items, serverSnapshot.items)) throw new Error("GUARDIAN_STALE_SNAPSHOT");
    const response = await this.api.solveStreamlined({ snapshot_id: verified.id, snapshot_hash: verified.snapshot_hash, target_count: targetCount, ruleset_version: resolvedRulesetVersion, mode: this.mode, ...(options.previousSolutionId ? { previous_solution_id: options.previousSolutionId } : {}) });
    const byId = new Map(snapshot.items.map((/** @type {any} */ item) => [String(item.id), item]));
    return { ...response, solutionId: response.solution_id, decisionId: response.decision_id, snapshotHash: snapshot.snapshot_hash, serverSnapshotHash: verified.snapshot_hash, snapshotId: verified.id,
      players: (response.selected || []).map((/** @type {string} */ id) => { const item = byId.get(String(id)); if (!item) throw new Error("GUARDIAN_STALE_SNAPSHOT"); return { id: String(id), name: item.name, rating: item.rating, reasons: ["server-scored FC27 item"] }; }), warnings: [] };
  }

  /** @param {number} targetCount @param {string} rulesetVersion @param {string} previousSolutionId */
  async tryAlternative(targetCount, rulesetVersion, previousSolutionId) {
    return this.solve(targetCount, rulesetVersion, { previousSolutionId });
  }
}

/** Compare only capture facts. Taxonomy and server scoring are deliberately
 * ignored because they are supplied by the immutable verified snapshot. */
/** @param {any[]} localItems @param {any[]} serverItems */
function sameInventory(localItems, serverItems) {
  const fields = [
    "id", "name", "rating", "league", "nation", "club", "rarity",
    "locked", "duplicate", "tradeable", "special", "evolution_eligible",
    "favorite", "in_active_squad", "market_value_coins", "valuation_source", "valued_at"
  ];
  /** @param {any[]} items */
  const normalize = (items) => items.map((/** @type {any} */ item) => {
    const copy = Object.fromEntries(fields.map((field) => [field, item[field] ?? null]));
    return copy;
  }).sort((/** @type {any} */ a, /** @type {any} */ b) => String(a.id).localeCompare(String(b.id)));
  return JSON.stringify(normalize(localItems)) === JSON.stringify(normalize(serverItems));
}
