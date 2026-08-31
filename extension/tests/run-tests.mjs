import assert from "assert";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import { runPreferencesServiceTests } from "./preferences-services.test.mjs";
import { setLegacyFallbackForTests } from "../src/guardian/mode.js";
import { runSbcChemistryTests } from "./sbc-chemistry.test.mjs";
import { runSbcDataServiceAsyncTests, runSbcServiceTests } from "./sbc-services.test.mjs";
import { runPlayerSearchTests } from "./player-search.test.mjs";
import { runFsuContextTests } from "./fsu-context.test.mjs";
import { runLocalizationTests } from "./localization.test.mjs";
import { runRatingPricesTests } from "./rating-prices.test.mjs";
import { runSbcRatingTests } from "./sbc-rating.test.mjs";
import { runFastSbcPlannerTests } from "./fast-sbc-planner.test.mjs";
import { runEaBundleCheckTests } from "./ea-bundle-check.test.mjs";
import { runHtmlSafetyTests } from "./html-safety.test.mjs";
import { runSbcResponseAdapterTests } from "./sbc-response-adapter.test.mjs";
import { runSbcReadAdapterTests } from "./sbc-read-adapter.test.mjs";
import { runSbcChallengesLifecycleTests } from "./sbc-challenges-lifecycle.test.mjs";
import { runSbcSnapshotResultTests } from "./sbc-snapshot-results.test.mjs";
import { runSbcFillSafetyTests } from "./sbc-fill-safety.test.mjs";
import { runSbcSaveTransactionTests } from "./sbc-save-transaction.test.mjs";
import { runSbcSubmitTransactionTests } from "./sbc-submit-transaction.test.mjs";
import { runJsonParsingTests } from "./json-parsing.test.mjs";
import { runMarketActionServiceTests } from "./market-action-service.test.mjs";
import { runMarketResultTests } from "./market-results.test.mjs";
import { runMarketAuctionRendererTests } from "./market-auction-renderer.test.mjs";
import { runPriceResultTests } from "./price-results.test.mjs";
import { runPriceServiceTests } from "./price-service.test.mjs";
import { runPricePatchLifecycleTests } from "./price-patch-lifecycle.test.mjs";
import { runPlayerMetadataResultTests } from "./player-metadata-results.test.mjs";
import { runPlayerDetailsLifecycleTests } from "./player-details-lifecycle.test.mjs";
import { runRemoteConfigServiceTests } from "./remote-config-service.test.mjs";
import { runRemoteConfigResultsTests } from "./remote-config-results.test.mjs";
import { runPackageSmokeTests } from "./package-smoke.test.mjs";
import { runEaRuntimeAdapterTests } from "./ea-runtime-adapter.test.mjs";
import { runPatchLifecycleRegistryTests } from "./patch-lifecycle-registry.test.mjs";
import { runAppInitLifecycleTests } from "./app-init-lifecycle.test.mjs";
import { runMarketPatchLifecycleTests } from "./market-patch-lifecycle.test.mjs";
import { runStorePackCatalogTests } from "./store-pack-catalog.test.mjs";
import { runStorePackOpenTransactionTests } from "./store-pack-open-transaction.test.mjs";
import { runInPacksSearchTests } from "./in-packs-search.test.mjs";
import { runStoreUiLifecycleTests } from "./store-ui-lifecycle.test.mjs";
import { runPatchSingleOwnerTests } from "./patch-single-owner.test.mjs";
import { runRequestPolicyCorpusTests } from "./request-policy-corpus.test.mjs";
import { runPlayerMetaCacheTests } from "./player-meta-cache.test.mjs";
import { runPackPreviewTests } from "./pack-preview.test.mjs";
import { runBulkPackOpenTests } from "./bulk-pack-open.test.mjs";
import { runUnassignedRefreshTests } from "./unassigned-refresh.test.mjs";
import "./guardian-action-gate.test.mjs";
import "./guardian-contract-fixtures.test.mjs";
import "./guardian-state-machine.test.mjs";
import "./guardian-integration.test.mjs";
import "./guardian-fail-closed.test.mjs";
import "./guardian-ui.test.mjs";
import "./guardian-bundle.test.mjs";
import "./guardian-collision.test.mjs";
import "./guardian-payload-safety.test.mjs";
import "./guardian-ui-adapter.test.mjs";
import "./fc26-presenter.test.mjs";
import "./streamlined-contract.test.mjs";
import "./gecko-confirm-cleanup.test.mjs";
import "./fc27-snapshot.test.mjs";
import "./guardian-facade.test.mjs";
import { runGuardianProductionWiringTests } from "./guardian-production-wiring.test.mjs";
import { runGuardianLifecycleTests } from "./guardian-lifecycle.test.mjs";
import { runGuardianContextIntegrityTests } from "./guardian-context-integrity.test.mjs";
import { runGuardianM5Fc26Tests } from "./guardian-m5-fc26.test.mjs";
import { runGuardianIsolatedTransportTests } from "./guardian-isolated-transport.test.mjs";
import { runGuardianExtensionRegressionTests } from "./guardian-extension-regressions.test.mjs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, "..");
const { loadBackground } = require(path.join(__dirname, "load-background.cjs"));
const background = loadBackground(root);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertLodashVendor() {
  const lodashPath = path.join(root, "vendor", "lodash.min.js");
  const content = fs.readFileSync(lodashPath, "utf8");

  assert.ok(fs.existsSync(lodashPath), "Missing vendor/lodash.min.js");
  assert.ok(content.includes("4.17.21"), "vendor/lodash.min.js must be Lodash 4.17.21");
  assert.ok(content.length > 50000, "vendor/lodash.min.js looks truncated");
}

