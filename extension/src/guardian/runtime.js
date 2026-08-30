import { GuardianActionGate } from "./actions/GuardianActionGate.js";
import { ACTION_KINDS, buildActionPreview } from "./actions/ActionPreviewBuilder.js";
import { hashPayload } from "./actions/payloadHash.js";

export class GuardianRuntimeError extends Error {}

/** @type {import("./runtime.js").GuardianMutationFacade | null} */
let activeGuardian = null;

/**
 * @returns {import("./runtime.js").GuardianMutationFacade | null}
 */
export function getGuardian() {
  return activeGuardian;
}

/**
 * @param {import("./runtime.js").GuardianMutationFacade | null} g
 */
export function setGuardian(g) {
  activeGuardian = g;
}

const REGISTRY_KINDS = new Set(ACTION_KINDS);

/**
 * The single execution chokepoint for all irreversible FSU mutations.
 *
 * Protocol (strictly separated stages):
 *   1. prepare(kind, payload)      -> stores preview, returns preview ONLY (no token)
 *   2. approve(actionId)           -> mints a single-use decision token (PRIVATE to UI)
 *   3. execute(kind, payload, decision) -> validates everything, runs mutation once
 *   dismiss(actionId)              -> invalidates the pending preview, emits zero tokens
 *
 * The low-level EA mutation executors are captured in a private closure
 * (this.originals) and are NEVER exposed. window.__guardian only ever sees
 * requestGuarded(), which requires a UI confirmation step to emit a token.
 */
export class GuardianMutationFacade {
  /**
   * @param {{ sessionNonce?: string, now?: () => number, ttlMs?: number, setTimer?: typeof setTimeout, clearTimer?: typeof clearTimeout, mutations?: Record<string, (payload: unknown, preview: object, context?: unknown) => unknown> }} [config]
   */
  constructor(config = {}) {
    const { sessionNonce, now, ttlMs, setTimer, clearTimer, mutations = {} } = config;
    if (!sessionNonce) {
      throw new GuardianRuntimeError("GuardianMutationFacade requires sessionNonce");
    }
    this.sessionNonce = sessionNonce;
    this.now = now || (() => Date.now());
    this.ttlMs = ttlMs;
    this.setTimer = setTimer || ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = clearTimer || ((timer) => clearTimeout(timer));
    this.gate = new GuardianActionGate({ sessionNonce, now: this.now, ttlMs });
    /** @type {Map<string, (payload: unknown, preview: object, context?: unknown) => unknown>} */
    this.originals = new Map(Object.entries(mutations));
    /** @type {Map<string, object>} */
    this.pending = new Map();
    /**
     * Per-action runtime context (callbacks, controllers, EA instances) bound
     * by FSU internals via requestGuarded(kind, dto, { context }). NEVER derived
     * from the public window API (which strips the 3rd argument), so a page
     * script cannot inject context. Keyed by actionId; consumed on execute.
     * @type {Map<string, unknown>}
     */
    this._contexts = new Map();
    /** @type {Map<string, ReturnType<typeof setTimeout>>} */
    this._timers = new Map();
    /** @type {((preview: object, controls: { approve: () => void, dismiss: () => void }) => void) | null} */
    this.defaultPreviewHandler = null;
  }

  /**
   * @param {string} kind
   */
  isRegistered(kind) {
    return this.originals.has(kind);
  }

  getRegisteredKinds() {
    return [...this.originals.keys()];
  }

  /**
   * Register (or replace) the low-level executor for a mutation kind. The
   * executor is captured in this private closure and is never exposed.
   * The third argument is the per-call runtime context bound internally via
   * requestGuarded(kind, dto, { context }); it is never supplied by the public
   * window API.
   * @param {string} kind
   * @param {(payload: unknown, preview: object, context?: unknown) => unknown} executor
   */
  registerMutation(kind, executor) {
    if (!REGISTRY_KINDS.has(kind)) {
      throw new GuardianRuntimeError("GUARDIAN_UNKNOWN_KIND:" + String(kind));
    }
    this.originals.set(kind, executor);
  }

