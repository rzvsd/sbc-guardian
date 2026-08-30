import { GuardianRuntimeError } from "../runtime.js";

/** @param {string} kind */
function failContext(kind) {
  throw new GuardianRuntimeError("GUARDIAN_CONTEXT_MISMATCH:" + kind);
}

/** @param {any} value */
function playerIdentity(value) {
  if (Number.isInteger(value)) return Number(value);
  if (!value || typeof value !== "object") return null;
  const raw = value.definitionId ?? value.defId ?? value.id;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * The single place that wires the facade-level capabilities and the executors
 * for every service-owned irreversible kind. Each kind is registered EXACTLY
 * ONCE here, under its own distinct key, so no two services can replace the
 * same executor (this is what prevents the old PACK_OPEN collision between Store
 * and Bulk). SBC_APPLY has no FSU call site (NOT_APPLICABLE) and is intentionally
 * never registered.
 *
 * All low-level executors are captured inside the facade's private closure and
 * are NEVER exposed on window.__guardian. The runtime context (callbacks,
 * controllers, EA instances) is bound internally via requestGuarded(kind, dto,
 * { context }) and passed to the executor as the 3rd argument; it is never
 * derived from the public window API.
 *
 * @param {{ ea?: any, services?: any }} ctx
 * @param {import("../runtime.js").GuardianMutationFacade} guardian
 */
export function registerFsuMutations(ctx, guardian) {
  const { services = {} } = ctx;
  const market = services.market;
  const sbc = services.sbc;
  const store = services.store;
  const bulk = services.bulk;

  if (market && !guardian.isRegistered("MARKET_BUY")) {
    guardian.registerMutation("MARKET_BUY", (p, _pv, c) => {
      const a = /** @type {any} */ (c);
      if (!a || playerIdentity(a.player) !== Number(/** @type {any} */ (p).defId)) {
        failContext("MARKET_BUY");
      }
      return market._buyPlayerImpl(a.player, a.view, a.helpers, {
        maxBuyPrice: Number(/** @type {any} */ (p).maxBuyPrice)
      });
    });
  }
  if (market && !guardian.isRegistered("MARKET_LIST")) {
    guardian.registerMutation("MARKET_LIST", (p, _pv, c) => {
      const a = /** @type {any} */ (c);
      const dto = /** @type {any} */ (p);
      if (
        !a ||
        playerIdentity(a.d) !== Number(dto.itemDefId) ||
        Number(a.p) !== Number(dto.requestedPrice) ||
        Number(a.time) !== Number(dto.durationHours)
      ) {
        failContext("MARKET_LIST");
      }
      return market._playerToAuctionImpl(a.d, a.p, a.time, a.helpers, {
        listingPrice: Number(dto.listingPrice)
      });
    });
  }
  if (sbc && !guardian.isRegistered("SBC_SUBMIT")) {
    guardian.registerMutation("SBC_SUBMIT", (p, _pv, c) => {
      const a = /** @type {any} */ (c);
      const challenge = a && a.args && a.args[0];
      if (Number(challenge && challenge.id) !== Number(/** @type {any} */ (p).challengeId)) {
        failContext("SBC_SUBMIT");
      }
      return sbc._interceptImpl(a);
    });
  }
  if (store && !guardian.isRegistered("PACK_OPEN")) {
    guardian.registerMutation("PACK_OPEN", (p, _pv, c) =>
      store._interceptImpl(/** @type {any} */ (c), /** @type {any} */ (p))
    );
  }
  if (bulk && !guardian.isRegistered("PACK_OPEN_BULK")) {
    guardian.registerMutation("PACK_OPEN_BULK", (_p, _pv, c) => {
      const a = /** @type {any} */ (c);
      return bulk._runImpl({
        packId: Number(/** @type {any} */ (_p).packId),
        count: Number(/** @type {any} */ (_p).count),
        context: a.context,
        onProgress: a.onProgress
      });
    });
  }

  // BATCH_ACTION has no production FSU call site. Do not advertise/register a
  // capability that cannot bind the per-action runtime contexts safely.
}
