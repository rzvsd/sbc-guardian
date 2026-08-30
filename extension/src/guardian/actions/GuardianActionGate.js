import { buildActionPreview, isIrreversibleKind } from "./ActionPreviewBuilder.js";
import { createDecisionStore } from "./ActionDecisionStore.js";

/**
 * Central Action Guard. All irreversible/important actions in Guardian must go
 * through requestDecision -> (user confirms) -> confirm. confirm is the ONLY
 * path that releases the preview and runs the executor; there is no bypass.
 */
export class GuardianActionGate {
  /**
   * @param {{ sessionNonce?: string, now?: () => number, ttlMs?: number }} config
   */
  constructor({ sessionNonce, now = () => Date.now(), ttlMs } = {}) {
    if (!sessionNonce) {
      throw new Error("GuardianActionGate requires sessionNonce");
    }
    this.sessionNonce = sessionNonce;
    this.now = now;
    this.ttlMs = ttlMs;
    this.decisions = createDecisionStore({ now });
  }

  /**
   * @param {{kind?:string, summary?:string, payload?:unknown, affectedItemIds?:string[]}} spec
   * @returns {Promise<{actionId:string, kind:string, payloadHash:string, summary:string, affectedItemIds:string[], expiresAt:string, irreversible:boolean}>}
   */
  buildPreview(spec) {
    return buildActionPreview({
      kind: spec.kind,
      summary: spec.summary,
      payload: spec.payload,
      affectedItemIds: spec.affectedItemIds,
      now: this.now,
      ttlMs: this.ttlMs
    });
  }

  /**
   * @param {{ actionId: string, payloadHash?: string, expiresAt?: string }} preview
   * @returns {object} decision token (present to the user)
   */
  requestDecision(preview) {
    if (!preview || !preview.actionId) {
      throw new Error("invalid preview");
    }
    return this.decisions.create(preview, this.sessionNonce);
  }

  /**
   * Confirm and execute exactly once. No automatic retry after accept.
   * @param {{decisionId?:string, payloadHash?:string}} decision
   * @param {(preview:object) => unknown} perform
   * @returns {Promise<{ok:true, result:unknown, decisionId:string}>}
   */
  async confirm(decision, perform) {
    const preview = this.decisions.consume(decision, this.sessionNonce, this.now);
    const result = await perform(preview);
    return { ok: true, result, decisionId: decision.decisionId || "" };
  }

  /**
   * Consume and validate a decision token, returning the bound preview exactly
   * once. Throws on missing/used/expired/session/payload mismatch. The facade
   * uses this to gate the real mutation.
   * @param {{decisionId?:string, payloadHash?:string}} decision
   * @param {() => number} [nowFn]
   * @returns {object}
   */
  consumeDecision(decision, nowFn) {
    return this.decisions.consume(decision, this.sessionNonce, nowFn || this.now);
  }
}

export { isIrreversibleKind };
