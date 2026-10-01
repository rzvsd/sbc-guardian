import assert from "node:assert/strict";
import { PriceService } from "../src/fsu/domain/PriceService.js";

function createInfo(data = {}) {
  return {
    apiPlatform: 1,
    apiProxy: "",
    base: { platform: "pc", year: "26" },
    futbinId: {},
    posIdToName: {},
    roster: { data }
  };
}

function createService({ info, request, now = 100_000, onError = () => {} }) {
  const service = new PriceService({
    httpClient: { request },
    store: { getObject: () => ({}), setJson: () => {} },
    getInfo: () => info,
    debug: { log: () => {} },
    now: () => now,
    freshTtlMs: 10_000,
    staleMaxAgeMs: 10_000
  });
  service.setErrorHandler(onError);
  return service;
}

export async function runPriceServiceTests() {
  const unavailableInfo = { ...createInfo(), externalPricesAvailable: false };
  let requests = 0;
  const errors = [];
  const unavailable = createService({ info: unavailableInfo, request: async () => { requests++; return "{}"; }, onError: e => errors.push(e) });
  for (let i = 0; i < 20; i++) {
    assert.equal((await unavailable.getPriceForUrl([i])).success, false);
    assert.equal(await unavailable.getPriceForFutbin(i), undefined);
    assert.deepEqual(await unavailable.getFutbinUrl("https://www.futbin.org/futbin/api/26/getChallengesBySetId?set_id=1"), {});
    assert.equal(await unavailable.getFutbinPlayerId({}), 0);
    assert.equal(await unavailable.getFutbinPrice(i, i), undefined);
  }
  assert.equal(requests, 0, "unsupported providers must not be queried on every render");
  assert.deepEqual(errors, ["PRICE_PROVIDER_UNAVAILABLE"], "show one capability explanation, not an error storm");
  assert.equal(unavailable.getCachePrice(1, 1).text, "—");

  const staleEntry = { n: 700, y: 0, _ts: 95_000 };
  const expiredEntry = { n: 800, y: 0, _ts: 80_000 };
  const malformedInfo = createInfo({ 1: staleEntry, 2: expiredEntry });
  const originalCache = malformedInfo.roster.data;
  const malformedService = createService({
    info: malformedInfo,
    request: async () =>
      JSON.stringify({
        data: [
          { eaId: 1, price: 900 },
          { eaId: 2, price: "invalid" }
        ]
      })
  });

  const malformed = await malformedService.getPriceForUrl([1, 2]);
  assert.equal(malformed.success, false);
  assert.equal(malformed.stale, true);
  assert.deepEqual(malformed.data.prices, { 1: staleEntry });
  assert.strictEqual(malformedInfo.roster.data, originalCache);
  assert.deepEqual(malformedInfo.roster.data, {
    1: staleEntry,
    2: expiredEntry
  });
  assert.equal(malformedService.getCachePrice(1, 3), true);
  assert.equal(malformedService.getCachePrice(2, 3), false);

  const successInfo = createInfo({ 9: { n: 50, y: 0, _ts: 90_000 } });
  const successService = createService({
    info: successInfo,
    request: async () =>
      JSON.stringify({
        data: [
          {
            eaId: 3,
            price: 1200,
            isExtinct: false,
            isSbc: false,
            isObjective: false,
            premiumSeasonPassLevel: null,
            standardSeasonPassLevel: null
          }
        ]
      })
  });
  const success = await successService.getPriceForUrl([3]);
  assert.equal(success.success, true);
  assert.deepEqual(success.data.prices, {
    3: { n: 1200, y: 0, _ts: 100_000 }
  });
  assert.deepEqual(successInfo.roster.data, {
    3: { n: 1200, y: 0, _ts: 100_000 },
    9: { n: 50, y: 0, _ts: 90_000 }
  });

  let reportedError = null;
  const timeoutInfo = createInfo({ 4: staleEntry });
  const timeoutService = createService({
    info: timeoutInfo,
    request: async () => {
      throw new Error("timeout");
    },
    onError: (error) => {
      reportedError = error;
    }
  });
  const timeout = await timeoutService.getPriceForUrl([4]);
  assert.equal(timeout.success, false);
  assert.equal(timeout.error?.code, "PRICE_PROVIDER_FAILED");
  assert.deepEqual(timeout.data.prices, { 4: staleEntry });
  assert.equal(reportedError?.message, "timeout");

  const emptyInfo = createInfo({ 5: staleEntry });
  const emptyService = createService({
    info: emptyInfo,
    request: async () => JSON.stringify({ data: [] })
  });
  const empty = await emptyService.getPriceForUrl([5]);
  assert.equal(empty.success, true);
  assert.deepEqual(empty.data.prices, {});
  assert.deepEqual(emptyInfo.roster.data, { 5: staleEntry });

  const squadInfo = createInfo({});
  const writes = [];
  const squadService = new PriceService({
    httpClient: { request: async () => "" },
    store: {
      getObject: () => ({}),
      setJson: (key, value) => writes.push([key, value])
    },
    getInfo: () => squadInfo,
    debug: { log: () => {} },
    now: () => 100_000
  });
  const validPlayers = [
    {
      Player_Resource: 101,
      id: 7001,
      LCPrice: 1200,
      MinPrice: 300,
      MaxPrice: 10000
    },
    {
      Player_Resource: 102,
      id: 7002,
      LCPrice: 900,
      MinPrice: 300,
      MaxPrice: 10000
    }
  ];
  assert.equal(squadService.commitFutbinSquadPlayers(validPlayers), true);
  assert.deepEqual(squadInfo.futbinId, { 101: 7001, 102: 7002 });
  assert.deepEqual(squadInfo.roster.data, {
    101: { n: 1200, y: 0, _ts: 100_000 },
    102: { n: 900, y: 0, _ts: 100_000 }
  });
  assert.equal(writes.length, 1);

  const originalIds = squadInfo.futbinId;
  const originalPrices = squadInfo.roster.data;
  assert.equal(
    squadService.commitFutbinSquadPlayers([
      validPlayers[0],
      { ...validPlayers[1], Player_Resource: "bad-id" }
    ]),
    false
  );
  assert.strictEqual(squadInfo.futbinId, originalIds);
  assert.strictEqual(squadInfo.roster.data, originalPrices);
  assert.equal(writes.length, 1);
}
