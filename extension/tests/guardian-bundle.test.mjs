import assert from "node:assert";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import vm from "node:vm";
import { createRequire } from "module";
import esbuild from "esbuild";
import { setGuardian } from "../src/guardian/runtime.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Finding #1 (CRITICAL, round 2): the PUBLIC bundle surface must not expose the
// facade or any approval/execution path. We build the REAL bundle from source
// (incl. the .css text loader via esbuild) and prove, behaviorally, that:
//   1. window.__guardian.guardian === undefined
//   2. requestGuarded(kind, payload, maliciousOptions) does NOT run onPreview
//   3. external auto-approve => zero mutation
//   4. prepare/approve/execute/runRegistered/registerMutation/dismiss => undefined
//   5. overwriting the API does not change its methods (frozen)
//   6. legitimate flow (internal requestGuarded + trusted click) => exactly one
//      mutation
// Plus we inspect the REAL distribution ZIP.
// ---------------------------------------------------------------------------

const allNodes = [];
function makeNode(tag) {
  const node = {
    tagName: tag,
    className: "",
    textContent: "",
    _listeners: {},
    children: [],
    style: {},
    _attrs: {},
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); }
    },
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    appendChild(c) { c._parent = this; this.children.push(c); return c; },
    removeChild(c) { this.children = this.children.filter((x) => x !== c); },
    remove() {
      if (this._parent) this._parent.removeChild(this);
    },
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn); },
    removeEventListener(type, fn) {
      if (this._listeners[type]) this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
    },
    dispatchEvent(ev) { (this._listeners[ev.type] || []).forEach((fn) => fn(ev)); return true; }
  };
  allNodes.push(node);
  return node;
}

function findBtn(root, classNameIncludes) {
  const stack = [root, ...root.children];
  while (stack.length) {
    const n = stack.pop();
    const cn = n && n.className;
    if (cn && cn.includes(classNameIncludes)) return n;
    if (n && n.children) stack.push(...n.children);
  }
  return null;
}

const winListeners = {};
const sandboxWindow = {
  location: { href: "https://www.ea.com/ultimate-team/web-app" },
  addEventListener(type, fn) { (winListeners[type] = winListeners[type] || []).push(fn); },
  removeEventListener() {},
  dispatchEvent(ev) { (winListeners[ev.type] || []).forEach((fn) => fn(ev)); return true; },
  crypto: globalThis.crypto
};
const sandboxDocument = {
  createElement: (t) => makeNode(t),
  head: makeNode("head"),
  body: makeNode("body")
};

const entry = `
import { mountGuardian } from "./src/guardian/index.js";
import { getGuardian, setGuardian } from "./src/guardian/runtime.js";
import { guardianOrFailClosed } from "./src/guardian/mode.js";
globalThis.__mountGuardian = mountGuardian;
globalThis.__getGuardian = getGuardian;
globalThis.__setGuardian = setGuardian;
globalThis.__guardianOrFailClosed = guardianOrFailClosed;
`;

const built = await esbuild.build({
  stdin: { contents: entry, resolveDir: root, loader: "js" },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  loader: { ".css": "text" },
  define: { __FSU_DISTRIBUTED__: "true" }
});
const bundleCode = built.outputFiles[0].text;

