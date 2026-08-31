(function initGeckoBackground(globalScope) {
  "use strict";

  // GeckoView / Firefox MV3 entry point: thin wrapper around the shared core.
  // GeckoView exposes the WebExtension API as `browser.*`; the core is API-agnostic.
  if (typeof importScripts === "function") {
    importScripts("platform/background-core.js");
  }

  const core = (typeof globalThis !== "undefined" ? globalThis : self).__fsuBackgroundCore;
  const browserApi = globalScope.browser || globalScope.chrome;
  let nativePort = null;
  let sessionNonce = null;
  const pendingConfirmations = new Map();
  const allowedNativeTypes = new Set([
    "HELLO", "GET_APP_SETTINGS", "SET_APP_SETTINGS", "CAPABILITY_STATUS",
    "ACTION_PREVIEW", "ACTION_DECISION", "ACTION_RESULT", "SESSION_SYNC",
    "SESSION_CLEAR", "DIAGNOSTIC"
  ]);

  function nativeEnvelope(type, payload, requestId = null) {
    return {
      protocolVersion: 1,
      messageId: `native-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      requestId,
      sessionNonce,
      type,
      payload: payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {},
      ts: new Date().toISOString()
    };
  }

  function isValidNativeEnvelope(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) return false;
    const keys = Object.keys(message);
    const allowedKeys = new Set(["protocolVersion", "messageId", "requestId", "sessionNonce", "type", "payload", "ts"]);
    return message.protocolVersion === 1
      && keys.every((key) => allowedKeys.has(key))
      && typeof message.messageId === "string" && message.messageId.length > 0
      && (message.requestId === null || typeof message.requestId === "string")
      && typeof message.sessionNonce === "string" && message.sessionNonce.length >= 16
      && allowedNativeTypes.has(message.type)
      && message.payload && typeof message.payload === "object" && !Array.isArray(message.payload)
      && typeof message.ts === "string" && Number.isFinite(Date.parse(message.ts));
  }

  const guardianConfirmationService = {
    request(preview) {
      if (!nativePort || !sessionNonce) {
        return Promise.reject(new Error("Native confirmation unavailable"));
      }
      const messageId = `guardian-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingConfirmations.delete(messageId);
          reject(new Error("Native confirmation timed out"));
        }, 60_000);
        pendingConfirmations.set(messageId, { resolve, reject, timeout });
        const envelope = nativeEnvelope("ACTION_PREVIEW", preview);
        envelope.messageId = messageId;
        nativePort.postMessage(envelope);
      });
    }
  };

  if (core && core.registerBackground && browserApi) {
    core.registerBackground({
      runtime: browserApi.runtime,
      tabs: browserApi.tabs,
      storage: browserApi.storage && browserApi.storage.local,
      guardianConfirmationService,
      fetchImpl: typeof fetch !== "undefined" ? fetch.bind(globalScope) : fetch
    });
  }

  if (browserApi && browserApi.runtime && typeof browserApi.runtime.connectNative === "function") {
    try {
      nativePort = browserApi.runtime.connectNative("fsu");
      nativePort.onMessage.addListener((message) => {
        if (!isValidNativeEnvelope(message)) return;
        if (message.type === "HELLO") {
          sessionNonce = message.sessionNonce;
          return;
        }
        if (message.sessionNonce !== sessionNonce) return;
        if (message.type === "ACTION_DECISION") {
          const pending = pendingConfirmations.get(message.requestId);
          if (!pending || typeof message.payload?.approved !== "boolean") return;
          clearTimeout(pending.timeout);
          pendingConfirmations.delete(message.requestId);
          pending.resolve(message.payload.approved);
          return;
        }
        if (message.type === "SESSION_SYNC") {
          const session = message.payload && message.payload.session;
          if (typeof session === "string" && /^[A-Za-z0-9_-]{32,256}$/.test(session)) {
            browserApi.storage.local.set({ "guardian.session": session });
          }
        }
        if (message.type === "SESSION_CLEAR") {
          browserApi.storage.local.remove("guardian.session");
        }
      });
      nativePort.onDisconnect.addListener(() => {
        nativePort = null;
        sessionNonce = null;
        for (const pending of pendingConfirmations.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("Native confirmation disconnected"));
        }
        pendingConfirmations.clear();
      });
    } catch {
      // Chrome and non-Gecko hosts do not provide the embedded native app.
    }
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