  /**
   * Run a registered executor directly (no token). Used internally by
   * BATCH_ACTION to perform sub-actions after the parent action was confirmed.
   * @param {string} kind
   * @param {unknown} payload
   * @returns {unknown}
   */
  runRegistered(kind, payload) {
    const ex = this.originals.get(kind);
    if (!ex) {
      throw new GuardianRuntimeError("GUARDIAN_UNKNOWN_MUTATION:" + String(kind));
    }
    return ex(payload, {});
  }

  /**
   * STAGE 1 — prepare. Stores the preview and returns it. NEVER returns a token.
   * @param {string} kind
   * @param {unknown} payload
   * @param {{ summary?: string, affectedItemIds?: string[], costRisk?: string }} [options]
   * @returns {Promise<object>}
   */
  async prepare(kind, payload, options = {}) {
    if (!REGISTRY_KINDS.has(kind)) {
      throw new GuardianRuntimeError("GUARDIAN_UNKNOWN_KIND:" + String(kind));
    }
    const preview = await buildActionPreview({
      kind,
      summary: options.summary || kind,
      payload,
      affectedItemIds: options.affectedItemIds || [],
      costRisk: options.costRisk,
      now: this.now,
      ttlMs: this.ttlMs
    });
    this.pending.set(preview.actionId, preview);
    return preview;
  }

  /**
   * STAGE 2 — approve. Mints a single-use decision token for a prepared action.
   * This is PRIVATE: only the UI confirmation handler may call it. It is NOT
   * exposed on window.__guardian.
   * @param {string} actionId
   * @returns {object}
   */
  approve(actionId) {
    const preview = this.pending.get(actionId);
    if (!preview) {
      throw new GuardianRuntimeError("GUARDIAN_NO_PENDING:" + String(actionId));
    }
    const decision = this.gate.requestDecision(/** @type {any} */ (preview));
    this.pending.delete(actionId);
    return decision;
  }

  /**
   * Dismiss a prepared action. Invalidates the preview and emits zero tokens.
   * @param {string} actionId
   */
  dismiss(actionId) {
    this._cleanupAction(actionId);
  }

  /** @param {string} actionId */
  _cleanupAction(actionId) {
    this.pending.delete(actionId);
    this._contexts.delete(actionId);
    const timer = this._timers.get(actionId);
    if (timer !== undefined) {
      this.clearTimer(timer);
      this._timers.delete(actionId);
    }
  }

  /** Test-only, read-only lifecycle counters. */
  getLifecycleDiagnostics() {
    return Object.freeze({
      pending: this.pending.size,
      contexts: this._contexts.size,
      timers: this._timers.size
    });
  }

  /**
   * STAGE 3 — execute. Validates the decision and runs the bound mutation once.
   * @param {string} kind
   * @param {unknown} payload
   * @param {{ actionId: string, payloadHash?: string, expiresAt?: string }} decision
   * @param {{ onFailure?: (error: unknown) => void }} [hooks]
   * @returns {Promise<{ok:true, result:unknown, decisionId:string}>}
   */
  async execute(kind, payload, decision, hooks = {}) {
    if (!decision || !decision.actionId) {
      throw new GuardianRuntimeError("GUARDIAN_DECISION_REQUIRED");
    }
    try {
      if (!this.originals.has(kind)) {
        throw new GuardianRuntimeError("GUARDIAN_UNKNOWN_MUTATION:" + String(kind));
      }
      let preview;
      try {
        preview = /** @type {any} */ (this.gate.consumeDecision(decision, this.now));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new GuardianRuntimeError(msg);
      }
      if (preview.kind !== kind) {
        throw new GuardianRuntimeError("GUARDIAN_KIND_MISMATCH");
      }
      const payloadHash = await hashPayload(payload);
      if (payloadHash !== preview.payloadHash) {
        throw new GuardianRuntimeError("GUARDIAN_PAYLOAD_MISMATCH");
      }
      const executor = this.originals.get(kind);
      if (!executor) {
        throw new GuardianRuntimeError("GUARDIAN_UNKNOWN_MUTATION:" + String(kind));
      }
      const ctx = this._contexts.get(decision.actionId);
      const result = await executor(payload, preview, ctx);
      return { ok: true, result, decisionId: decision.actionId };
    } catch (err) {
      if (hooks.onFailure) {
        hooks.onFailure(err);
      }
      throw err;
    } finally {
      this._cleanupAction(decision.actionId);
    }
  }

