import { getGuardian } from "./runtime.js";
import { GuardianRuntimeError } from "./runtime.js";

/**
 * Distributed-build flag. esbuild replaces `__FSU_DISTRIBUTED__` with `true`
 * in the production bundle, so `IS_DISTRIBUTED` is `true` in shipped code.
 * In dev/test (source imported directly by Node), the identifier is undefined
 * and `IS_DISTRIBUTED` is `false`.
 *
 * IMPORTANT: the legacy (pre-Guardian) execution path is ONLY reachable when
 * `!IS_DISTRIBUTED` AND an explicit test opt-in is set via
 * `setLegacyFallbackForTests(true)`. In the distributed bundle `IS_DISTRIBUTED`
 * is `true`, so the legacy path is dead code and cannot be enabled by anyone
 * (page script, extension page, or anything else). This is fail-closed.
 */
export const IS_DISTRIBUTED =
  (typeof __FSU_DISTRIBUTED__ !== "undefined") ? __FSU_DISTRIBUTED__ : false;

let legacyFallbackAllowed = false;

/**
 * Enable the legacy (pre-Guardian) execution path. Exists ONLY so the existing
 * FSU unit tests can keep exercising the original executors. Never callable
 * from the distributed bundle (see IS_DISTRIBUTED).
 * @param {boolean} allow
 */
export function setLegacyFallbackForTests(allow) {
  legacyFallbackAllowed = !!allow;
}

export function isLegacyFallbackAllowed() {
  return !IS_DISTRIBUTED && legacyFallbackAllowed;
}

/**
 * Resolve how an irreversible mutation should execute.
 *
 * @param {string} kind
 * @returns {import("./runtime.js").GuardianMutationFacade | null}
 *   - the mounted Guardian facade when it can handle `kind` (caller must use
 *     `requestGuarded`);
 *   - `null` when the legacy path is explicitly allowed (test mode only);
 *   - otherwise throws `GUARDIAN_UNAVAILABLE` (fail-closed).
 */
export function guardianOrFailClosed(kind) {
  const g = getGuardian();
  if (g && g.isRegistered(kind)) {
    return g;
  }
  if (isLegacyFallbackAllowed()) {
    return null;
  }
  throw new GuardianRuntimeError("GUARDIAN_UNAVAILABLE");
}
