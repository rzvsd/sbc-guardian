(function initBackgroundCore(globalScope) {
  "use strict";

  const CONTENT_SOURCE = "fsu-extension-content";
  const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
  const GUARDIAN_ORIGIN = "https://sbc-guardian.duckdns.org";
  const GUARDIAN_SESSION_KEY = "guardian.session";
  const MAX_GUARDIAN_BODY_BYTES = 2 * 1024 * 1024;
  const MAX_GUARDIAN_RESPONSE_BYTES = 2 * 1024 * 1024;
  const ALLOWED_TAB_ROUTES = [
    {
      origin: "https://fut.to",
      path: /^\/$/
    },
    {
      origin: "https://www.futbin.com",
      path: /^\/.*$/
    },
    {
      origin: "https://futcd.com",
      path: /^\/sbc\.html$/
    },
    {
      origin: "https://mfrasi851i.feishu.cn",
      path: /^\/wiki\/OLNswCYQciVKw8k9iaAcmOY1nmf$/
    }
  ];

  function createSecurityError(message) {
    const error = new Error(message);
    error.name = "SecurityError";
    return error;
  }

  function isSafeEncodedSlug(slug) {
    if (!slug || slug.length > 192) return false;
    if (!/^(?:[A-Za-z0-9&._-]|%[0-9A-Fa-f]{2})+$/.test(slug)) {
      return false;
    }
    const encodedBytes = [...slug.matchAll(/%([0-9A-Fa-f]{2})/g)].map(
      (match) => Number.parseInt(match[1], 16)
    );
    if (
      encodedBytes.some(
        (byte) =>
          byte === 0x2f ||
          byte === 0x5c ||
          byte <= 0x1f ||
          byte === 0x7f
      )
    ) {
      return false;
    }
    try {
      const decoded = decodeURIComponent(slug);
      return decoded !== "." && decoded !== "..";
    } catch {
      return false;
    }
  }

  const REQUEST_RULES = [
    {
      origin: "https://api.fut.to",
      path: /^\/26\/(?:updata|meta|fast|pack|sbc|ggrating|evolutions|inpacks|other|fgconfig|playermeta|lowprice)\.json$/,
      credentials: "omit"
    },
    {
      origin: "https://www.fut.gg",
      path: /^\/api\/(?:fut\/player-prices\/26\/|squads\/\d+)$/,
      credentials: "omit"
    },
    {
      origin: "https://www.futbin.org",
      path: /^\/futbin\/api\/\d+\/(?:getChallengeTopSquads|getSquadByID|getChallengesBySetId|fetchPriceInformation|getFilteredPlayers|fetchPlayerInformationMinimal)$/,
      credentials: "omit"
    },
    {
      origin: "https://enhancer-api.futnext.com",
      path: /^\/players\/prices$/,
      credentials: "omit"
    },
    {
      origin: "https://www.futnext.com",
      path: /^\/(?:pack|playerpick)\/[A-Za-z0-9%&._-]{1,192}\/\d+\/(?:open)?$/,
      validatePath: (pathname) => {
        const parts = pathname.split("/");
        return isSafeEncodedSlug(parts[2]);
      },
      credentials: "omit"
    },
    {
      origin: "https://utas.mob.v5.prd.futc-ext.gcp.ea.com",
      path: /^\/ut\/game\/fc26\/transfermarket$/,
      credentials: "omit",
      headers: new Set(["accept", "content-type", "x-ut-sid"])
    }
  ];

  class RequestPolicy {
    constructor(rules = REQUEST_RULES) {
      this.rules = rules;
    }

    authorize(details) {
      if (!details || typeof details.url !== "string") {
        throw new TypeError("GM_xmlhttpRequest requires a URL.");
      }

      let url;
      try {
        url = new URL(details.url);
      } catch {
        throw new TypeError("GM_xmlhttpRequest received an invalid URL.");
      }

      const method = String(details.method || "GET").toUpperCase();
      const rule = this.rules.find(
        (candidate) =>
          candidate.origin === url.origin &&
          candidate.path.test(url.pathname) &&
          (!candidate.validatePath || candidate.validatePath(url.pathname))
      );

      if (!rule || method !== "GET") {
        throw createSecurityError("The requested endpoint is not allowed.");
      }

      return {
        ...details,
        url: url.href,
        method,
        credentials: rule.credentials,
        allowedHeaders: rule.headers || new Set(["accept", "content-type", "cache-control", "pragma", "x-requested-with"])
      };
    }
  }

  const FORBIDDEN_REQUEST_HEADERS = new Set([
    "accept-charset",
    "accept-encoding",
    "access-control-request-headers",
    "access-control-request-method",
    "connection",
    "content-length",
    "cookie",
    "cookie2",
    "date",
    "dnt",
    "expect",
    "host",
    "keep-alive",
    "origin",
    "permissions-policy",
    "referer",
    "te",
    "trailer",
    "transfer-encoding",
    "upgrade",
    "user-agent",
    "via"
  ]);

  class SenderPolicy {
    isAllowed(senderUrl) {
      if (!senderUrl) return false;

      let url;
      try {
        url = new URL(senderUrl);
      } catch {
        return false;
      }

      if (url.protocol !== "https:") return false;

      const host = url.hostname.toLowerCase();
      const path = url.pathname;

      if (host === "www.ea.com") {
        return /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?ea-sports-fc\/ultimate-team\/web-app\//i.test(path);
      }

      if (host === "www.easports.com") {
        return /^\/[a-z]{2}(?:-[a-z]{2})?\/ea-sports-fc\/ultimate-team\/web-app\//i.test(path);
      }

      return false;
    }
  }

  class RequestNormalizer {
    constructor(forbiddenHeaders = FORBIDDEN_REQUEST_HEADERS) {
      this.forbiddenHeaders = forbiddenHeaders;
    }

    normalizeHeaders(headers, allowedHeaders) {
      const normalized = {};

      if (!headers || typeof headers !== "object") {
        return normalized;
      }

      for (const [rawName, rawValue] of Object.entries(headers)) {
        if (rawValue === undefined || rawValue === null) continue;

        const name = String(rawName);
        const lowerName = name.toLowerCase();

        if (
          this.forbiddenHeaders.has(lowerName) ||
          (allowedHeaders && !allowedHeaders.has(lowerName)) ||
          lowerName.startsWith("proxy-") ||
          lowerName.startsWith("sec-")
        ) {
          continue;
        }

        normalized[name] = String(rawValue);
      }

      return normalized;
    }

    normalizeBody(data) {
      if (data === undefined || data === null) return undefined;
      if (typeof data === "string") return data;
      if (typeof Blob !== "undefined" && data instanceof Blob) return data;
      if (typeof FormData !== "undefined" && data instanceof FormData) return data;
      if (typeof URLSearchParams !== "undefined" && data instanceof URLSearchParams) return data;
      if (typeof ArrayBuffer !== "undefined" && data instanceof ArrayBuffer) return data;
      if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(data)) {
        return data;
      }

      return JSON.stringify(data);
    }

    buildFetchOptions(details, signal) {
      const method = String(details.method || "GET").toUpperCase();
      const options = {
        method,
        headers: this.normalizeHeaders(details.headers, details.allowedHeaders),
        credentials: details.credentials || "omit",
        redirect: "error",
        signal
      };

      if (method !== "GET" && method !== "HEAD") {
        const body = this.normalizeBody(details.data);
        if (body !== undefined) {
          options.body = body;
        }
      }

      return options;
    }
  }

  class GmRequestService {
    constructor(
      fetchImpl,
      normalizer = new RequestNormalizer(),
      policy = new RequestPolicy(),
      maxResponseBytes = MAX_RESPONSE_BYTES
    ) {
      this.fetchImpl = fetchImpl;
      this.normalizer = normalizer;
      this.policy = policy;
      this.maxResponseBytes = maxResponseBytes;
    }

    async readResponseText(response, controller) {
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > this.maxResponseBytes) {
        controller.abort();
        throw new RangeError("The response exceeds the extension size limit.");
      }

      if (!response.body || typeof response.body.getReader !== "function") {
        const responseText = await response.text();
        if (new TextEncoder().encode(responseText).byteLength > this.maxResponseBytes) {
          controller.abort();
          throw new RangeError("The response exceeds the extension size limit.");
        }
        return responseText;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let receivedBytes = 0;
      let responseText = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          receivedBytes += value.byteLength;
          if (receivedBytes > this.maxResponseBytes) {
            try {
              await reader.cancel();
            } catch {
              // The abort below still closes the underlying fetch.
            }
            controller.abort();
            throw new RangeError("The response exceeds the extension size limit.");
          }
          responseText += decoder.decode(value, { stream: true });
        }
        responseText += decoder.decode();
        return responseText;
      } finally {
        reader.releaseLock();
      }
    }

    async perform(details) {
      const authorizedDetails = this.policy.authorize(details);

      const controller = new AbortController();
      let timeoutId = null;
      let timedOut = false;
      const timeoutMs = Math.min(Math.max(Number(authorizedDetails.timeout) || 0, 0), 30000);

      if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, timeoutMs);
      }

      try {
        const response = await this.fetchImpl(
          authorizedDetails.url,
          this.normalizer.buildFetchOptions(authorizedDetails, controller.signal)
        );
        const responseText = await this.readResponseText(response, controller);
        const responseHeaders = Array.from(response.headers.entries())
          .map(([key, value]) => `${key}: ${value}`)
          .join("\r\n");

        return {
          finalUrl: response.url,
          readyState: 4,
          status: response.status,
          statusText: response.statusText,
          responseHeaders,
          responseText,
          response: responseText
        };
      } catch (error) {
        if (timedOut) {
          error.isTimeout = true;
        }
        throw error;
      } finally {
        if (timeoutId !== null) {
          clearTimeout(timeoutId);
        }
      }
    }
  }

  class ExtensionSecretStore {
    constructor(storageArea, runtimeApi) {
      this.storageArea = storageArea;
      this.runtimeApi = runtimeApi;
    }

    getSession() {
      return new Promise((resolve, reject) => {
        if (!this.storageArea || typeof this.storageArea.get !== "function") {
          reject(new Error("Guardian session storage is unavailable."));
          return;
        }
        let settled = false;
        const finish = (items) => {
          if (settled) return;
          settled = true;
          if (this.runtimeApi?.lastError) {
            reject(new Error(this.runtimeApi.lastError.message));
            return;
          }
          resolve(typeof items?.[GUARDIAN_SESSION_KEY] === "string" ? items[GUARDIAN_SESSION_KEY] : "");
        };
        try {
          const result = this.storageArea.get(GUARDIAN_SESSION_KEY, finish);
          if (result && typeof result.then === "function") {
            result.then(finish, reject);
          }
        } catch (error) {
          reject(error);
        }
      });
    }
  }

  class GuardianRequestPolicy {
    authorize(request) {
      let url;
      try {
        url = new URL(request?.url);
      } catch {
        throw new TypeError("Guardian request received an invalid URL.");
      }
      const method = String(request?.method || "GET").toUpperCase();
      const allowedPath =
        url.pathname === "/api/v2/snapshots" ||
        url.pathname === "/api/v2/solve/traditional";
      if (url.origin !== GUARDIAN_ORIGIN || url.search || method !== "POST" || !allowedPath) {
        throw createSecurityError("The Guardian endpoint is not allowed.");
      }
      const encodedBody = JSON.stringify(request?.body ?? null);
      if (new TextEncoder().encode(encodedBody).byteLength > MAX_GUARDIAN_BODY_BYTES) {
        throw new RangeError("The Guardian request exceeds the extension size limit.");
      }
      return {
        url: url.href,
        method,
        body: encodedBody,
        timeoutMs: Math.min(Math.max(Number(request?.timeoutMs) || 12000, 1), 30000)
      };
    }
  }

  class GuardianRequestService {
    constructor(fetchImpl, secretStore, policy = new GuardianRequestPolicy()) {
      this.fetchImpl = fetchImpl;
      this.secretStore = secretStore;
      this.policy = policy;
    }

    async perform(request) {
      const authorized = this.policy.authorize(request);
      const session = await this.secretStore.getSession();
      if (!session) {
        const error = new Error("Guardian authentication is required.");
        error.code = "GUARDIAN_AUTH_REQUIRED";
        throw error;
      }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), authorized.timeoutMs);
      try {
        const response = await this.fetchImpl(authorized.url, {
          method: authorized.method,
          headers: {
            "Content-Type": "application/json",
            "X-Guardian-Session": session
          },
          body: authorized.body,
          credentials: "omit",
          redirect: "error",
          signal: controller.signal
        });
        const responseText = await response.text();
        if (new TextEncoder().encode(responseText).byteLength > MAX_GUARDIAN_RESPONSE_BYTES) {
          throw new RangeError("The Guardian response exceeds the extension size limit.");
        }
        let body = null;
        try {
          body = responseText ? JSON.parse(responseText) : null;
        } catch {
          throw new TypeError("Guardian returned invalid JSON.");
        }
        return { status: response.status, body };
      } finally {
        clearTimeout(timer);
      }
    }
  }

  class TabService {
    constructor(tabsApi, routes = ALLOWED_TAB_ROUTES) {
      this.tabsApi = tabsApi;
      this.routes = routes;
    }

    open(url, options) {
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new TypeError("GM_openInTab received an invalid URL.");
      }

      const route = this.routes.find(
        (candidate) =>
          candidate.origin === parsedUrl.origin &&
          candidate.path.test(parsedUrl.pathname)
      );
      if (!route) {
        throw createSecurityError("GM_openInTab URL is not allowed.");
      }

      return this.tabsApi.create({
        url: parsedUrl.href,
        active: !options || options.active !== false
      });
    }
  }

  class ErrorSerializer {
    serialize(error) {
      return {
        name: error && error.name ? String(error.name) : "Error",
        message: error && error.message ? String(error.message) : String(error),
        isTimeout: Boolean(error && error.isTimeout)
      };
    }
  }

  class BackgroundMessageRouter {
    constructor({ runtimeApi, senderPolicy, requestService, guardianRequestService, guardianConfirmationService, tabService, errorSerializer }) {
      this.runtimeApi = runtimeApi;
      this.senderPolicy = senderPolicy;
      this.requestService = requestService;
      this.guardianRequestService = guardianRequestService;
      this.guardianConfirmationService = guardianConfirmationService;
      this.tabService = tabService;
      this.errorSerializer = errorSerializer;
    }

    register() {
      if (!this.runtimeApi || !this.runtimeApi.onMessage) {
        return;
      }

      this.runtimeApi.onMessage.addListener((message, sender, sendResponse) =>
        this.handleMessage(message, sender, sendResponse)
      );
    }

    handleMessage(message, sender, sendResponse) {
      if (!message || message.source !== CONTENT_SOURCE) {
        return false;
      }

      const senderUrl = sender && (sender.url || (sender.tab && sender.tab.url));
      if (!this.senderPolicy.isAllowed(senderUrl)) {
        sendResponse({
          ok: false,
          error: { name: "SecurityError", message: "Sender URL is not allowed." }
        });
        return false;
      }

      if (message.type === "GM_XMLHTTP_REQUEST") {
        this.requestService
          .perform(message.details)
          .then((response) => sendResponse({ ok: true, response }))
          .catch((error) => sendResponse({ ok: false, error: this.errorSerializer.serialize(error) }));
        return true;
      }

      if (message.type === "GUARDIAN_API_REQUEST") {
        this.guardianRequestService
          .perform(message.request)
          .then((response) => sendResponse({ ok: true, response }))
          .catch((error) => sendResponse({ ok: false, error: {
            ...this.errorSerializer.serialize(error),
            code: error && error.code ? String(error.code) : undefined
          } }));
        return true;
      }

      if (message.type === "GUARDIAN_NATIVE_CONFIRM") {
        if (!this.guardianConfirmationService) {
          sendResponse({
            ok: false,
            error: { name: "NotSupportedError", message: "Native confirmation is unavailable." }
          });
          return false;
        }
        this.guardianConfirmationService
          .request(message.preview)
          .then((approved) => sendResponse({ ok: true, approved: approved === true }))
          .catch((error) => sendResponse({ ok: false, error: this.errorSerializer.serialize(error) }));
        return true;
      }

      if (message.type === "GM_OPEN_IN_TAB") {
        this.tabService
          .open(message.url, message.options)
          .then((tab) => sendResponse({ ok: true, tabId: tab.id }))
          .catch((error) => sendResponse({ ok: false, error: this.errorSerializer.serialize(error) }));
        return true;
      }

      sendResponse({
        ok: false,
        error: { name: "TypeError", message: `Unsupported message type: ${message.type}` }
      });
      return false;
    }
  }

  const senderPolicy = new SenderPolicy();
  const requestNormalizer = new RequestNormalizer();
  const requestPolicy = new RequestPolicy();
  const errorSerializer = new ErrorSerializer();

  function isAllowedSender(senderUrl) {
    return senderPolicy.isAllowed(senderUrl);
  }

  function normalizeHeaders(headers) {
    return requestNormalizer.normalizeHeaders(headers);
  }

  function normalizeBody(data) {
    return requestNormalizer.normalizeBody(data);
  }

  function buildFetchOptions(details, signal) {
    return requestNormalizer.buildFetchOptions(details, signal);
  }

  function serializeError(error) {
    return errorSerializer.serialize(error);
  }

  /**
   * Register the background message router against a concrete WebExtension API
   * namespace. Used by both the Chrome entry (background.js) and the GeckoView
   * entry (background-gecko.js) so the request/sender policy logic is shared.
   * @param {{ runtime?: any, tabs?: any, storage?: any, guardianConfirmationService?: any, fetchImpl?: Function }} apis
   */
  function registerBackground(apis) {
    const runtimeApi = apis && apis.runtime;
    const tabsApi = apis && apis.tabs;
    const fetchImpl =
      apis && apis.fetchImpl
        ? apis.fetchImpl
        : typeof fetch !== "undefined"
          ? fetch.bind(globalScope)
          : fetch;

    if (!runtimeApi || !runtimeApi.onMessage || !tabsApi || typeof fetchImpl !== "function") {
      return;
    }

    new BackgroundMessageRouter({
      runtimeApi,
      senderPolicy,
      requestService: new GmRequestService(fetchImpl, requestNormalizer, requestPolicy),
      guardianRequestService: new GuardianRequestService(
        fetchImpl,
        new ExtensionSecretStore(apis.storage, runtimeApi)
      ),
      guardianConfirmationService: apis.guardianConfirmationService,
      tabService: new TabService(tabsApi),
      errorSerializer
    }).register();
  }

  const api = {
    BackgroundMessageRouter,
    ErrorSerializer,
    GmRequestService,
    GuardianRequestPolicy,
    GuardianRequestService,
    ExtensionSecretStore,
    RequestNormalizer,
    RequestPolicy,
    SenderPolicy,
    TabService,
    buildFetchOptions,
    isAllowedSender,
    normalizeBody,
    normalizeHeaders,
    serializeError,
    registerBackground
  };

  if (typeof globalThis !== "undefined") {
    globalThis.__fsuBackgroundCore = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : self);
