export class Fc26RequirementAdapter {
  /** @param {any} [eligibilityKeys] */
  constructor(eligibilityKeys = null) {
    this.eligibilityKeys = eligibilityKeys;
  }

  /** @param {any} challenge */
  compile(challenge) {
    if (Array.isArray(challenge?.eligibilityRequirements)) {
      return this.compileFsu(challenge);
    }
    if (!challenge || !challenge.id || !Array.isArray(challenge.segments) || !challenge.segments.length) {
      throw new Error("GUARDIAN_MALFORMED_REQUIREMENTS");
    }
    const segments = challenge.segments.map((/** @type {any} */ segment) => {
      if (!segment || typeof segment.constraints !== "object" || Array.isArray(segment.constraints)) {
        throw new Error("GUARDIAN_MALFORMED_REQUIREMENTS");
      }
      return { constraints: { ...segment.constraints } };
    });
    return { challengeId: String(challenge.id), request: { segments } };
  }

  /** @param {any} challenge */
  compileFsu(challenge) {
    const keys = this.eligibilityKeys;
    if (!keys) throw new Error("EA_CAPABILITY_UNAVAILABLE:sbc.requirements");
    const constraints = {};
    for (const requirement of challenge.eligibilityRequirements) {
      const key = requirement?.getFirstKey?.();
      const raw = requirement?.getValue?.(key);
      const value = Number(Array.isArray(raw) ? raw[0] : raw);
      if (!Number.isFinite(value)) throw new Error("GUARDIAN_MALFORMED_REQUIREMENTS");
      if (key === keys.TEAM_RATING) constraints.min_team_rating = value;
      else if (key === keys.CHEMISTRY_POINTS) constraints.min_chemistry = value;
      else if (key === keys.PLAYER_MIN_OVR) constraints.min_player_rating = value;
      else if (key === keys.PLAYER_EXACT_OVR) {
        constraints.min_player_rating = value;
        constraints.max_player_rating = value;
      } else {
        throw new Error("GUARDIAN_UNSUPPORTED_REQUIREMENT:" + String(key));
      }
    }
    return {
      challengeId: String(challenge.id),
      request: { segments: [{ constraints }] }
    };
  }
}
