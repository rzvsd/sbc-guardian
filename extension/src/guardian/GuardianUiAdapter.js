const PUBLIC_PHASES = new Set([
  "BOOTING", "EA_LOGIN_REQUIRED", "EA_READY", "SBC_DETECTED", "SOLVING",
  "SOLUTION_READY", "INFEASIBLE", "TIMED_OUT", "STALE_SNAPSHOT", "APPLYING",
  "APPLIED_NOT_SUBMITTED", "SUBMIT_CONFIRMATION", "SUBMITTING_EA",
  "EA_SUBMITTED_CONFIRM_PENDING", "SUBMITTED", "SESSION_EXPIRED",
  "NETWORK_ERROR", "INVALID_RESPONSE"
]);

export class GuardianUiAdapter {
  /** @param {{controller?:any, openEa?:()=>void, refreshClub?:()=>void}} config */
  constructor({ controller, openEa = () => {}, refreshClub = () => {} } = {}) {
    this.controller = controller;
    this.openEa = openEa;
    this.refreshClub = refreshClub;
    this.state = { phase: "BOOTING" };
    this.listeners = new Set();
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
  tryAlternative() { return Promise.reject(new Error("ALTERNATIVE_NOT_AVAILABLE")); }
  requestSubmit() { return Promise.reject(new Error("SUBMIT_REQUIRES_CONFIRMATION")); }
  discardSolution() { this.publish({ phase: "EA_READY" }); }
  loadPolicy() { return Promise.resolve(null); }
  updatePolicy() { return Promise.reject(new Error("POLICY_NOT_AVAILABLE")); }
  loadAccount() { return Promise.resolve(null); }
  signOut() { return Promise.resolve(); }
}
