export class SubmitReconciler {
  /** @param {{guardedSubmit?:()=>Promise<any>, confirmBackend?:(solutionId:string, decisionId:string)=>Promise<any>, store?:Storage|null}} [config] */
  constructor({ guardedSubmit, confirmBackend, store = null } = {}) {
    this.guardedSubmit = guardedSubmit;
    this.confirmBackend = confirmBackend;
    this.store = store;
    this.pending = null;
    this.completed = new Set();
    this.inFlight = null;
    const pending = this.store?.getItem?.("guardian.ea-submit-pending");
    if (pending) {
      try {
        const value = JSON.parse(pending);
        if (value && typeof value.solutionId === "string" && typeof value.decisionId === "string") this.pending = value;
      } catch {
        this.store?.removeItem?.("guardian.ea-submit-pending");
      }
    }
  }

  pendingConfirmation() {
    return this.pending ? { ...this.pending } : null;
  }

  /** @param {any} solution */
  async submit(solution) {
    if (this.inFlight) return this.inFlight;
    const operation = this._submit(solution);
    this.inFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.inFlight === operation) this.inFlight = null;
    }
  }

  async resumePendingConfirmation() {
    if (this.inFlight) return this.inFlight;
    if (!this.pending) throw new Error("NO_BACKEND_CONFIRMATION_PENDING");
    const operation = this._resumePendingConfirmation();
    this.inFlight = operation;
    try {
      return await operation;
    } finally {
      if (this.inFlight === operation) this.inFlight = null;
    }
  }

  async _resumePendingConfirmation() {
    if (!this.confirmBackend) throw new Error("GUARDED_EA_SUBMIT_UNAVAILABLE");
    const { solutionId, decisionId } = this.pending;
    const confirmed = await this.confirmBackend(solutionId, decisionId);
    if (!confirmed || confirmed.status === "PENDING") throw new Error("BACKEND_CONFIRM_PENDING");
    this.pending = null;
    this.completed.add(solutionId);
    this.store?.removeItem?.("guardian.ea-submit-pending");
    this.store?.setItem?.(`guardian.ea-submit-completed:${solutionId}`, "1");
    return confirmed;
  }

  /** @param {any} solution */
  async _submit(solution) {
    if (!solution?.solutionId || !solution?.decisionId) throw new Error("GUARDIAN_INVALID_SOLUTION");
    if (!this.guardedSubmit || !this.confirmBackend) throw new Error("GUARDED_EA_SUBMIT_UNAVAILABLE");
    if (this.completed.has(solution.solutionId) || this.store?.getItem?.(`guardian.ea-submit-completed:${solution.solutionId}`) === "1") {
      this.completed.add(solution.solutionId);
      return { status: "CONFIRMED", id: solution.solutionId };
    }
    if (this.pending && this.pending.solutionId !== solution.solutionId) throw new Error("BACKEND_CONFIRM_PENDING_OTHER_SOLUTION");
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
    this.store?.setItem?.(`guardian.ea-submit-completed:${solution.solutionId}`, "1");
    return confirmed;
  }
}
