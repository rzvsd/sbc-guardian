(function initPageRuntime(globalScope) {
  "use strict";

  const PAGE_SOURCE = "fsu-extension-page";
  const CONTENT_SOURCE = "fsu-extension-content";
  const STORAGE_PREFIX = "fsu-gm:";

  class CallbackInvoker {
    invoke(callback, payload) {
      if (typeof callback !== "function") return;
      setTimeout(() => callback(payload), 0);
    }
  }

  class LocalStorageFallback {
    constructor(windowRef, prefix) {
      this.windowRef = windowRef;
      this.prefix = prefix;
    }

    read(key) {
      try {
        const raw = this.windowRef.localStorage && this.windowRef.localStorage.getItem(this.prefix + key);
        return raw === null || raw === undefined ? undefined : JSON.parse(raw);
      } catch {
        return undefined;
      }
    }

    write(key, value) {
      try {
        if (!this.windowRef.localStorage) return;
        if (value === undefined) {
          this.windowRef.localStorage.removeItem(this.prefix + key);
          return;
        }
        this.windowRef.localStorage.setItem(this.prefix + key, JSON.stringify(value));
      } catch {
        // localStorage can be unavailable in restricted browser modes.
      }
    }
  }

  class GmValueStore {
    constructor({ initialValues, fallback, postToContent }) {
      this.values = { ...(initialValues || {}) };
      this.fallback = fallback;
      this.postToContent = postToContent;
    }

    mergeInitialValues(initialValues) {
      if (!initialValues || typeof initialValues !== "object") return;
      Object.assign(this.values, initialValues);
    }

    get(key, defaultValue) {
      const stringKey = String(key);

      if (Object.prototype.hasOwnProperty.call(this.values, stringKey)) {
        return this.values[stringKey];
      }

      const fallbackValue = this.fallback.read(stringKey);
      return fallbackValue === undefined ? defaultValue : fallbackValue;
    }

    set(key, value) {
      const stringKey = String(key);

      if (value === undefined) {
        delete this.values[stringKey];
      } else {
        this.values[stringKey] = value;
      }

      this.fallback.write(stringKey, value);
      this.postToContent({
        type: "GM_SET_VALUE",
        key: stringKey,
        value
      });

      return value;
    }
  }

  class RequestSerializer {
    cloneHeaders(headers) {
      if (!headers || typeof headers !== "object") return undefined;

      const clone = {};
      for (const [key, value] of Object.entries(headers)) {
        if (value === undefined || value === null) continue;
        clone[key] = String(value);
      }

      return clone;
    }

    cloneDetails(details) {
      const clone = {
        method: details.method || "GET",
        url: String(details.url)
      };

      const cloneableKeys = [
        "anonymous",
        "binary",
        "data",
        "overrideMimeType",
        "password",
        "responseType",
        "timeout",
        "user"
      ];

      for (const key of cloneableKeys) {
        if (details[key] !== undefined) {
          clone[key] = details[key];
        }
      }

      const headers = this.cloneHeaders(details.headers);
      if (headers) {
        clone.headers = headers;
      }

      return clone;
    }
  }

  class ResponseNormalizer {
    normalize(response) {
      const responseText = response && response.responseText !== undefined ? response.responseText : "";

      return {
        finalUrl: response && response.finalUrl ? response.finalUrl : "",
        readyState: 4,
        status: response && response.status ? response.status : 0,
        statusText: response && response.statusText ? response.statusText : "",
        responseHeaders: response && response.responseHeaders ? response.responseHeaders : "",
        responseText,
        response: response && response.response !== undefined ? response.response : responseText
      };
    }
  }

  class RequestCallbackRegistry {
    constructor({ invoker, responseNormalizer }) {
      this.callbacks = new Map();
      this.invoker = invoker;
      this.responseNormalizer = responseNormalizer;
    }

    add(requestId, details) {
      const timeoutMs = Number(details.timeout) || 0;
      const record = {
        onabort: details.onabort,
        onerror: details.onerror,
        onload: details.onload,
        onloadend: details.onloadend,
        onreadystatechange: details.onreadystatechange,
        ontimeout: details.ontimeout,
        timeoutId: null
      };

      if (timeoutMs > 0) {
        record.timeoutId = setTimeout(() => {
          this.timeout(requestId, String(details.url));
        }, timeoutMs + 1000);
      }

      this.callbacks.set(requestId, record);
      return record;
    }

    complete(requestId, message) {
      const record = this.callbacks.get(requestId);
      if (!record) return;

      this.remove(requestId, record);

      const response = this.responseNormalizer.normalize(message.response);
      this.invoker.invoke(record.onreadystatechange, response);

      if (message.ok) {
        this.invoker.invoke(record.onload, response);
        this.invoker.invoke(record.onloadend, response);
        return;
      }

      const errorResponse = {
        ...response,
        error: message.error || { name: "Error", message: "Request failed." }
      };

      if (message.error && message.error.isTimeout) {
        this.invoker.invoke(record.ontimeout, errorResponse);
      } else {
        this.invoker.invoke(record.onerror, errorResponse);
      }

      this.invoker.invoke(record.onloadend, errorResponse);
    }

    abort(requestId, url) {
      const record = this.callbacks.get(requestId);
      this.remove(requestId, record);

      this.invoker.invoke(record && record.onabort, {
        finalUrl: url,
        readyState: 4,
        status: 0,
        statusText: "abort"
      });
    }

    timeout(requestId, url) {
      const record = this.callbacks.get(requestId);
      if (!record) return;

      this.remove(requestId, record);

      const timeoutResponse = {
        finalUrl: url,
        readyState: 4,
        status: 0,
        statusText: "timeout",
        responseHeaders: "",
        responseText: "",
        response: "",
        error: { name: "TimeoutError", message: "Request timed out.", isTimeout: true }
      };

      this.invoker.invoke(record.ontimeout, timeoutResponse);
      this.invoker.invoke(record.onloadend, timeoutResponse);
    }

    remove(requestId, record) {
      this.callbacks.delete(requestId);
      if (record && record.timeoutId !== null) {
        clearTimeout(record.timeoutId);
      }
    }
  }

  class PageMessenger {
    constructor(windowRef) {
      this.windowRef = windowRef;
    }

    postToContent(message) {
      this.windowRef.postMessage(
        {
          source: PAGE_SOURCE,
          ...message
        },
        "*"
      );
    }
  }

  class GmXmlHttpRequestShim {
    constructor({ callbackRegistry, messenger, serializer }) {
      this.callbackRegistry = callbackRegistry;
      this.messenger = messenger;
      this.serializer = serializer;
      this.nextRequestId = 1;
    }

    create(details) {
      if (!details || !details.url) {
        throw new TypeError("GM_xmlhttpRequest requires a URL.");
      }

      const requestId = `${Date.now()}-${this.nextRequestId++}`;
      const url = String(details.url);

      this.callbackRegistry.add(requestId, details);
      this.messenger.postToContent({
        type: "GM_XMLHTTP_REQUEST",
        requestId,
        details: this.serializer.cloneDetails(details)
      });

      return {
        abort: () => {
          this.callbackRegistry.abort(requestId, url);
        }
      };
    }
  }

  class GmApiInstaller {
    constructor({ windowRef, documentRef, valueStore, messenger, xhrShim }) {
      this.windowRef = windowRef;
      this.documentRef = documentRef;
      this.valueStore = valueStore;
      this.messenger = messenger;
      this.xhrShim = xhrShim;
    }

    install() {
      this.windowRef.unsafeWindow = this.windowRef;
      this.installInfo();
      this.installValueApi();
      this.installStyleApi();
      this.installTabApi();
      this.installRequestApi();
    }

    installInfo() {
      this.windowRef.GM_info = {
        script: {
          name: "FSU EAFC FUT Web Enhancer",
          namespace: "https://futcd.com/",
          version: "26.10"
        },
        scriptHandler: "Chrome Extension MV3 shim"
      };
    }

    installValueApi() {
      this.windowRef.GM_getValue = (key, defaultValue) => this.valueStore.get(key, defaultValue);
      this.windowRef.GM_setValue = (key, value) => this.valueStore.set(key, value);
    }

    installStyleApi() {
      this.windowRef.GM_addStyle = (css) => {
        const style = this.documentRef.createElement("style");
        style.type = "text/css";
        style.textContent = String(css);
        (this.documentRef.head || this.documentRef.documentElement).appendChild(style);
        return style;
      };
    }

    installTabApi() {
      this.windowRef.GM_openInTab = (url, options) => {
        this.messenger.postToContent({
          type: "GM_OPEN_IN_TAB",
          url: String(url),
          options: options || {}
        });

        return {
          close() {
            this.closed = true;
          },
          closed: false
        };
      };
    }

    installRequestApi() {
      this.windowRef.GM_xmlhttpRequest = (details) => this.xhrShim.create(details);
    }
  }

  function showExtensionInvalidatedBanner(windowRef, text) {
    const doc = windowRef.document;
    if (!doc || doc.getElementById("fsu-extension-invalidated-banner")) return;

    const banner = doc.createElement("div");
    banner.id = "fsu-extension-invalidated-banner";
    banner.setAttribute("role", "alert");
    banner.textContent =
      text || "FSU extension was reloaded. Press F5 to restore FSU features on this page.";
    Object.assign(banner.style, {
      position: "fixed",
      top: "0",
      left: "0",
      right: "0",
      zIndex: "2147483647",
      padding: "12px 16px",
      background: "#b45309",
      color: "#fff",
      font: "600 14px/1.4 Arial, sans-serif",
      textAlign: "center",
      boxShadow: "0 2px 8px rgba(0,0,0,0.25)"
    });
    (doc.body || doc.documentElement).appendChild(banner);
  }

  class PageRuntimeApp {
    constructor(windowRef) {
      this.windowRef = windowRef;
      this.messenger = new PageMessenger(windowRef);
      this.callbackRegistry = new RequestCallbackRegistry({
        invoker: new CallbackInvoker(),
        responseNormalizer: new ResponseNormalizer()
      });
      this.valueStore = null;
      this.guardianRequests = new Map();
      this.nextGuardianRequestId = 1;
      this.nativeConfirmations = new Map();
      this.handleContentMessage = this.handleContentMessage.bind(this);
    }

    boot() {
      const legacyState = this.windowRef.__FSU_EXTENSION_INIT__ || {};
      this.valueStore = new GmValueStore({
        initialValues: legacyState.storage,
        fallback: new LocalStorageFallback(this.windowRef, STORAGE_PREFIX),
        postToContent: (message) => this.messenger.postToContent(message)
      });
      const xhrShim = new GmXmlHttpRequestShim({
        callbackRegistry: this.callbackRegistry,
        messenger: this.messenger,
        serializer: new RequestSerializer()
      });

      this.windowRef.addEventListener("message", this.handleContentMessage);
      new GmApiInstaller({
        windowRef: this.windowRef,
        documentRef: this.windowRef.document,
        valueStore: this.valueStore,
        messenger: this.messenger,
        xhrShim
      }).install();

      this.windowRef.__guardianApiRequest = (request) =>
        new Promise((resolve, reject) => {
          const requestId = `guardian-${Date.now()}-${this.nextGuardianRequestId++}`;
          const timeoutMs = Math.min(Math.max(Number(request?.timeoutMs) || 12000, 1), 30000);
          const timer = setTimeout(() => {
            this.guardianRequests.delete(requestId);
            const error = new Error("Guardian request timed out.");
            error.name = "AbortError";
            reject(error);
          }, timeoutMs);
          this.guardianRequests.set(requestId, { resolve, reject, timer });
          this.messenger.postToContent({
            type: "GUARDIAN_API_REQUEST",
            requestId,
            request: {
              url: String(request?.url || ""),
              method: String(request?.method || "GET"),
              body: request?.body,
              timeoutMs
            }
          });
        });
      this.windowRef.__guardianNativeConfirm = (preview) =>
        new Promise((resolve, reject) => {
          const requestId = `native-${Date.now()}-${this.nextGuardianRequestId++}`;
          this.nativeConfirmations.set(requestId, { resolve, reject });
          this.messenger.postToContent({
            type: "GUARDIAN_NATIVE_CONFIRM",
            requestId,
            preview
          });
        });

      this.messenger.postToContent({ type: "FSU_REQUEST_INIT" });
    }

    handleContentMessage(event) {
      if (event.source !== this.windowRef) return;

      const message = event.data;
      if (!message || message.source !== CONTENT_SOURCE) return;

      if (message.type === "FSU_INIT_STORAGE" && this.valueStore) {
        this.valueStore.mergeInitialValues(message.storage);
        return;
      }

      if (message.type === "GM_XMLHTTP_RESPONSE") {
        this.callbackRegistry.complete(message.requestId, message);
        return;
      }

      if (message.type === "GUARDIAN_API_RESPONSE") {
        const pending = this.guardianRequests.get(message.requestId);
        if (!pending) return;
        this.guardianRequests.delete(message.requestId);
        clearTimeout(pending.timer);
        if (message.ok) {
          pending.resolve(message.response);
        } else {
          const error = new Error(message.error?.message || "Guardian request failed.");
          error.name = message.error?.name || "Error";
          error.code = message.error?.code;
          pending.reject(error);
        }
        return;
      }

      if (message.type === "GUARDIAN_NATIVE_CONFIRM_RESPONSE") {
        const pending = this.nativeConfirmations.get(message.requestId);
        if (!pending) return;
        this.nativeConfirmations.delete(message.requestId);
        if (message.ok) pending.resolve(message.approved === true);
        else pending.reject(new Error(message.error?.message || "Native confirmation failed."));
        return;
      }

      if (message.type === "FSU_EXTENSION_INVALIDATED") {
        showExtensionInvalidatedBanner(this.windowRef, message.message);
      }
    }
  }

  new PageRuntimeApp(globalScope).boot();
})(window);
