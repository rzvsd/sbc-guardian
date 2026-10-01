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

  // Some GeckoView releases install the built-in extension successfully but
  // do not attach declarative content scripts to the first top-level page.
  // Register a narrow, idempotent fallback at navigation completion. The
  // content bridge itself has a once-per-page guard, so runtimes that support
  // declarative injection do not receive a duplicate bootstrap.
  const injectContentBridge = (tabId, url) => {
    if (!/^https:\/\/(www\.)?ea\.com\/.+ultimate-team\/web-app(?:\/|$)/i.test(url)) return;
      if (nativePort) {
        nativePort.postMessage(nativeEnvelope("DIAGNOSTIC", { stage: "content-fallback-attempt", href: url }));
      }
      Promise.resolve(browserApi.tabs.executeScript(tabId, {
        file: "src/content-bridge.js",
        runAt: "document_idle"
      })).catch(() => {
        if (nativePort) {
          nativePort.postMessage(nativeEnvelope("DIAGNOSTIC", { stage: "content-fallback-failed", href: url }));
        }
        // Declarative content scripts remain the primary path; this fallback
        // is best-effort on GeckoView versions without executeScript support.
      });
  };

  if (browserApi?.tabs?.onUpdated && typeof browserApi.tabs.executeScript === "function") {
    browserApi.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      if (changeInfo?.status !== "complete") return;
      injectContentBridge(tabId, String(tab?.url || ""));
    });
    // The extension may be installed after the GeckoSession already reached
    // the page, so also cover the current tab immediately at startup.
    Promise.resolve(browserApi.tabs.query({ active: true, currentWindow: true }))
      .then((tabs) => tabs.forEach((tab) => injectContentBridge(tab.id, String(tab.url || ""))))
      .catch(() => {});
  }

  if (browserApi?.runtime?.onMessage) {
    browserApi.runtime.onMessage.addListener((message, sender) => {
      if (message?.source !== "fsu-extension-content" || message?.type !== "DIAGNOSTIC") return false;
      if (nativePort) {
        nativePort.postMessage(nativeEnvelope("DIAGNOSTIC", {
          stage: String(message.stage || "unknown"),
          href: String(message.href || sender?.url || "")
        }));
      }
      return false;
    });
  }

  if (browserApi && browserApi.runtime && typeof browserApi.runtime.connectNative === "function") {
    try {
      nativePort = browserApi.runtime.connectNative("fsu");
      nativePort.postMessage(nativeEnvelope("DIAGNOSTIC", {
        stage: "background-ready",
        tabsUpdated: Boolean(browserApi.tabs?.onUpdated),
        executeScript: typeof browserApi.tabs?.executeScript === "function"
      }));
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