const sandbox = {
  window: sandboxWindow,
  document: sandboxDocument,
  console,
  setTimeout,
  clearTimeout,
  crypto: globalThis.crypto,
  TextEncoder,
  TextDecoder,
  Date,
  Math,
  JSON,
  Promise,
  Map,
  Set,
  Object,
  Array,
  String,
  Number,
  Boolean,
  Error
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(bundleCode, sandbox);

const mountGuardian = sandbox.__mountGuardian;
const getGuardian = sandbox.__getGuardian;
assert.ok(typeof mountGuardian === "function", "real bundle exposes mountGuardian");
assert.ok(typeof getGuardian === "function", "real bundle exposes getGuardian (test-only)");
const api = mountGuardian({ window: sandboxWindow, document: sandboxDocument });
assert.ok(api && typeof api.requestGuarded === "function", "window.__guardian.requestGuarded exists");
assert.equal(
  allNodes.some((node) => node.getAttribute?.("data-guardian-root") === "true"),
  false,
  "mountGuardian must not create the legacy DOM UI root"
);

// 1 + 4. No facade / approval / execution surface on the public object.
assert.equal(api.guardian, undefined, "window.__guardian.guardian must be undefined");
assert.equal(api.state, undefined, "no state");
assert.equal(api.features, undefined, "no features");
assert.equal(api.nonce, undefined, "no nonce");
assert.equal(api.t, undefined, "no translator");
assert.equal(api.root, undefined, "no root");
for (const m of ["prepare", "approve", "execute", "runRegistered", "registerMutation", "registerMutations", "dismiss", "defaultPreviewHandler", "originals", "pending", "gate"]) {
  assert.equal(api[m], undefined, `window.__guardian.${m} must be undefined`);
}

// 5. Frozen public surface.
assert.equal(Object.isFrozen(api), true, "window.__guardian must be frozen");
{
  const orig = api.requestGuarded;
  try {
    api.requestGuarded = () => "hacked";
  } catch {
    // Assignment to a frozen property throws in strict mode; either way the
    // public surface must remain unchanged.
  }
  assert.equal(api.requestGuarded, orig, "frozen API cannot be overwritten (attempt threw or was ignored)");
}

// 2 + 3. External onPreview is ignored and yields zero mutation.
{
  let onPreviewCalled = false;
  const p = api.requestGuarded("MARKET_BUY", { defId: 1 }, { onPreview: () => { onPreviewCalled = true; } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(onPreviewCalled, false, "external onPreview is ignored by the public API");
  // The internal dialog path is used instead (a node was appended to body).
  assert.ok(sandboxDocument.body.children.length > 0, "internal confirmation dialog is shown (not external onPreview)");
  const closePending = findBtn(sandboxDocument.body, "guardian-btn-danger");
  assert.ok(closePending, "internal dialog owns the pending action");
  closePending.dispatchEvent({ type: "click", isTrusted: true });
  await assert.rejects(() => p, /GUARDIAN_UNKNOWN_MUTATION/);
}

// 6. Legitimate flow: internal requestGuarded + a REAL trusted click => one mutation.
{
  const guardian = getGuardian();
  let mutations = 0;
  guardian.registerMutation("MARKET_BUY", () => {
    mutations++;
    return { ok: true };
  });
  const p = api.requestGuarded("MARKET_BUY", { defId: 1 });
  // The confirmation dialog is rendered asynchronously (prepare is async), so
  // wait a tick before locating the button.
  await new Promise((r) => setTimeout(r, 0));
  const acceptBtn = findBtn(sandboxDocument.body, "guardian-btn-danger");
  assert.ok(acceptBtn, "confirmation dialog rendered with an Accept button");
  // Simulate a genuine user gesture (trusted event) on the Accept button.
  acceptBtn.dispatchEvent({ type: "click", isTrusted: true });
  await p;
  assert.equal(mutations, 1, "trusted Accept click => exactly one mutation");
}

// ---- Bundle string checks ----
// The bundle must NOT expose `registerMutations` as a property of the public
// guardian api. (The substring also occurs inside the function name
// `registerFsuMutations`, so we check the property-key form `registerMutations:`.)
assert.ok(!bundleCode.includes("registerMutations:"), "bundle: no registerMutations public property");
assert.ok(bundleCode.includes("requestGuarded:"), "bundle: requestGuarded public property present");
assert.ok(bundleCode.includes("GUARDIAN_UNAVAILABLE"), "bundle: fail-closed code present");
assert.ok(bundleCode.includes("guardianOrFailClosed"), "bundle: fail-closed routing present");
assert.ok(bundleCode.includes("PACK_OPEN_BULK"), "bundle: PACK_OPEN_BULK kind present");
assert.ok(!bundleCode.includes("EaMock"), "bundle: preview EA mock must not ship");
assert.ok(!bundleCode.includes("Prototype scenarios"), "bundle: preview scenarios must not ship");
assert.ok(!bundleCode.includes("mock/data"), "bundle: preview mock data must not ship");

// ---- ZIP inspection ----
const AdmZip = require("adm-zip");
const distDir = fs.mkdtempSync(path.join(os.tmpdir(), "guardian-bundle-"));
let zipUserscript;
try {
  require("child_process").execFileSync("node", ["scripts/package-extension.cjs"], {
    cwd: root,
    env: { ...process.env, FSU_DIST_DIR: distDir },
    stdio: "inherit"
  });
  const zipName = fs.readdirSync(distDir).find((f) => f.endsWith(".zip"));
  assert.ok(zipName, "distribution ZIP was produced");
  const zip = new AdmZip(path.join(distDir, zipName));
  const userscriptEntry = zip.getEntry("src/userscript.js");
  assert.ok(userscriptEntry, "ZIP contains src/userscript.js");
  zipUserscript = userscriptEntry.getData().toString("utf8");
} finally {
  fs.rmSync(distDir, { recursive: true, force: true });
}

assert.ok(!zipUserscript.includes("registerMutations:"), "ZIP: no registerMutations public property in shipped userscript");
assert.ok(zipUserscript.includes("requestGuarded:"), "ZIP: requestGuarded public property in shipped userscript");
assert.ok(zipUserscript.includes("GUARDIAN_UNAVAILABLE"), "ZIP: fail-closed present in shipped userscript");
assert.ok(zipUserscript.includes("guardianOrFailClosed"), "ZIP: fail-closed routing present in shipped userscript");
assert.ok(zipUserscript.includes("GuardianMutationFacade"), "ZIP: Guardian facade present in shipped userscript");
assert.ok(
  zipUserscript.includes("MarketActionService") &&
    zipUserscript.includes("StorePackOpenTransactionService") &&
    zipUserscript.includes("SbcSubmitTransactionService") &&
    zipUserscript.includes("BulkPackOpenService"),
  "ZIP: all four rerouted services present in shipped userscript"
);
assert.ok(zipUserscript.includes("PACK_OPEN_BULK"), "ZIP: PACK_OPEN_BULK kind present in shipped userscript");
assert.ok(!zipUserscript.includes("EaMock"), "ZIP: preview EA mock must not ship");
assert.ok(!zipUserscript.includes("Prototype scenarios"), "ZIP: preview scenarios must not ship");
assert.ok(!zipUserscript.includes("mock/data"), "ZIP: preview mock data must not ship");

console.log("guardian-bundle (real bundle + ZIP, Finding #1): all assertions passed");

// Reset the global guardian so subsequent guardian tests start clean (this test
// calls the source mountGuardian, which sets the shared global).
setGuardian(null);
