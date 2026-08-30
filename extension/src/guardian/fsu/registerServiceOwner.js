import { getGuardian, GuardianRuntimeError } from "../runtime.js";
import { registerFsuMutations } from "./registerFsuMutations.js";
import { isLegacyFallbackAllowed } from "../mode.js";

/** @type {WeakMap<object, Map<string, unknown>>} */
const ownersByGuardian = new WeakMap();

/**
 * Register a service instance at the point where production creates it.
 * Guardian is mounted before futweb bootstrap, so a missing facade here is a
 * bootstrap defect and must never fall back to an unguarded mutation path.
 *
 * @param {"market"|"sbc"|"store"|"bulk"} owner
 * @param {unknown} service
 */
export function registerGuardianServiceOwner(owner, service) {
  const guardian = getGuardian();
  if (!guardian) {
    if (isLegacyFallbackAllowed()) return;
    throw new GuardianRuntimeError("GUARDIAN_BOOTSTRAP_UNAVAILABLE:" + owner);
  }
  let owners = ownersByGuardian.get(guardian);
  if (!owners) {
    owners = new Map();
    ownersByGuardian.set(guardian, owners);
  }
  const existing = owners.get(owner);
  if (existing && existing !== service) {
    throw new GuardianRuntimeError("GUARDIAN_OWNER_CONFLICT:" + owner);
  }
  if (existing === service) return;
  owners.set(owner, service);
  registerFsuMutations({ services: { [owner]: service } }, guardian);
}