function assertManifest() {
  const manifest = readJson(path.join(root, "manifest.json"));

  assert.strictEqual(manifest.manifest_version, 3);
  assert.strictEqual(manifest.background.service_worker, "src/background.js");
  assert.ok(
    fs.existsSync(path.join(root, manifest.background.service_worker)),
    `Missing service worker: ${manifest.background.service_worker}`
  );
  assert.deepStrictEqual(manifest.permissions, ["storage"]);
  assert.ok(manifest.host_permissions.includes("https://www.ea.com/*"));
  assert.ok(manifest.host_permissions.includes("https://api.fut.to/*"));
  assert.ok(!manifest.host_permissions.includes("<all_urls>"));
  assert.ok(
    manifest.content_scripts[0].matches.every((match) => match.includes("ultimate-team/web-app")),
    "Content scripts must only run on the FUT Web App"
  );
  assert.deepStrictEqual(manifest.web_accessible_resources[0].matches, [
    "https://www.ea.com/*",
    "https://www.easports.com/*"
  ]);
  assert.strictEqual(
    manifest.web_accessible_resources[0].use_dynamic_url,
    true,
    "Web-accessible resources must use a per-session dynamic extension ID"
  );

  for (const script of manifest.content_scripts[0].js) {
    assert.ok(fs.existsSync(path.join(root, script)), `Missing content script: ${script}`);
  }

  for (const resource of manifest.web_accessible_resources[0].resources) {
    assert.ok(fs.existsSync(path.join(root, resource)), `Missing web resource: ${resource}`);
  }
}

function assertSenderAllowlist() {
  assert.strictEqual(
    background.isAllowedSender("https://www.ea.com/ea-sports-fc/ultimate-team/web-app/"),
    true
  );
  assert.strictEqual(
    background.isAllowedSender("https://www.ea.com/en/ea-sports-fc/ultimate-team/web-app/"),
    true
  );
  assert.strictEqual(
    background.isAllowedSender("https://www.easports.com/en/ea-sports-fc/ultimate-team/web-app/"),
    true
  );
  assert.strictEqual(background.isAllowedSender("https://www.futbin.com/26/player/1"), false);
  assert.strictEqual(background.isAllowedSender("https://www.fut.gg/players/1/"), false);
  assert.strictEqual(
    background.isAllowedSender("https://www.ea.com/other/ea-sports-fc/ultimate-team/web-app/"),
    false
  );
  assert.strictEqual(background.isAllowedSender("https://example.com/"), false);
  assert.strictEqual(background.isAllowedSender("http://www.fut.gg/players/1/"), false);
}

function assertHeaderNormalization() {
  const headers = background.normalizeHeaders({
    "Content-Type": "application/json",
    "X-UT-SID": "abc",
    "User-Agent": "blocked",
    Referer: "blocked",
    "Sec-Fetch-Site": "blocked",
    Empty: null
  });

  assert.deepStrictEqual(headers, {
    "Content-Type": "application/json",
    "X-UT-SID": "abc"
  });
}

