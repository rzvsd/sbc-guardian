const PUBLIC_PHASES = new Set([
  "BOOTING", "EA_LOGIN_REQUIRED", "EA_READY", "SBC_DETECTED", "SOLVING",
  "SOLUTION_READY", "INFEASIBLE", "TIMED_OUT", "STALE_SNAPSHOT", "APPLYING",
  "APPLIED_NOT_SUBMITTED", "SUBMIT_CONFIRMATION", "SUBMITTING_EA",
  "EA_SUBMITTED_CONFIRM_PENDING", "SUBMITTED", "SESSION_EXPIRED",
  "NETWORK_ERROR", "INVALID_RESPONSE"
]);

export class GuardianUiAdapter {
  /** @param {{controller?:any, api?:any, reconciler?:any, openEa?:()=>void, refreshClub?:()=>void}} config */
  constructor({ controller, api = null, reconciler = null, openEa = () => {}, refreshClub = () => {} } = {}) {
    this.controller = controller;
    this.api = api;
    this.reconciler = reconciler;
    this.openEa = openEa;
    this.refreshClub = refreshClub;
    this.state = { phase: "BOOTING" };
    this.listeners = new Set();
    const pending = this.reconciler?.pendingConfirmation?.();
    if (pending) this.state = { phase: "EA_SUBMITTED_CONFIRM_PENDING", submitPending: pending };
  }

  /** @param {(state:any)=>void} listener */
  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => this.listeners.delete(listener);
  }

  getState() { return this.state; }

  /** @param {any} next */
  publish(next) {
    const phase = next?.phase === "READY" ? "SBC_DETECTED"
      : next?.phase === "SOLVED" ? "SOLUTION_READY"
        : next?.phase === "TIMEOUT" ? "TIMED_OUT"
          : (PUBLIC_PHASES.has(next?.phase) ? next.phase : "INVALID_RESPONSE");
    this.state = { ...next, phase };
    for (const listener of this.listeners) listener(this.getState());
  }

  findSolution() { return this.controller?.solve(); }
  applySolution() { return this.controller?.apply(); }
  tryAlternative() { return this.controller?.tryAlternative ? this.controller.tryAlternative() : Promise.reject(new Error("ALTERNATIVE_NOT_AVAILABLE")); }
  async requestSubmit() {
    if (!this.reconciler) throw new Error("SUBMIT_REQUIRES_CONFIRMATION");
    const solution = /** @type {any} */ (this.state).solution;
    this.publish({ ...this.state, phase: "SUBMIT_CONFIRMATION" });
    this.publish({ ...this.state, phase: "SUBMITTING_EA" });
    try {
      const result = await this.reconciler.submit(solution);
      this.publish({ ...this.state, phase: "SUBMITTED", submitResult: result });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const phase = message === "BACKEND_CONFIRM_PENDING" ? "EA_SUBMITTED_CONFIRM_PENDING" : "APPLIED_NOT_SUBMITTED";
      this.publish({ ...this.state, phase, error: message });
      throw error;
    }
  }
  async resumeSubmitConfirmation() {
    if (!this.reconciler?.resumePendingConfirmation) throw new Error("NO_BACKEND_CONFIRMATION_PENDING");
    try {
      const result = await this.reconciler.resumePendingConfirmation();
      this.publish({ ...this.state, phase: "SUBMITTED", submitResult: result, submitPending: null });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.publish({ ...this.state, phase: "EA_SUBMITTED_CONFIRM_PENDING", error: message });
      throw error;
    }
  }
  discardSolution() { this.publish({ ...this.state, phase: "EA_READY", solution: null }); }
  async loadPolicy() {
    if (!this.api) return Promise.reject(new Error("POLICY_NOT_AVAILABLE"));
    const policy = await this.api.getPolicy();
    this.publish({ ...this.state, policy });
    return policy;
  }
  async loadHome() {
    if (!this.api) return Promise.reject(new Error("HOME_NOT_AVAILABLE"));
    const [snapshot, activity] = await Promise.all([
      this.api.getLatestSnapshot(),
      this.api.listSolutions(10)
    ]);
    this.publish({ ...this.state, snapshot, activity });
    return { snapshot, activity };
  }
  /** @param {unknown} policy */
  async updatePolicy(policy) {
    if (!this.api) return Promise.reject(new Error("POLICY_NOT_AVAILABLE"));
    const saved = await this.api.putPolicy(policy);
    this.publish({ ...this.state, policy: saved });
    return saved;
  }
  async loadAccount() {
    if (!this.api) return Promise.reject(new Error("ACCOUNT_NOT_AVAILABLE"));
    const [account, access] = await Promise.all([this.api.getAccount(), this.api.getAccess()]);
    this.publish({ ...this.state, account, access });
    return [account, access];
  }
  async signOut() {
    if (!this.api) return Promise.reject(new Error("ACCOUNT_NOT_AVAILABLE"));
    const result = await this.api.signOut();
    this.publish({ ...this.state, phase: "SESSION_EXPIRED", account: null, access: null });
    return result;
  }
}
