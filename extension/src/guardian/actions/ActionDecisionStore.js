/**
 * Stores single-use, expiring, payload-bound decisions. A decision is the token
 * a user (Chrome modal or Android native) must present back to actually run an
 * irreversible action. Consuming is the only way to release the bound preview.
 */
export function createDecisionStore({ now = () => Date.now() } = {}) {
  /** @type {Map<string, {decisionId:string, actionId:string, payloadHash:string, sessionNonce:string, expiresAt:number, used:boolean, preview:object}>} */
  const store = new Map();

  /**
   * @param {{ actionId: string, payloadHash?: string, expiresAt?: string }} preview
   * @param {string} sessionNonce
   */
  function create(preview, sessionNonce) {
    if (!preview || !preview.actionId || !preview.payloadHash) {
      throw new Error("preview missing actionId/payloadHash");
    }
    if (!sessionNonce) {
      throw new Error("missing sessionNonce");
    }
    const decisionId =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? "dec-" + crypto.randomUUID()
        : "dec-" + now().toString(16) + "-" + Math.random().toString(16).slice(2);
    const expiresAt = preview.expiresAt ? Date.parse(preview.expiresAt) : now() + 5 * 60 * 1000;
    store.set(decisionId, {
      decisionId,
      actionId: preview.actionId,
      payloadHash: preview.payloadHash,
      sessionNonce,
      expiresAt,
      used: false,
      preview
    });
    return {
      decisionId,
      actionId: preview.actionId,
      payloadHash: preview.payloadHash,
      sessionNonce,
      expiresAt: new Date(expiresAt).toISOString()
    };
  }

  /**
   * Validates and consumes a decision. Returns the bound preview exactly once.
   * Throws on unknown / used / expired / session-mismatch / payload-mismatch.
   * @param {{decisionId?:string, payloadHash?:string}} decision
   * @param {string} sessionNonce
   * @param {() => number} [nowFn]
   */
  function consume(decision, sessionNonce, nowFn = now) {
    if (!decision || !decision.decisionId) {
      throw new Error("DECISION_MISSING");
    }
    const entry = store.get(decision.decisionId);
    if (!entry) {
      throw new Error("DECISION_UNKNOWN");
    }
    if (entry.used) {
      throw new Error("DECISION_ALREADY_USED");
    }
    if (entry.sessionNonce !== sessionNonce) {
      throw new Error("DECISION_SESSION_MISMATCH");
    }
    if (decision.payloadHash != null && decision.payloadHash !== entry.payloadHash) {
      throw new Error("DECISION_PAYLOAD_MISMATCH");
    }
    if (nowFn() > entry.expiresAt) {
      store.delete(decision.decisionId);
      throw new Error("DECISION_EXPIRED");
    }
    entry.used = true;
    return entry.preview;
  }

  /**
   * @param {string} decisionId
   */
  function get(decisionId) {
    return store.get(decisionId);
  }

  return { create, consume, get };
}