function assertFetchOptions() {
  const getOptions = background.buildFetchOptions({
    method: "GET",
    headers: { Accept: "application/json" },
    data: "ignored"
  });

  assert.strictEqual(getOptions.method, "GET");
  assert.strictEqual("body" in getOptions, false);
  assert.strictEqual(getOptions.credentials, "omit");
  assert.strictEqual(getOptions.redirect, "error");

  const postOptions = background.buildFetchOptions({
    method: "POST",
    anonymous: true,
    headers: { "Content-Type": "application/json" },
    data: { ok: true }
  });

  assert.strictEqual(postOptions.method, "POST");
  assert.strictEqual(postOptions.credentials, "omit");
  assert.strictEqual(postOptions.body, "{\"ok\":true}");
}

function assertExportedClasses() {
  const normalizer = new background.RequestNormalizer();
  assert.deepStrictEqual(normalizer.normalizeHeaders({ Accept: "json" }), { Accept: "json" });

  const policy = new background.SenderPolicy();
  assert.strictEqual(policy.isAllowed("https://www.fut.gg/players/1/"), false);

  const error = new Error("boom");
  error.isTimeout = true;
  assert.deepStrictEqual(new background.ErrorSerializer().serialize(error), {
    name: "Error",
    message: "boom",
    isTimeout: true
  });
}

function assertRequestPolicy() {
  const policy = new background.RequestPolicy();
  const futGgRequest = policy.authorize({
    method: "GET",
    url: "https://www.fut.gg/api/fut/player-prices/26/?ids=123"
  });
  assert.strictEqual(futGgRequest.credentials, "omit");

  const configRequest = policy.authorize({
    url: "https://api.fut.to/26/meta.json?revision=1"
  });
  assert.strictEqual(configRequest.credentials, "omit");

  assert.throws(
    () => policy.authorize({ url: "https://api.fut.to/26/not-allowed.json" }),
    (error) => error.name === "SecurityError"
  );
  assert.throws(
    () => policy.authorize({ method: "POST", url: "https://api.fut.to/26/meta.json" }),
    (error) => error.name === "SecurityError"
  );
  assert.throws(
    () => policy.authorize({ url: "https://example.com/collect" }),
    (error) => error.name === "SecurityError"
  );

  const marketRequest = policy.authorize({
    url: "https://utas.mob.v5.prd.futc-ext.gcp.ea.com/ut/game/fc26/transfermarket?num=21",
    headers: {
      "X-UT-SID": "session",
      "X-Requested-With": "blocked-for-this-endpoint"
    }
  });
  assert.deepStrictEqual(background.buildFetchOptions(marketRequest).headers, {
    "X-UT-SID": "session"
  });
}

async function assertRequestServiceRejectsUnapprovedUrl() {
  let fetchCalled = false;
  const service = new background.GmRequestService(async () => {
    fetchCalled = true;
    return new Response("unexpected");
  });

  await assert.rejects(
    () => service.perform({ method: "GET", url: "https://example.com/private" }),
    (error) => error.name === "SecurityError"
  );
  assert.strictEqual(fetchCalled, false);
}

async function assertRequestServiceEnforcesResponseLimit() {
  let capturedSignal;
  const service = new background.GmRequestService(
    async (_url, options) => {
      capturedSignal = options.signal;
      return new Response("response-too-large");
    },
    undefined,
    undefined,
    8
  );

  await assert.rejects(
    () => service.perform({ method: "GET", url: "https://api.fut.to/26/meta.json" }),
    (error) =>
      error instanceof RangeError &&
      error.message === "The response exceeds the extension size limit."
  );
  assert.strictEqual(capturedSignal.aborted, true);

  let bodyRead = false;
  const declaredOversizeService = new background.GmRequestService(
    async () => {
      const response = new Response("small", {
        headers: { "Content-Length": "9" }
      });
      const originalGetReader = response.body.getReader.bind(response.body);
      response.body.getReader = (...args) => {
        bodyRead = true;
        return originalGetReader(...args);
      };
      return response;
    },
    undefined,
    undefined,
    8
  );

  await assert.rejects(
    () =>
      declaredOversizeService.perform({
        method: "GET",
        url: "https://api.fut.to/26/meta.json"
      }),
    RangeError
  );
  assert.strictEqual(bodyRead, false);
}

