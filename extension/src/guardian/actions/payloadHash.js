/**
 * Stable, canonical serialization + SHA-256 hashing for action payloads.
 *
 * The canonical form recursively sorts object keys so that reordering keys or
 * mutating the object after a preview does NOT change the executed action: the
 * hash is recomputed at execute time from the payload actually passed, and any
 * divergence from the preview's hash rejects the action.
 */

/**
 * @param {unknown} value
 * @param {Set<object>} [seen] internal cycle guard
 * @returns {unknown}
 */
export function canonicalize(value, seen) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (typeof value === "function") {
    return undefined;
  }
  const visited = seen || new Set();
  if (visited.has(/** @type {object} */ (value))) {
    return undefined; // cycle -> drop, never stack-overflow
  }
  visited.add(/** @type {object} */ (value));
  let result;
  if (Array.isArray(value)) {
    result = value.map((item) => canonicalize(item, visited));
  } else {
    /** @type {Record<string, unknown>} */
    const sorted = {};
    for (const key of Object.keys(/** @type {Record<string, unknown>} */ (value)).sort()) {
      sorted[key] = canonicalize(/** @type {Record<string, unknown>} */ (value)[key], visited);
    }
    result = sorted;
  }
  visited.delete(/** @type {object} */ (value));
  return result;
}

/**
 * @param {unknown} payload
 * @returns {Promise<string>}
 */
export async function hashPayload(payload) {
  const text = JSON.stringify(canonicalize(payload ?? null));
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
