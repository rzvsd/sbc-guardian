(function initContentBridge(globalScope) {
  "use strict";

  const PAGE_SOURCE = "fsu-extension-page";
  const CONTENT_SOURCE = "fsu-extension-content";
  const LODASH_VENDOR_PATH = "vendor/lodash.min.js";
  const INJECTED_SCRIPTS = [
    LODASH_VENDOR_PATH,
    "src/page-runtime.js",
    "src/userscript.js"
  ];
  const MAX_STORAGE_VALUE_BYTES = 4 * 1024 * 1024;
  const STORAGE_KEYS = new Set([
    "SBCCount",
    "academy",
    "apiproxy",
    "build",
    "futbinId",
    "history",
    "packsSort",
    "players",
    "sbclist",
    "set"
  ]);

  class StoragePolicy {
    isAllowedKey(key) {
      return (
        STORAGE_KEYS.has(key) ||
        /^lock_\d{2}$/.test(key) ||
        /^playerMetaData_\d{2}$/.test(key)
      );
    }

    isAllowedValue(key, value) {
      if (value === undefined) return true;
      if (key === "packsSort") return value === "asc" || value === "desc";
      if (key === "apiproxy") {
        return typeof value === "string" && value.length <= 2048;
      }

      try {
        return new TextEncoder().encode(JSON.stringify(value)).byteLength <=
          MAX_STORAGE_VALUE_BYTES;
      } catch {
        return false;
      }
    }

    filter(items) {
      return Object.fromEntries(
        Object.entries(items || {}).filter(([key, value]) =>
          this.isAllowedKey(key) && this.isAllowedValue(key, value)
        )
      );
    }
  }

  function isExtensionContextValid(runtimeApi) {
    try {
      return Boolean(runtimeApi?.id);
    } catch {
      return false;
    }
  }

  class ExtensionContextGuard {
    constructor(runtimeApi) {
      this.runtimeApi = runtimeApi;
      this.notified = false;
    }

    isValid() {
      return isExtensionContextValid(this.runtimeApi);
    }

    warnOnce() {
      if (this.notified) return;
      this.notified = true;
      console.warn(
        "[FSU extension] Extension was reloaded or updated. Refresh this FUT tab (F5) to restore FSU features."
      );
    }
  }

  class ScriptInjector {
    constructor({ documentRef, runtimeApi }) {
      this.documentRef = documentRef;
      this.runtimeApi = runtimeApi;
    }

    appendScript(script) {
      const parent = this.documentRef.head || this.documentRef.documentElement;
      parent.appendChild(script);
    }

    injectFile(path) {
      return new Promise((resolve, reject) => {
        const script = this.documentRef.createElement("script");
        script.src = this.runtimeApi.getURL(path);
        script.async = false;
        script.onload = () => {
          script.remove();
          resolve();
        };
        script.onerror = () => {
          script.remove();
          reject(new Error(`Failed to inject ${path}`));
        };
        this.appendScript(script);
      });
    }

    async injectLodash() {
      await this.injectFile(LODASH_VENDOR_PATH);
    }

    waitForRuntimeReady(windowRef, timeoutMs = 5000) {
      if (!windowRef || typeof windowRef.addEventListener !== "function") {
        return Promise.reject(new Error("FSU page runtime: invalid window reference"));
      }

      return new Promise((resolve, reject) => {
        const onMessage = (event) => {
          if (event.source !== windowRef) return;
          const message = event.data;
          if (!message || message.source !== PAGE_SOURCE || message.type !== "FSU_REQUEST_INIT") return;
          windowRef.removeEventListener("message", onMessage);
          clearTimeout(timer);
          resolve();
        };

        const timer = setTimeout(() => {
          windowRef.removeEventListener("message", onMessage);
          reject(new Error("FSU page runtime init timed out"));
        }, timeoutMs);

        windowRef.addEventListener("message", onMessage);
      });
    }

    async injectAll(paths, storage, windowRef) {
      const runtimeIndex = paths.indexOf("src/page-runtime.js");
      if (runtimeIndex === -1) {
        throw new Error("src/page-runtime.js missing from injection list");
      }

      const beforeRuntime = paths.slice(0, runtimeIndex);
      const afterRuntime = paths.slice(runtimeIndex + 1);
      const runtimePath = paths[runtimeIndex];

      for (const path of beforeRuntime) {
        if (path === LODASH_VENDOR_PATH) {
          await this.injectLodash();
        } else {
          await this.injectFile(path);
        }
      }

      const readyPromise = this.waitForRuntimeReady(windowRef);
      await this.injectFile(runtimePath);
      await readyPromise;

      windowRef.postMessage(
        {
          source: CONTENT_SOURCE,
          type: "FSU_INIT_STORAGE",
          storage
        },
        "*"
      );
      await new Promise((resolve) => setTimeout(resolve, 0));

      for (const path of afterRuntime) {
        await this.injectFile(path);
      }
    }
  }

  class ExtensionStorage {
    constructor(storageArea, runtimeApi, contextGuard, policy = new StoragePolicy()) {
      this.storageArea = storageArea;
      this.runtimeApi = runtimeApi;
      this.contextGuard = contextGuard;
      this.policy = policy;
    }

    getAll() {
      return new Promise((resolve) => {
        if (!this.contextGuard.isValid()) {
          this.contextGuard.warnOnce();
          resolve({});
          return;
        }

        try {
          let settled = false;
          const finish = (items) => {
            if (settled) return;
            settled = true;
            resolve(this.policy.filter(items));
          };
          const handleError = (error) => {
            if (settled) return;
            settled = true;
            console.warn("[FSU extension] Failed to read storage:", error?.message || error);
            resolve({});
          };
          const result = this.storageArea.get(null, (items) => {
            if (this.runtimeApi.lastError) {
              handleError(this.runtimeApi.lastError);
              return;
            }
            finish(items);
          });
          if (result && typeof result.then === "function") {
            result.then(finish).catch(handleError);
          }
        } catch {
          this.contextGuard.warnOnce();
          resolve({});
        }
      });
    }

    setValue(key, value) {
      if (!this.policy.isAllowedKey(key) || !this.policy.isAllowedValue(key, value)) {
        console.warn("[FSU extension] Rejected storage write outside the allowed schema.");
        return false;
      }

      if (!this.contextGuard.isValid()) {
        this.contextGuard.warnOnce();
        return false;
      }

      try {
        let result;
        if (value === undefined) {
          result = this.storageArea.remove(key);
        } else {
          result = this.storageArea.set({ [key]: value });
        }
        if (result && typeof result.catch === "function") {
          result.catch(() => this.contextGuard.warnOnce());
        }
        return true;
      } catch {
        this.contextGuard.warnOnce();
        return false;
      }
    }
  }

  class RuntimeMessenger {
    constructor(runtimeApi, contextGuard) {
      this.runtimeApi = runtimeApi;
      this.contextGuard = contextGuard;
    }

    isValid() {
      return this.contextGuard.isValid();
    }

    send(payload) {
      if (!this.isValid()) {
        this.contextGuard.warnOnce();
        return Promise.resolve({
          ok: false,
          error: {
            name: "ExtensionInvalidated",
            message: "Extension context invalidated. Refresh this page."
          }
        });
      }

      return new Promise((resolve) => {
        try {
          let settled = false;
          const finish = (response) => {
            if (settled) return;
            settled = true;
            resolve(response || { ok: false, error: { name: "RuntimeError", message: "No response." } });
          };
          const fail = (error) => {
            if (settled) return;
            settled = true;
            resolve({
              ok: false,
              error: {
                name: "RuntimeError",
                message: error?.message || "Runtime message failed."
              }
            });
          };
          const result = this.runtimeApi.sendMessage(payload, (response) => {
            if (this.runtimeApi.lastError) {
              fail(this.runtimeApi.lastError);
              return;
            }
            finish(response);
          });
          if (result && typeof result.then === "function") {
            result.then(finish).catch(fail);
          }
        } catch (error) {
          this.contextGuard.warnOnce();
          resolve({
            ok: false,
            error: {
              name: "ExtensionInvalidated",
              message: error?.message || "Extension context invalidated."
            }
          });
        }
      });
    }
  }

  class PageBridge {
    constructor({ windowRef, storage, messenger, contextGuard }) {
      this.windowRef = windowRef;
      this.storage = storage;
      this.messenger = messenger;
      this.contextGuard = contextGuard;
      this.handlePageMessage = this.handlePageMessage.bind(this);
    }

    start() {
      this.windowRef.addEventListener("message", this.handlePageMessage);
    }

    postToPage(message) {
      this.windowRef.postMessage(
        {
          source: CONTENT_SOURCE,
          ...message
        },
        "*"
      );
    }

    handlePageMessage(event) {
      if (event.source !== this.windowRef) return;

      const message = event.data;
      if (!message || message.source !== PAGE_SOURCE) return;

      if (!this.contextGuard.isValid()) {
        this.notifyInvalidated();
        return;
      }

      if (message.type === "GM_SET_VALUE") {
        this.handleSetValue(message);
        return;
      }

      if (message.type === "GM_XMLHTTP_REQUEST") {
        this.forwardXmlHttpRequest(message);
        return;
      }

      if (message.type === "GUARDIAN_API_REQUEST") {
        this.forwardGuardianApiRequest(message);
        return;
      }

      if (message.type === "GUARDIAN_NATIVE_CONFIRM") {
        this.forwardNativeConfirmation(message);
        return;
      }

      if (message.type === "GM_OPEN_IN_TAB") {
        this.forwardOpenInTab(message);
      }
    }

    notifyInvalidated() {
      this.contextGuard.warnOnce();
      this.postToPage({
        type: "FSU_EXTENSION_INVALIDATED",
        message: "FSU 擴充功能已重新載入，請按 F5 重新整理此頁面以恢復 FSU 功能。"
      });
    }

    handleSetValue(message) {
      if (typeof message.key !== "string") return;
      this.storage.setValue(message.key, message.value);
    }

    forwardXmlHttpRequest(message) {
      this.messenger
        .send({
          source: CONTENT_SOURCE,
          type: "GM_XMLHTTP_REQUEST",
          requestId: message.requestId,
          details: message.details
        })
        .then((response) => {
          this.postToPage({
            type: "GM_XMLHTTP_RESPONSE",
            requestId: message.requestId,
            ...response
          });
        })
        .catch((error) => {
          this.postToPage({
            type: "GM_XMLHTTP_RESPONSE",
            requestId: message.requestId,
            ok: false,
            error: {
              name: "ExtensionInvalidated",
              message: error?.message || "Extension context invalidated."
            }
          });
      });
    }

    forwardGuardianApiRequest(message) {
      this.messenger
        .send({
          source: CONTENT_SOURCE,
          type: "GUARDIAN_API_REQUEST",
          requestId: message.requestId,
          request: message.request
        })
        .then((response) => {
          this.postToPage({
            type: "GUARDIAN_API_RESPONSE",
            requestId: message.requestId,
            ...response
          });
        })
        .catch((error) => {
          this.postToPage({
            type: "GUARDIAN_API_RESPONSE",
            requestId: message.requestId,
            ok: false,
            error: {
              name: "ExtensionInvalidated",
              message: error?.message || "Extension context invalidated."
            }
          });
        });
    }

    forwardNativeConfirmation(message) {
      this.messenger
        .send({
          source: CONTENT_SOURCE,
          type: "GUARDIAN_NATIVE_CONFIRM",
          requestId: message.requestId,
          preview: message.preview
        })
        .then((response) => {
          this.postToPage({
            type: "GUARDIAN_NATIVE_CONFIRM_RESPONSE",
            requestId: message.requestId,
            ...response
          });
        })
        .catch((error) => {
          this.postToPage({
            type: "GUARDIAN_NATIVE_CONFIRM_RESPONSE",
            requestId: message.requestId,
            ok: false,
            error: { name: "ExtensionInvalidated", message: error?.message || "Extension context invalidated." }
          });
        });
    }

    forwardOpenInTab(message) {
      this.messenger
        .send({
          source: CONTENT_SOURCE,
          type: "GM_OPEN_IN_TAB",
          url: message.url,
          options: message.options
        })
        .then((response) => {
          if (!response || !response.ok) {
            console.warn("[FSU extension] GM_openInTab failed:", response && response.error);
          }
        })
        .catch((error) => {
          console.warn("[FSU extension] GM_openInTab failed:", error);
        });
    }
  }

  class ContentBridgeApp {
    constructor({ windowRef, documentRef, extensionApi, scripts }) {
      this.windowRef = windowRef;
      this.contextGuard = new ExtensionContextGuard(extensionApi.runtime);
      this.storage = new ExtensionStorage(extensionApi.storage.local, extensionApi.runtime, this.contextGuard);
      this.injector = new ScriptInjector({ documentRef, runtimeApi: extensionApi.runtime });
      this.pageBridge = new PageBridge({
        windowRef,
        storage: this.storage,
        messenger: new RuntimeMessenger(extensionApi.runtime, this.contextGuard),
        contextGuard: this.contextGuard
      });
      this.scripts = scripts;
    }

    async boot() {
      this.pageBridge.start();
      const storage = await this.storage.getAll();
      await this.injector.injectAll(this.scripts, storage, this.windowRef);
    }
  }

  const extensionApi = globalScope.browser || globalScope.chrome;
  if (!extensionApi) {
    throw new Error("FSU extension API unavailable");
  }

  new ContentBridgeApp({
    windowRef: globalScope,
    documentRef: globalScope.document,
    extensionApi,
    scripts: INJECTED_SCRIPTS
  })
    .boot()
    .catch((error) => {
      console.error("[FSU extension] Failed to bootstrap userscript:", error);
    });
})(window);