async function assertTabService() {
  const createdTabs = [];
  const tabService = new background.TabService({
    create(tab) {
      createdTabs.push(tab);
      return Promise.resolve({ id: 7 });
    }
  });

  const tab = await tabService.open("https://www.futbin.com/26/player/1", { active: false });
  assert.strictEqual(tab.id, 7);
  assert.deepStrictEqual(createdTabs, [
    { url: "https://www.futbin.com/26/player/1", active: false }
  ]);
  assert.throws(
    () => tabService.open("javascript:alert(1)", {}),
    (error) => error.name === "SecurityError"
  );
  assert.throws(
    () => tabService.open("https://example.com/phishing", {}),
    (error) => error.name === "SecurityError"
  );
  assert.throws(
    () => tabService.open("https://futcd.com/not-sbc.html", {}),
    (error) => error.name === "SecurityError"
  );
}

function assertMessageRouterSecurity() {
  let response;
  const router = new background.BackgroundMessageRouter({
    runtimeApi: null,
    senderPolicy: new background.SenderPolicy(),
    requestService: { perform: () => Promise.resolve({}) },
    tabService: { open: () => Promise.resolve({ id: 1 }) },
    errorSerializer: new background.ErrorSerializer()
  });

  const asyncResult = router.handleMessage(
    { source: "fsu-extension-content", type: "GM_XMLHTTP_REQUEST", details: { url: "https://api.fut.to/" } },
    { url: "https://example.com/" },
    (payload) => {
      response = payload;
    }
  );

  assert.strictEqual(asyncResult, false);
  assert.deepStrictEqual(response, {
    ok: false,
    error: { name: "SecurityError", message: "Sender URL is not allowed." }
  });
}

