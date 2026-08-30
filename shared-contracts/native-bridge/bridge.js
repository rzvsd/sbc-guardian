"use strict";

/**
 * Runtime validator for the shared native message bridge envelope.
 * Mirrors shared-contracts/native-bridge/envelope.schema.json.
 *
 * The Android wrapper (GeckoView) and the FSU background core both use this shape.
 * Messages with an unknown protocolVersion, unknown type, or empty/missing
 * sessionNonce are rejected fail-closed.
 */

const ALLOWED_TYPES = [
  "HELLO",
  "GET_APP_SETTINGS",
  "SET_APP_SETTINGS",
  "CAPABILITY_STATUS",
  "ACTION_PREVIEW",
  "ACTION_DECISION",
  "ACTION_RESULT",
  "SESSION_SYNC",
  "SESSION_CLEAR",
  "DIAGNOSTIC"
];

/** @returns {string} */
function newMessageId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `m-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * @param {string} sessionNonce
 * @param {string} type
 * @param {object} [payload]
 * @param {string|null} [requestId]
 */
function createEnvelope(sessionNonce, type, payload = {}, requestId = null) {
  return {
    protocolVersion: 1,
    messageId: newMessageId(),
    requestId,
    sessionNonce,
    type,
    payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {},
    ts: new Date().toISOString()
  };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, envelope: object } | { ok: false, error: string }}
 */
function validateEnvelope(raw) {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "Envelope must be an object." };
  }
  const envelope = /** @type {any} */ (raw);

  if (envelope.protocolVersion !== 1) {
    return { ok: false, error: "Unsupported protocolVersion." };
  }
  if (typeof envelope.messageId !== "string" || envelope.messageId.length === 0) {
    return { ok: false, error: "messageId must be a non-empty string." };
  }
  if (!(envelope.requestId === null || typeof envelope.requestId === "string")) {
    return { ok: false, error: "requestId must be null or a string." };
  }
  if (typeof envelope.ts !== "string" || !Number.isFinite(Date.parse(envelope.ts))) {
    return { ok: false, error: "ts must be a valid ISO timestamp." };
  }
  if (typeof envelope.sessionNonce !== "string" || envelope.sessionNonce.length < 16) {
    return { ok: false, error: "sessionNonce missing or too short." };
  }
  if (!ALLOWED_TYPES.includes(envelope.type)) {
    return { ok: false, error: `Unknown message type: ${String(envelope.type)}` };
  }
  if (!envelope.payload || typeof envelope.payload !== "object" || Array.isArray(envelope.payload)) {
    return { ok: false, error: "payload must be an object." };
  }
  const allowedKeys = new Set([
    "protocolVersion",
    "messageId",
    "requestId",
    "sessionNonce",
    "type",
    "payload",
    "ts"
  ]);
  for (const key of Object.keys(envelope)) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unknown envelope field: ${key}` };
    }
  }

  return { ok: true, envelope };
}

module.exports = {
  ALLOWED_TYPES,
  createEnvelope,
  validateEnvelope
};
