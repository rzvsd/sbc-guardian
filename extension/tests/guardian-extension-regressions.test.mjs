import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

import { GuardianBridge } from "../src/guardian/GuardianBridge.js";
import { createGuardianRuntime, setGuardian } from "../src/guardian/runtime.js";
import { SbcSubmitTransactionService } from "../src/fsu/domain/SbcSubmitTransactionService.js";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function makeDocument(onAppend) {
  const makeNode = (tag) => ({
    tagName: tag,
    src: "",
    async: false,
    onload: null,
    onerror: null,
    remove() {},
    setAttribute() {},
    appendChild() {},
  });
  const head = {
    appendChild(node) {
      onAppend(node);
      return node;
    },
  };
  return {
    head,
    documentElement: head,
    createElement: makeNode,
  };
}

async function assertGeckoContentBridgeUsesBrowserNamespace() {
  const source = fs.readFileSync(path.join(root, "src", "content-bridge.js"), "utf8");
  const listeners = new Map();
  const injected = [];
  const windowRef = {
    browser: {
      runtime: {
        id: "gecko-extension",
        lastError: null,
        getURL: (value) => value,
        sendMessage: (_payload, callback) => callback({ ok: true }),
      },
      storage: {
        local: {
          get: (_key, callback) => callback({}),
          set() {},
          remove() {},
        },
      },
    },
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
    postMessage() {},
  };
  const documentRef = makeDocument((script) => {
    injected.push(script.src);
    queueMicrotask(() => {
      if (script.src === "src/page-runtime.js") {
        listeners.get("message")?.({
          source: windowRef,
          data: { source: "fsu-extension-page", type: "FSU_REQUEST_INIT" },
        });
      }
      script.onload?.();
    });
  });
  windowRef.document = documentRef;

  const sandbox = {
    window: windowRef,
    document: documentRef,
    browser: windowRef.browser,
    console: { warn() {}, error() {} },
    TextEncoder,
    setTimeout,
    clearTimeout,
    Promise,
    Map,
    Set,
    Object,
    Array,
    String,
    Number,
    Boolean,
    JSON,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(injected, [
    "vendor/lodash.min.js",
    "src/page-runtime.js",
    "src/userscript.js",
  ]);
}

async function assertGuardedSubmitRetainsObservableContract() {
  const guardian = createGuardianRuntime({ sessionNonce: "submit-regression" });
  guardian.defaultPreviewHandler = (_preview, controls) => controls.approve();
  const observable = {
    observers: [],
    observe(context, callback) {
      this.observers.push({ context, callback });
      return this;
    },
    unobserve() {},
    emit(response) {
      for (const { callback } of this.observers) callback(this, response);
    },
  };
  let invoked = 0;
  const service = new SbcSubmitTransactionService();
  guardian.registerMutation("SBC_SUBMIT", (_payload, _preview, context) =>
    service._interceptImpl(context)
  );
  setGuardian(guardian);
  try {
    const result = service.intercept({
      args: [{ id: 1, canSubmit: () => true }, { id: 2 }],
      observerContext: {},
      invoke: () => {
        invoked++;
        return observable;
      },
      onSuccess() {},
    });
    assert.equal(typeof result.observe, "function");
    assert.equal(invoked, 0, "submit must wait for confirmation before invoking EA");
    await result;
    assert.equal(invoked, 1);
  } finally {
    setGuardian(null);
  }
}

export async function runGuardianExtensionRegressionTests() {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  const packageLock = JSON.parse(fs.readFileSync(path.join(root, "package-lock.json"), "utf8"));
  assert.equal(packageJson.devDependencies["adm-zip"], "0.6.0");
  assert.equal(packageLock.packages[""].devDependencies["adm-zip"], "0.6.0");
  assert.equal(packageLock.packages["node_modules/adm-zip"].version, "0.6.0");

  const bridgeMessages = [];
  new GuardianBridge({
    postMessage: (message) => bridgeMessages.push(message),
    sessionNonce: "bridge-regression-nonce",
  }).notify("HELLO");
  assert.equal(bridgeMessages[0].protocolVersion, 1);
  assert.equal(bridgeMessages[0].version, undefined);
  assert.equal(typeof bridgeMessages[0].messageId, "string");
  assert.equal(bridgeMessages[0].requestId, null);
  assert.equal(typeof bridgeMessages[0].ts, "string");

  const nativeBridge = require("../../shared-contracts/native-bridge/bridge.js");
  const envelope = nativeBridge.createEnvelope(
    "bridge-regression-nonce",
    "HELLO",
    {},
    null
  );
  assert.equal(nativeBridge.validateEnvelope(envelope).ok, true);
  assert.equal(nativeBridge.validateEnvelope({ ...envelope, extra: true }).ok, false);

  await assertGeckoContentBridgeUsesBrowserNamespace();
  await assertGuardedSubmitRetainsObservableContract();
  console.log("guardian-extension-regressions: all assertions passed");
}
