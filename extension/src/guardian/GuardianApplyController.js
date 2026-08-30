export class GuardianApplyController {
  /** @param {{guardian:any, applySelected:(ids:string[])=>Promise<any>|any, captureSnapshot?:()=>Promise<any>}} config */
  constructor({ guardian, applySelected, captureSnapshot }) {
    this.guardian = guardian;
    this.applySelected = applySelected;
    this.captureSnapshot = captureSnapshot;
    if (!guardian.isRegistered("SBC_APPLY")) {
      guardian.registerMutation("SBC_APPLY", (/** @type {any} */ payload, /** @type {any} */ _preview, /** @type {any} */ context) => {
        if (!context || context.solutionId !== payload.solutionId) {
          throw new Error("GUARDIAN_CONTEXT_MISMATCH:SBC_APPLY");
        }
        return this.applySelected([...payload.itemIds]);
      });
    }
  }

  /** @param {any} solution */
  async apply(solution) {
    if (!solution || !solution.solutionId || !Array.isArray(solution.players) || !solution.players.length) {
      throw new Error("GUARDIAN_INVALID_SOLUTION");
    }
    if (this.captureSnapshot) {
      const current = await this.captureSnapshot();
      if (!current || current.snapshot_hash !== solution.snapshotHash) {
        throw new Error("GUARDIAN_STALE_SNAPSHOT");
      }
    }
    const itemIds = solution.players.map((/** @type {any} */ player) => String(player.id));
    const result = await this.guardian.requestGuarded(
      "SBC_APPLY",
      { solutionId: solution.solutionId, itemIds },
      {
        summary: `Fill squad with ${itemIds.length} reviewed players; does not submit`,
        affectedItemIds: itemIds,
        costRisk: "Squad changes can be reviewed and undone before submit",
        context: { solutionId: solution.solutionId }
      }
    );
    return result.result;
  }
}
