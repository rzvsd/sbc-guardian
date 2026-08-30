import { hashPayload } from "./payloadHash.js";

export const ACTION_KINDS = Object.freeze([
  "SBC_APPLY",
  "SBC_SUBMIT",
  "MARKET_BUY",
  "MARKET_LIST",
  "PACK_OPEN",
  "PACK_OPEN_BULK",
  "BATCH_ACTION",
  "SBC_ANALYZE",
  "SETTING_CHANGE"
]);

const IRREVERSIBLE_KINDS = new Set([
  "SBC_APPLY",
  "SBC_SUBMIT",
  "MARKET_BUY",
  "MARKET_LIST",
  "PACK_OPEN",
  "PACK_OPEN_BULK",
  "BATCH_ACTION"
]);

/**
 * @param {string} prefix
 */
function newId(prefix) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return prefix + crypto.randomUUID();
  }
  return prefix + Date.now().toString(16) + "-" + Math.random().toString(16).slice(2);
}

/**
 * @param {{
 *   kind?: string,
 *   summary?: string,
 *   payload?: unknown,
 *   affectedItemIds?: string[],
 *   costRisk?: string,
 *   now?: () => number,
 *   ttlMs?: number
 * }} spec
 * @returns {Promise<{
 *   actionId: string,
 *   kind: string,
 *   payloadHash: string,
 *   summary: string,
 *   affectedItemIds: string[],
 *   expiresAt: string,
 *   irreversible: boolean
 * }>}
 */
export async function buildActionPreview({
  kind,
  summary,
  payload,
  affectedItemIds = [],
  costRisk,
  now = () => Date.now(),
  ttlMs = 5 * 60 * 1000
} = {}) {
  if (typeof kind !== "string" || !ACTION_KINDS.includes(kind)) {
    throw new Error("unknown action kind: " + String(kind));
  }
  if (typeof summary !== "string" || summary.length === 0) {
    throw new Error("summary required");
  }
  const payloadHash = await hashPayload(payload ?? null);
  const expiresAt = new Date(now() + ttlMs).toISOString();
  return {
    actionId: newId("act-"),
    kind,
    payloadHash,
    summary,
    affectedItemIds: Array.from(affectedItemIds),
    ...(typeof costRisk === "string" && costRisk ? { costRisk } : {}),
    expiresAt,
    irreversible: IRREVERSIBLE_KINDS.has(kind)
  };
}

/**
 * @param {string} kind
 * @returns {boolean}
 */
export function isIrreversibleKind(kind) {
  return IRREVERSIBLE_KINDS.has(kind);
}
