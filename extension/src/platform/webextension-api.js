(function initExtApi() {
  "use strict";

  // Normalize the WebExtension API surface between Chrome (`chrome.*`) and
  // GeckoView/Firefox (`browser.*`). The background core and the Android
  // message bridge consume this adapter instead of touching a concrete namespace.
  var browserNs = typeof browser !== "undefined" ? browser : undefined;
  var chromeNs = typeof chrome !== "undefined" ? chrome : undefined;
  var namespace = browserNs ? "gecko" : chromeNs ? "chrome" : "unknown";
  var ns = browserNs || chromeNs;

  var api = {
    namespace: namespace,
    runtime: ns ? ns.runtime : undefined,
    tabs: ns ? ns.tabs : undefined,
    storage: ns ? ns.storage : undefined
  };

  if (typeof globalThis !== "undefined") {
    globalThis.__fsuExtApi = api;
  }
})(void 0);
