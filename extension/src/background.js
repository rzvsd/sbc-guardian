(function initChromeBackground(globalScope) {
  "use strict";

  // Chrome MV3 entry point: a thin wrapper around the shared background core.
  // Common logic lives in src/platform/background-core.js so GeckoView reuses it.
  if (typeof importScripts === "function") {
    importScripts("platform/background-core.js");
  } else if (typeof require === "function") {
    require("./platform/background-core.js");
  }

  const core = (typeof globalThis !== "undefined" ? globalThis : self).__fsuBackgroundCore;

  if (core && core.registerBackground) {
    core.registerBackground({
      runtime: globalScope.chrome && globalScope.chrome.runtime,
      tabs: globalScope.chrome && globalScope.chrome.tabs,
      storage: globalScope.chrome && globalScope.chrome.storage && globalScope.chrome.storage.local,
      fetchImpl: typeof fetch !== "undefined" ? fetch.bind(globalScope) : fetch
    });
  }

  if (typeof module !== "undefined" && module.exports && core) {
    Object.assign(module.exports, core);
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