function assertUserscriptBundle() {
  const userscript = fs.readFileSync(path.join(root, "src", "userscript.js"), "utf8");

  assert.ok(userscript.includes("FSU EAFC FUT Web Enhancer"));
  assert.ok(userscript.includes("AppContext"));
  assert.ok(userscript.includes("PriceService"));
  assert.ok(userscript.includes("SettingsService"));
  assert.ok(userscript.includes("registerSettingsScreen"));
  assert.ok(userscript.includes("SbcChemistryService"));
  assert.ok(userscript.includes("installUnassignedPatches"));
  assert.ok(userscript.includes("installSbcSubmitPatch"));
  assert.ok(userscript.includes("installPlayerCardPatches"));
  assert.ok(userscript.includes("installMarketPatches"));
  assert.ok(userscript.includes("market.search-view-generate"));
  assert.ok(userscript.includes("setMarketSearchGenerateEnabled"));
  assert.ok(userscript.includes("price.squad-value"));
  assert.ok(userscript.includes("setSquadPricePatchEnabled"));
  assert.ok(userscript.includes("PRICE_RESULT_INVALID"));
  assert.ok(userscript.includes("PLAYER_METADATA_INVALID"));
  assert.ok(userscript.includes("details.quick-list-render"));
  assert.ok(userscript.includes("setPlayerDetailsPatchEnabled"));
  assert.ok(userscript.includes("installStorePatches"));
  assert.ok(userscript.includes("installSbcHubPatches"));
  assert.ok(userscript.includes("installAcademyHubPatches"));
  assert.ok(userscript.includes("installObjectivesHubPatches"));
  assert.ok(userscript.includes("installHomeHubPatches"));
  assert.ok(userscript.includes("installRewardPatches"));
  assert.ok(userscript.includes("installAcademyDetailsPatches"));
  assert.ok(userscript.includes("registerSbcInfoFillEvent"));
  assert.ok(userscript.includes("installNavigationPatches"));
  assert.ok(userscript.includes("installSquadBuilderPatches"));
  assert.ok(userscript.includes("installClubHubPatches"));
  assert.ok(userscript.includes("registerSbcSubPriceEvent"));
  assert.ok(userscript.includes("installSbcSquadSubmitPatches"));
  assert.ok(userscript.includes("installSbcRequirementsPatch"));
  assert.ok(userscript.includes("installSbcSquadOverviewPatches"));
  assert.ok(userscript.includes("registerSbcIgnoreTextEvent"));
  assert.ok(userscript.includes("installSbcSquadDetailPanelPatches"));
  assert.ok(userscript.includes("registerFastSbcEvents"));
  assert.ok(userscript.includes("SbcPlayerMatchService"));
  assert.ok(userscript.includes("FastSbcService"));
  assert.ok(userscript.includes("OneFillCriteriaService"));
  assert.ok(userscript.includes("SbcSquadFillService"));
  assert.ok(userscript.includes("SbcTemplateService"));
  assert.ok(userscript.includes("installSbcChallengesPatch"));
  assert.ok(userscript.includes("sbc.challenges-view"));
  assert.ok(userscript.includes("setSbcChallengesPatchEnabled"));
  assert.ok(userscript.includes("sbc.requirement-read"));
  assert.ok(userscript.includes("SBC_SNAPSHOT_INVALID"));
  assert.ok(userscript.includes("sbc.chemistry-context"));
  assert.ok(userscript.includes("sbc.virtual-challenge"));
  assert.ok(userscript.includes("cancelSbcTemplate"));
  assert.ok(userscript.includes("SbcUndoHistoryService"));
  assert.ok(userscript.includes("EA_OBSERVABLE_TIMEOUT"));
  assert.ok(userscript.includes("SBC_SAVE_REJECTED"));
  assert.ok(userscript.includes("sbc.submit-transaction"));
  assert.ok(userscript.includes("SBC_SUBMIT_PRECONDITION_FAILED"));
  assert.ok(userscript.includes("store.pack-list"));
  assert.ok(userscript.includes("STORE_PACK_ARTICLE_INVALID"));
  assert.ok(userscript.includes("store.pack-open-transaction"));
  assert.ok(userscript.includes("STORE_PACK_OPEN_IN_FLIGHT"));
  assert.ok(userscript.includes("IN_PACKS_SEARCH_MAX_PAGES"));
  assert.ok(userscript.includes("store.reveal-list"));
  assert.ok(userscript.includes("store.pack-animation"));
  assert.ok(userscript.includes("store.category-navigation"));
  assert.ok(userscript.includes("store.hub-tiles"));
  assert.ok(userscript.includes("registerSbcSubstitutionEvents"));
  assert.ok(userscript.includes("SbcSquadSaveService"));
  assert.ok(userscript.includes("PlayerSearchService"));
  assert.ok(userscript.includes("PlayerValueService"));
  assert.ok(userscript.includes("PatchInstaller"));
  assert.ok(userscript.includes("PatchLifecycleRegistry"));
  assert.ok(userscript.includes("home.academy-tile"));
  assert.ok(userscript.includes("FSU_BASE_STYLE"));
  assert.ok(userscript.includes("ModuleRegistry"));
  assert.ok(userscript.includes("MarketActionService"));
  assert.ok(userscript.includes("EaRuntimeAdapter"));
  assert.ok(userscript.includes("EaMarketSearchSession"));
  assert.ok(userscript.includes("EA_CAPABILITY_UNAVAILABLE"));
  assert.ok(userscript.includes("item.move-to-club"));
  assert.ok(userscript.includes("item.purchase-to-club"));
  assert.ok(userscript.includes("item.list-for-sale"));
  assert.ok(userscript.includes("unassigned.reset"));
  assert.ok(userscript.includes("item.static-data"));
  assert.ok(userscript.includes("item.purchase-capacity"));
  assert.ok(userscript.includes("item.listing-inventory"));
  assert.ok(userscript.includes("showPlayerListPopup"));
  assert.ok(userscript.includes("AcademyCalcService"));
  assert.ok(userscript.includes("FgRatingService"));
  assert.ok(userscript.includes("FsuJsonStore"));
  assert.ok(userscript.includes("FsuHttpClient"));
  assert.ok(userscript.includes("FsuUserscriptApp"));
  assert.ok(userscript.includes("FsuContext"));
  assert.ok(userscript.includes("createGameInfo"));
  assert.ok(userscript.includes("createFutbinIdFacade"));
  assert.ok(userscript.includes("getPriceForUrl"));
  assert.ok(userscript.includes("mountGuardian"));
  assert.ok(userscript.includes("guardian-root"));
  assert.ok(userscript.includes("requestGuarded"));
  assert.ok(userscript.includes("GUARDIAN_DECISION_REQUIRED"));
  assert.ok(userscript.includes("GUARDIAN_KIND_MISMATCH"));
  assert.ok(userscript.includes("GUARDIAN_PAYLOAD_MISMATCH"));
  assert.ok(userscript.includes("GuardianRuntimeError"));
  assert.ok(!userscript.includes("function futgg"));
  assert.ok(!userscript.includes("GM_setValue(\"set\",JSON.stringify(info.set))"));
  assert.ok(!userscript.includes("GM_setValue(\"futbinId\",JSON.stringify(info.futbinId))"));
  assert.ok(!userscript.includes("GM_setValue(\"lock_26\",JSON.stringify(info.lock))"));
  assert.ok(!userscript.includes("GM_setValue(\"build\",JSON.stringify(info.build))"));
}