  /**
   * Public orchestration used by FSU. Requires a human confirmation step:
   * the preview handler (UI) must call controls.approve() (Accept) or
   * controls.dismiss() (Cancel/Escape/close). Without a preview handler,
   * no token is emitted and zero mutations occur.
   * @param {string} kind
   * @param {unknown} payload
   * @param {{ summary?: string, affectedItemIds?: string[], costRisk?: string, context?: unknown, onPreview?: (preview: object, controls: { approve: () => void, dismiss: () => void }) => void }} [options]
   * @returns {Promise<{ok:true, result:unknown, decisionId:string}>}
   */
  requestGuarded(kind, payload, options = {}) {
    if (this.pending.size > 0) {
      return Promise.reject(new GuardianRuntimeError("GUARDIAN_ACTION_IN_PROGRESS"));
    }
    return new Promise((resolve, reject) => {
      /** @type {null|(()=>void)} */
      let cleanupUi = null;
      let settled = false;
      let approvalStarted = false;
      let uiDisposed = false;
      const disposeUi = () => {
        if (uiDisposed) return;
        uiDisposed = true;
        if (typeof cleanupUi === "function") cleanupUi();
      };
      /** @param {string} actionId */
      const finish = (actionId) => {
        if (settled) return;
        settled = true;
        this._cleanupAction(actionId);
        disposeUi();
      };
      this.prepare(kind, payload, options)
        .then((rawPreview) => {
          const preview = /** @type {any} */ (rawPreview);
          if (options && options.context !== undefined) {
            this._contexts.set(preview.actionId, options.context);
          }
          const expiresAtMs = Date.parse(preview.expiresAt);
          const delay = Math.max(0, expiresAtMs - this.now());
          const timer = this.setTimer(() => {
            if (settled) return;
            finish(preview.actionId);
            reject(new GuardianRuntimeError("GUARDIAN_DECISION_EXPIRED"));
          }, delay);
          this._timers.set(preview.actionId, timer);
          const controls = {
            approve: () => {
              if (approvalStarted || settled) return;
              approvalStarted = true;
              let decision;
              try {
                decision = this.approve(preview.actionId);
                const activeTimer = this._timers.get(preview.actionId);
                if (activeTimer !== undefined) {
                  this.clearTimer(activeTimer);
                  this._timers.delete(preview.actionId);
                }
                disposeUi();
              } catch (err) {
                finish(preview.actionId);
                reject(err);
                return;
              }
              this.execute(kind, payload, /** @type {any} */ (decision))
                .then((out) => {
                  finish(preview.actionId);
                  resolve(out);
                })
                .catch((err) => {
                  finish(preview.actionId);
                  reject(err);
                });
            },
            dismiss: () => {
              if (approvalStarted || settled) return;
              finish(preview.actionId);
              reject(new GuardianRuntimeError("GUARDIAN_DISMISSED"));
            }
          };
          const handler = options.onPreview || this.defaultPreviewHandler;
          if (handler) {
            try {
              const returned = handler(preview, controls);
              if (typeof returned === "function") {
                const returnedCleanup = /** @type {()=>void} */ (returned);
                cleanupUi = returnedCleanup;
                if (uiDisposed || settled) returnedCleanup();
              }
            } catch (err) {
              finish(preview.actionId);
              reject(err);
            }
          } else {
            finish(preview.actionId);
            reject(new GuardianRuntimeError("GUARDIAN_NO_CONFIRMATION_UI"));
          }
        })
        .catch((err) => reject(err));
    });
  }
}

/**
 * @param {{ sessionNonce: string, now?: () => number, ttlMs?: number, mutations?: Record<string, (payload: unknown, preview: object, context?: unknown) => unknown> }} config
 * @returns {GuardianMutationFacade}
 */
export function createGuardianRuntime(config) {
  return new GuardianMutationFacade(config);
}
