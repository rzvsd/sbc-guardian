export class SubmitReconciler {
  /** @param {{guardedSubmit?:()=>Promise<any>, confirmBackend?:(solutionId:string, decisionId:string)=>Promise<any>, store?:Storage}} config */
  constructor({ guardedSubmit, confirmBackend, store = null } = {}) {
    this.guardedSubmit = guardedSubmit;
    this.confirmBackend = confirmBackend;
    this.store = store;
    this.pending = null;
    this.completed = new Set();
  }

  async submit(solution) {
    if (!solution?.solutionId || !solution?.decisionId) throw new Error("GUARDIAN_INVALID_SOLUTION");
    if (!this.guardedSubmit || !this.confirmBackend) throw new Error("GUARDED_EA_SUBMIT_UNAVAILABLE");
    if (this.completed.has(solution.solutionId)) return { status: "CONFIRMED", id: solution.solutionId };
    if (!this.pending || this.pending.solutionId !== solution.solutionId) {
      const result = await this.guardedSubmit();
      if (!result || result.success !== true) throw new Error("EA_SUBMIT_FAILED");
      this.pending = { solutionId: solution.solutionId, decisionId: solution.decisionId };
      this.store?.setItem?.("guardian.ea-submit-pending", JSON.stringify(this.pending));
    }
    const confirmed = await this.confirmBackend(solution.solutionId, solution.decisionId);
    if (!confirmed || confirmed.status === "PENDING") throw new Error("BACKEND_CONFIRM_PENDING");
    this.pending = null;
    this.completed.add(solution.solutionId);
    this.store?.removeItem?.("guardian.ea-submit-pending");
    return confirmed;
  }
}
