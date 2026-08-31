/**
 * Keeps one React adapter mounted while selecting the edition-specific
 * controller from the live EA challenge. The router never exposes the FSU
 * context; it only forwards the public adapter contract.
 */
export class GuardianProductRouter {
  /** @param {{fc26:any, fc27:any, currentChallenge:()=>any}} config */
  constructor({ fc26, fc27, currentChallenge }) {
    this.products = { FC26: fc26, FC27: fc27 };
    this.currentChallenge = currentChallenge;
    this.active = fc26;
    this.subscriptions = new Map();
  }

  /** @param {(state:any)=>void} listener */
  subscribe(listener) {
    this.subscriptions.set(listener, this.active.uiAdapter.subscribe(listener));
    return () => {
      this.subscriptions.get(listener)?.();
      this.subscriptions.delete(listener);
    };
  }

  getState() { return this.active.uiAdapter.getState(); }

  /** @param {string} tool */
  open(tool) {
    const rawEdition = String(this.currentChallenge()?.edition || "").toUpperCase();
    if (rawEdition !== "FC26" && rawEdition !== "FC27") {
      throw new Error("GUARDIAN_UNSUPPORTED_EDITION");
    }
    const edition = rawEdition;
    const next = this.products[edition];
    if (!next) throw new Error("GUARDIAN_UNSUPPORTED_EDITION");
    if (next !== this.active) {
      this.active = next;
      for (const [listener, unsubscribe] of this.subscriptions) {
        unsubscribe?.();
        this.subscriptions.set(listener, this.active.uiAdapter.subscribe(listener));
      }
    }
    return this.active.open(tool);
  }

  /** @param {string} method @param {any[]} args */
  _forward(method, args) {
    const fn = this.active.uiAdapter[method];
    if (typeof fn !== "function") throw new Error(`GUARDIAN_ADAPTER_METHOD_UNAVAILABLE:${method}`);
    return fn.apply(this.active.uiAdapter, args);
  }

  findSolution() { return this._forward("findSolution", []); }
  applySolution() { return this._forward("applySolution", []); }
  tryAlternative() { return this._forward("tryAlternative", []); }
  requestSubmit() { return this._forward("requestSubmit", []); }
  resumeSubmitConfirmation() { return this._forward("resumeSubmitConfirmation", []); }
  discardSolution() { return this._forward("discardSolution", []); }
  loadPolicy() { return this._forward("loadPolicy", []); }
  updatePolicy(policy) { return this._forward("updatePolicy", [policy]); }
  loadAccount() { return this._forward("loadAccount", []); }
  loadHome() { return this._forward("loadHome", []); }
  signOut() { return this._forward("signOut", []); }
  openEa() { return this._forward("openEa", []); }
  refreshClub() { return this._forward("refreshClub", []); }
}
