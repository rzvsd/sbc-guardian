/**
 * Keeps one React adapter mounted while selecting the edition-specific
 * controller from the live EA challenge. The router never exposes the FSU
 * context; it only forwards the public adapter contract.
 */
export class GuardianProductRouter {
  /** @param {{fc26:any, fc27:any, currentChallenge:()=>any, defaultEdition?:"FC26"|"FC27"}} config */
  constructor({ fc26, fc27, currentChallenge, defaultEdition = "FC26" }) {
    this.products = { FC26: fc26, FC27: fc27 };
    this.currentChallenge = currentChallenge;
    this.defaultEdition = defaultEdition;
    this.active = fc26;
    this.subscriptions = new Map();
    this.challengeKey = null;
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
    const challenge = this.currentChallenge?.();
    const rawEdition = String(challenge?.edition || this.defaultEdition || "").toUpperCase();
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
    const result = this.active.open(tool);
    if (tool === "sbc") this.challengeKey = this.challengeKeyFor(challenge);
    return result;
  }

  /**
   * Synchronize the public UI with the live FSU controller. The old Guardian
   * rail used to call open("sbc") explicitly; React has no such legacy click,
   * so the router must observe SPA navigation and attach exactly once per
   * challenge.
   */
  sync() {
    const challenge = this.currentChallenge?.();
    if (!challenge) {
      const phase = this.active.uiAdapter.getState?.().phase;
      if (this.challengeKey !== null || phase === "BOOTING") {
        this.challengeKey = null;
        this.active.uiAdapter.publish?.({ phase: "EA_READY" });
      }
      return false;
    }

    const key = this.challengeKeyFor(challenge);
    if (key === this.challengeKey) return true;
    try {
      this.open("sbc");
      return true;
    } catch (error) {
      this.challengeKey = key;
      this.active.uiAdapter.publish?.({
        phase: "INVALID_RESPONSE",
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /** @param {any} challenge */
  challengeKeyFor(challenge) {
    if (!challenge) return null;
    return JSON.stringify([
      challenge.id ?? null,
      challenge.setId ?? null,
      challenge.name ?? null,
      challenge.edition ?? null,
      challenge.target_count ?? null,
      challenge.ruleset_version ?? null,
      challenge.squad_size ?? null
    ]);
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
