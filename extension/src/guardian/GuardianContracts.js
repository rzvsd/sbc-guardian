/** @param {unknown} value @returns {value is Record<string, any>} */
function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {any} */
export function requireSnapshot(value) {
  if (!record(value) || value.edition !== "FC26" || value.schema_version !== 1) {
    throw new Error("GUARDIAN_INVALID_FC26_SNAPSHOT");
  }
  if (!Array.isArray(value.items) || !value.items.length || typeof value.snapshot_hash !== "string") {
    throw new Error("GUARDIAN_INVALID_FC26_SNAPSHOT");
  }
  const ids = value.items.map((item) => String(item && item.id));
  if (ids.some((id) => !id || id === "undefined") || new Set(ids).size !== ids.length) {
    throw new Error("GUARDIAN_INVALID_FC26_SNAPSHOT");
  }
  return value;
}

/** @param {unknown} value @param {"FC26"|"FC27"} edition @returns {any} */
export function requireSnapshotForEdition(value, edition) {
  if (!record(value) || value.edition !== edition || !Array.isArray(value.items) || !value.items.length || typeof value.snapshot_hash !== "string") {
    throw new Error(`GUARDIAN_INVALID_${edition}_SNAPSHOT`);
  }
  const ids = value.items.map((item) => String(item && item.id));
  if (ids.some((id) => !id || id === "undefined") || new Set(ids).size !== ids.length) throw new Error(`GUARDIAN_INVALID_${edition}_SNAPSHOT`);
  if (edition === "FC27" && (value.schema_version !== 2 || value.taxonomy_verified !== true || value.items.some((item) => typeof item.scoring_category !== "string" || !item.scoring_category))) {
    throw new Error("GUARDIAN_INVALID_FC27_SNAPSHOT");
  }
  return value;
}

/** @param {unknown} value @returns {any} */
export function requireTraditionalSolveResponse(value) {
  if (!record(value) || !["SOLVED", "INFEASIBLE", "TIMEOUT", "INVALID"].includes(value.status)) {
    throw new Error("GUARDIAN_INVALID_SOLVE_RESPONSE");
  }
  if (value.status === "SOLVED") {
    if (!Array.isArray(value.selected) || !value.selected.length) {
      throw new Error("GUARDIAN_INVALID_SOLVE_RESPONSE");
    }
    if (typeof value.solution_id !== "string" || typeof value.decision_id !== "string") {
      throw new Error("GUARDIAN_INVALID_SOLVE_RESPONSE");
    }
  }
  return value;
}

/** @param {unknown} value @returns {any} */
export function requireStreamlinedSolveResponse(value) {
  if (!record(value) || !["SOLVED", "INFEASIBLE", "TIMEOUT", "INVALID"].includes(value.status)) {
    throw new Error("GUARDIAN_INVALID_STREAMLINED_RESPONSE");
  }
  if (value.status === "SOLVED" && (!Array.isArray(value.selected) || !value.selected.length)) {
    throw new Error("GUARDIAN_INVALID_STREAMLINED_RESPONSE");
  }
  if (value.edition !== "FC27" || typeof value.ruleset_version !== "string") {
    throw new Error("GUARDIAN_INVALID_STREAMLINED_RESPONSE");
  }
  return value;
}