async function assertPriceService() {
  globalThis._ = {
    get(object, key, fallback) {
      return object?.[key] ?? fallback;
    },
    has(object, key) {
      return Object.prototype.hasOwnProperty.call(object, key);
    },
    map(collection, iteratee) {
      return collection.map(iteratee);
    },
    forEach(collection, iteratee) {
      collection.forEach(iteratee);
    }
  };

  const { PriceService } = await import(new URL("../src/fsu/domain/PriceService.js", import.meta.url));

  const info = {
    apiPlatform: 1,
    apiProxy: "",
    base: { platform: "pc", year: "26" },
    futbinId: {},
    posIdToName: { 25: "ST" },
    roster: { data: { 1: { n: 500, y: 0, _ts: Date.now() } } }
  };

  const service = new PriceService({
    httpClient: { request: async () => "<html>bad gateway</html>" },
    store: { getObject: () => ({}), setJson: () => {} },
    getInfo: () => info,
    debug: { log: () => {} }
  });

  const cached = service.getCachePrice(1, 1);
  assert.strictEqual(cached.num, 500);
  assert.strictEqual(service.getCachePrice(1, 3), true);
  assert.ok(service.priceLastDiff(100, 100).includes("minus"));

  const emptyPrices = await service.getPriceForUrl([1, 2]);
  assert.strictEqual(emptyPrices.success, false);
  assert.strictEqual(emptyPrices.stale, true);
  assert.strictEqual(emptyPrices.error.code, "PRICE_RESULT_INVALID");
  assert.deepStrictEqual(emptyPrices.data.prices, {
    1: info.roster.data[1]
  });
  const missingFutbinId = await service.getFutbinPlayerId({
    nationId: 1,
    teamId: 1,
    leagueId: 1,
    _rating: 80,
    preferredPosition: 25,
    definitionId: 9
  });
  assert.strictEqual(missingFutbinId, 0);
}

assertLodashVendor();
await runGuardianProductionWiringTests();
await runGuardianLifecycleTests();
await runGuardianContextIntegrityTests();
await runGuardianM5Fc26Tests();
await runGuardianIsolatedTransportTests();
await runGuardianExtensionRegressionTests();
assertManifest();
assertSenderAllowlist();
assertHeaderNormalization();
assertFetchOptions();
assertExportedClasses();
assertRequestPolicy();
runRequestPolicyCorpusTests();
runPlayerMetaCacheTests();
await runPackPreviewTests();
// The four rerouted FSU service tests exercise the ORIGINAL executors, so the
// legacy (pre-Guardian) path must be enabled for them. It is impossible for
// this flag to be true in the distributed bundle (IS_DISTRIBUTED === true).
setLegacyFallbackForTests(true);
await runBulkPackOpenTests();
runUnassignedRefreshTests();
await assertRequestServiceRejectsUnapprovedUrl();
await assertRequestServiceEnforcesResponseLimit();
assertMessageRouterSecurity();
assertUserscriptBundle();
await assertPriceService();
runJsonParsingTests();
runPriceResultTests();
await runPriceServiceTests();
runPricePatchLifecycleTests();
runPlayerMetadataResultTests();
runPlayerDetailsLifecycleTests();
runMarketResultTests();
runMarketAuctionRendererTests();
runPreferencesServiceTests();
runSbcChemistryTests();
runSbcServiceTests();
await runSbcDataServiceAsyncTests();
runPlayerSearchTests();
runFsuContextTests();
runLocalizationTests();
runRatingPricesTests();
runSbcRatingTests();
runFastSbcPlannerTests();
runEaBundleCheckTests();
runHtmlSafetyTests();
runSbcResponseAdapterTests();
runSbcReadAdapterTests();
runSbcChallengesLifecycleTests();
runSbcSnapshotResultTests();
await runSbcFillSafetyTests();
await runSbcSaveTransactionTests();
setLegacyFallbackForTests(true);
try {
await runSbcSubmitTransactionTests();
runRemoteConfigServiceTests();
runRemoteConfigResultsTests();
runPackageSmokeTests();
await runEaRuntimeAdapterTests();
runPatchLifecycleRegistryTests();
runAppInitLifecycleTests();
runMarketPatchLifecycleTests();
runStorePackCatalogTests();
runStorePackOpenTransactionTests();
await runInPacksSearchTests();
runStoreUiLifecycleTests();
await runPatchSingleOwnerTests();
await runMarketActionServiceTests();
await assertTabService();
} finally {
  setLegacyFallbackForTests(false);
}
console.log("All extension tests passed.");
