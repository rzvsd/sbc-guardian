"use strict";

const fs = require("fs");
const path = require("path");

/** Load background.js exports in Node (MV3 entry stays .js for Chrome). */
function loadBackground(extensionRoot) {
  const filePath = path.join(extensionRoot, "src", "background.js");
  const code = fs.readFileSync(filePath, "utf8");
  const module = { exports: {} };
  const chromeStub = {
    runtime: { onMessage: { addListener() {} } },
    tabs: {}
  };

  // Run as classic script so module.exports matches Node test expectations.
  // Resolve relative requires (e.g. ./platform/background-core.js) against src/,
  // matching how importScripts resolves inside the real service worker.
  function srcRequire(spec) {
    const rel = String(spec).replace(/^\.\//, "");
    const resolved = path.resolve(extensionRoot, "src", rel);
    return require(resolved);
  }
  const runner = new Function(
    "module",
    "exports",
    "globalThis",
    "self",
    "chrome",
    "fetch",
    "URL",
    "require",
    code
  );
  runner(module, module.exports, globalThis, globalThis, chromeStub, fetch, URL, srcRequire);

  return module.exports;
}

module.exports = { loadBackground };