/** @param {unknown} value @returns {string} */
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const data = /** @type {Record<string, unknown>} */ (value);
    return `{${Object.keys(data).sort().map((key) => `${JSON.stringify(key)}:${stable(data[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** @param {string} value */
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class FsuSnapshotAdapter {
  /** @param {{readClubItems:()=>Promise<any>|any}} config */
  constructor({ readClubItems }) {
    this.readClubItems = readClubItems;
  }

  async capture() {
    const result = await this.readClubItems();
    if (!result || result.success !== true || !Array.isArray(result.items)) {
      throw new Error("EA_CAPABILITY_UNAVAILABLE:club.snapshot");
    }
    const items = result.items.map((/** @type {any} */ item) => ({
      id: String(item.id),
      name: String(item.name || "Unknown player"),
      rating: Number(item.rating),
      league: String(item.league || ""),
      nation: String(item.nation || ""),
      club: String(item.club || ""),
      rarity: String(item.rarity || ""),
      locked: item.locked === true,
      duplicate: item.duplicate === true,
      tradeable: item.tradeable === true,
      special: item.special === true,
      evolution_eligible: item.evolutionEligible === true
    }));
    if (!items.length || items.some((/** @type {any} */ item) => !item.id || !Number.isInteger(item.rating))) {
      throw new Error("GUARDIAN_PARTIAL_SNAPSHOT");
    }
    const snapshot_hash = await sha256(stable(items));
    return { edition: "FC26", schema_version: 1, snapshot_hash, player_count: items.length, items };
  }
}

/** @param {any} ctx */
export function createFsuProductBindings(ctx) {
  const values = () => {
    const collection = ctx?.repositories?.Item?.club?.items;
    if (!collection || typeof collection.values !== "function") return null;
    return collection.values();
  };
  const normalizeRuntimeItem = (/** @type {any} */ item) => ({
    id: item.id ?? item.databaseId,
    name: item.name ?? item._staticData?.name ?? "Unknown player",
    rating: item.rating ?? item._rating,
    league: String(item.leagueId ?? ""),
    nation: String(item.nationId ?? ""),
    club: String(item.teamId ?? ""),
    rarity: String(item.rareflag ?? item.rareFlag ?? ""),
    locked: item._fsuLock === true || item.locked === true,
    duplicate: item.duplicate === true,
    tradeable: item.untradeable !== true,
    special: item.isSpecial === true || Number(item.rareflag) > 1,
    evolutionEligible: item.isEvolutionEligible === true
  });
  const currentChallenge = () => {
    const controller = ctx?.cntlr?.current?.();
    if (controller?._challenge) return controller._challenge;
    const id = controller?._challengeId;
    const challenges = controller?._set?.challenges;
    return id != null && challenges && typeof challenges.get === "function" ? challenges.get(id) : null;
  };
  return {
    readClubItems: async () => {
      const items = values();
      return items ? { success: true, items: Array.from(items, normalizeRuntimeItem) } : { success: false };
    },
    currentChallenge,
    applySelected: async (/** @type {string[]} */ itemIds) => {
      const items = values();
      const challenge = currentChallenge();
      if (!items || !challenge || typeof ctx?.events?.playerListFillSquad !== "function") {
        throw new Error("EA_CAPABILITY_UNAVAILABLE:sbc.apply");
      }
      const byId = new Map(Array.from(items, (/** @type {any} */ item) => [String(item.id ?? item.databaseId), item]));
      const selected = itemIds.map((id) => byId.get(String(id)));
      if (selected.some((item) => !item)) throw new Error("GUARDIAN_STALE_SNAPSHOT");
      return ctx.events.playerListFillSquad(challenge, selected, 2);
    }
  };
}
