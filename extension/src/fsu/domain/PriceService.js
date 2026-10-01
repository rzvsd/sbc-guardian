import { PriceRequestQueue } from "../core/PriceRequestQueue.js";
import { safeParseJson } from "../infra/JsonParsing.js";
import {
  isPriceEntry,
  parseFutbinPrices,
  parseFutGgPrices,
  parseFutNextPrices,
  priceProviderFailure
} from "./PriceResults.js";

const PRICE_BATCH_SIZE = 23;
const PRICE_FRESH_TTL_MS = 5 * 60 * 1000;
const PRICE_STALE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Domain service for fetching, caching, and mapping player market prices.
 */
export class PriceService {
  /**
   * @param {{
   *   httpClient: { request: (method: string, url: string, body?: any, contentType?: string) => Promise<string> },
   *   store: { getObject: (key: string, fallback: any) => any, setJson: (key: string, val: any) => void },
   *   getInfo: () => any,
   *   debug: { log: (...args: any[]) => void },
   *   now?: () => number,
   *   freshTtlMs?: number,
   *   staleMaxAgeMs?: number
   * }} options
   */
  constructor({
    httpClient,
    store,
    getInfo,
    debug,
    now = () => Date.now(),
    freshTtlMs = PRICE_FRESH_TTL_MS,
    staleMaxAgeMs = PRICE_STALE_MAX_AGE_MS
  }) {
    this.httpClient = httpClient;
    this.store = store;
    this.getInfo = getInfo;
    this.debug = debug;
    this.now = now;
    this.freshTtlMs = freshTtlMs;
    this.staleMaxAgeMs = staleMaxAgeMs;
    /** @type {((error: any) => void) | null} */
    this.errorHandler = null;
    this.requestQueue = new PriceRequestQueue();
    this.unavailableReported = false;
  }

  /**
   * @param {(error: any) => void} handler
   */
  setErrorHandler(handler) {
    this.errorHandler = handler;
  }

  /**
   * @param {any} error
   */
  handleError(error) {
    if (this.errorHandler) {
      this.errorHandler(error);
    }
    throw error;
  }

  /**
   * @param {string} method
   * @param {string} url
   * @param {any} [body]
   * @param {string} [contentType]
   * @returns {Promise<string>}
   */
  request(method, url, body, contentType) {
    return this.httpClient.request(method, url, body, contentType);
  }

  /**
   * @param {string} response
   * @param {any} fallback
   * @param {string} label
   * @returns {any}
   */
  parseJsonResponse(response, fallback, label) {
    return safeParseJson(response, fallback, {
      label,
      onError: (error, context) => this.debug.log(`${context.label} parse failed`, error)
    });
  }

  /**
   * @param {number|string} definitionId
   * @param {number} type
   * @returns {any}
   */
  getCachePrice(definitionId, type) {
    const info = this.getInfo();
    const priceDataKey = "data";

    if (!type) {
      return undefined;
    }

    if (type === 1) {
      if (info.externalPricesAvailable === false) return { num: 0, text: "—", type: 0 };
      const item = info.roster[priceDataKey]?.[definitionId] ?? {};
      const priceInfo = {
        num: item?.n ?? 0,
        text: item?.n?.toLocaleString() ?? "0",
        type: item?.y ?? 0
      };

      if (item?.y !== 0 && item?.n == 0) {
        priceInfo.text = "Reward";
      }

      return priceInfo;
    }

    if (type === 3) {
      const item = info.roster[priceDataKey]?.[definitionId];
      return (
        isPriceEntry(item) &&
        this.now() - item._ts >= 0 &&
        this.now() - item._ts <= this.freshTtlMs
      );
    }

    return undefined;
  }

  /**
   * @param {number|string} purchasePrice
   * @param {number|string} lastPrice
   * @returns {string}
   */
  priceLastDiff(purchasePrice, lastPrice) {
    let percent = ((Number(purchasePrice) * 0.95) / Number(lastPrice) - 1) * 100;
    percent = Number(percent.toFixed(0));

    if (!isFinite(percent)) {
      percent = 0;
    }

    const value = ("+" + percent + "%").replace("+-", "-");
    return value.indexOf("+") !== -1
      ? `<span class="plus">${value}</span>`
      : `<span class="minus">${value}</span>`;
  }

  /**
   * @param {string} url
   * @returns {Promise<any>}
   */
  async getFutbinUrl(url) {
    if (this.getInfo().externalPricesAvailable === false) {
      this.reportUnavailable();
      return {};
    }
    try {
      const response = await this.request("GET", url);
      return this.parseJsonResponse(response, {}, "futbin-url");
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * @param {number[]} definitionIds
   * @returns {Promise<any>}
   */
  async getPriceForUrl(definitionIds) {
    if (this.getInfo().externalPricesAvailable === false) {
      this.reportUnavailable();
      return priceProviderFailure("none", {}, ["provider-unavailable"]);
    }
    this.debug.log(definitionIds);
    const sortedIds = [...definitionIds].sort((a, b) => a - b);
    const queueKey = `url:${sortedIds.join(",")}`;

    return this.requestQueue.run(queueKey, () => this._fetchPriceForUrl(sortedIds));
  }

  /**
   * @param {number[]} definitionIds
   * @returns {Promise<any>}
   */
  async _fetchPriceForUrl(definitionIds) {
    const info = this.getInfo();
    const provider =
      [1, 2].includes(info.apiPlatform) ? "futgg" :
        info.apiPlatform === 3 ? "futnext" : "none";
    try {
      if ([1, 2].includes(info.apiPlatform)) {
        const params = definitionIds.join("%2C");
        const baseUrl =
          info.apiPlatform === 2 ? `${info.apiProxy}?futggapi=` : "https://www.fut.gg/api/fut/";
        const platform = info.base.platform === "pc" ? `&platform=${info.base.platform}` : "";
        const response = await this.request(
          "GET",
          `${baseUrl}player-prices/26/?ids=${params}${platform}`
        );
        const originalJson = this.parseJsonResponse(
          response,
          null,
          "futgg-player-prices"
        );
        const result = parseFutGgPrices(originalJson, this.now());
        return this.commitPriceBatch(definitionIds, result);
      } else if (info.apiPlatform === 3) {
        const params = definitionIds.join("_");
        const response = await this.request(
          "GET",
          `https://enhancer-api.futnext.com/players/prices?ids=${params}&platform=${info.base.platform}`
        );
        const originalJson = this.parseJsonResponse(
          response,
          null,
          "futnext-player-prices"
        );
        const result = parseFutNextPrices(originalJson, this.now());
        return this.commitPriceBatch(definitionIds, result);
      }
      return { success: true, data: { prices: {} }, stale: false };
    } catch (error) {
      this.reportError(error);
      return priceProviderFailure(
        provider,
        this.getStalePrices(definitionIds),
        ["request-failed"]
      );
    }
  }

  reportUnavailable() {
    if (this.unavailableReported) return;
    this.unavailableReported = true;
    this.reportError("PRICE_PROVIDER_UNAVAILABLE");
  }

  /**
   * @param {any} error
   */
  reportError(error) {
    if (this.errorHandler) {
      this.errorHandler(error);
    }
  }

  /**
   * @param {number[]} definitionIds
   * @returns {Record<string, any>}
   */
  getStalePrices(definitionIds) {
    const data = this.getInfo().roster.data;
    const now = this.now();
    /** @type {Record<string, any>} */
    const prices = {};
    for (const definitionId of definitionIds) {
      const entry = data?.[definitionId];
      if (
        isPriceEntry(entry) &&
        now - entry._ts >= 0 &&
        now - entry._ts <= this.staleMaxAgeMs
      ) {
        prices[definitionId] = entry;
      }
    }
    return prices;
  }

  /**
   * @param {number[]} definitionIds
   * @param {any} result
   * @returns {any}
   */
  commitPriceBatch(definitionIds, result) {
    if (!result.success) {
      this.debug.log("Price provider response rejected", result.error);
      const stalePrices = this.getStalePrices(definitionIds);
      return {
        ...result,
        data: { prices: stalePrices },
        stale: Object.keys(stalePrices).length > 0
      };
    }
    const info = this.getInfo();
    info.roster.data = { ...info.roster.data, ...result.data.prices };
    return result;
  }

  /**
   * @param {number|string} playerResourceId
   * @returns {Promise<any>}
   */
  async getPriceForFutbin(playerResourceId) {
    if (this.getInfo().externalPricesAvailable === false) {
      this.reportUnavailable();
      return undefined;
    }
    try {
      const info = this.getInfo();
      const platform = info.base.platform == "pc" ? "PC" : "PS";
      const response = await this.request(
        "GET",
        `https://www.futbin.org/futbin/api/${info.base.year}/fetchPriceInformation?playerresource=${playerResourceId}&platform=${platform}`
      );
      const originalJson = this.parseJsonResponse(
        response,
        null,
        "futbin-price-information"
      );
      const normalizedResponse =
        originalJson !== null &&
        typeof originalJson === "object" &&
        !Array.isArray(originalJson)
          ? { data: [{ ...originalJson, resourceId: playerResourceId }] }
          : null;
      const result = parseFutbinPrices(
        normalizedResponse,
        {
          definitionIdKey: "resourceId",
          platform: info.base.platform === "pc" ? "pc" : "ps",
          now: this.now()
        }
      );
      const committed = this.commitPriceBatch([Number(playerResourceId)], result);
      return committed.data.prices[playerResourceId];
    } catch (error) {
      this.handleError(error);
    }
  }

  initFutbinId() {
    const info = this.getInfo();
    info.futbinId = this.store.getObject("futbinId", {});
  }

  /**
   * @param {number|string} definitionId
   * @param {number|string} futbinId
   */
  setFutbinMapping(definitionId, futbinId) {
    const info = this.getInfo();
    info.futbinId[definitionId] = futbinId;
    this.store.setJson("futbinId", info.futbinId);
  }

  /**
   * @param {any} data
   * @param {number|string} definitionId
   * @returns {any}
   */
  setPriceFromFutbinData(data, definitionId) {
    const info = this.getInfo();
    const normalizedResponse =
      data !== null && typeof data === "object" && !Array.isArray(data)
        ? { data: [{ ...data, definitionId }] }
        : null;
    const result = parseFutbinPrices(
      normalizedResponse,
      {
        definitionIdKey: "definitionId",
        platform: info.base.platform === "pc" ? "pc" : "ps",
        now: this.now()
      }
    );
    return this.commitPriceBatch([Number(definitionId)], result);
  }

  /**
   * @param {any[]} players
   * @returns {boolean}
   */
  commitFutbinSquadPlayers(players) {
    const info = this.getInfo();
    const result = parseFutbinPrices(
      { data: players },
      {
        definitionIdKey: "Player_Resource",
        platform: info.base.platform === "pc" ? "pc" : "ps",
        now: this.now()
      }
    );
    if (
      !result.success ||
      players.some(
        (player) =>
          !player ||
          !Number.isInteger(Number(player.Player_Resource)) ||
          Number(player.Player_Resource) <= 0 ||
          !Number.isInteger(Number(player.id)) ||
          Number(player.id) <= 0
      )
    ) {
      return false;
    }

    const futbinId = { ...info.futbinId };
    for (const player of players) {
      futbinId[Number(player.Player_Resource)] = Number(player.id);
    }
    this.store.setJson("futbinId", futbinId);
    info.futbinId = futbinId;
    info.roster.data = { ...info.roster.data, ...result.data.prices };
    return true;
  }

  /**
   * @param {any} player
   * @returns {Promise<number>}
   */
  async getFutbinPlayerId(player) {
    if (this.getInfo().externalPricesAvailable === false) {
      this.reportUnavailable();
      return 0;
    }
    try {
      const info = this.getInfo();
      const platform = info.base.platform == "pc" ? "PC" : "PS";
      const nation = player.nationId;
      const team = player.teamId;
      const league = player.leagueId;
      const rating = player._rating;
      const position = info.posIdToName[player.preferredPosition];
      const response = await this.request(
        "GET",
        `https://www.futbin.org/futbin/api/${info.base.year}/getFilteredPlayers?platform=${platform}&nation=${nation}&league=${league}&rating=${rating}-${rating}&club=${team}&sort=rating&position=${position}&order=desc&page=1`
      );
      const data = this.parseJsonResponse(response, null, "futbin-filtered-players");
      const result = parseFutbinPrices(data, {
        definitionIdKey: "resource_id",
        platform: info.base.platform === "pc" ? "pc" : "ps",
        now: this.now()
      });
      if (!result.success) {
        this.debug.log("Futbin player response rejected", result.error);
        return 0;
      }
      const items = Array.isArray(data?.data) ? data.data : [];
      if (
        items.some(
          (/** @type {any} */ itemData) =>
            !Number.isInteger(Number(itemData?.ID)) ||
            Number(itemData.ID) <= 0
        )
      ) {
        this.debug.log("Futbin player mapping rejected");
        return 0;
      }
      this.commitPriceBatch(
        Object.keys(result.data.prices).map(Number),
        result
      );
      for (const itemData of items) {
        this.setFutbinMapping(itemData.resource_id, itemData.ID);
      }

      return info.futbinId[player.definitionId] || 0;
    } catch (error) {
      this.handleError(error);
      return 0;
    }
  }

  /**
   * @param {number|string} definitionId
   * @param {number|string} futbinId
   * @returns {Promise<any>}
   */
  async getFutbinPrice(definitionId, futbinId) {
    if (this.getInfo().externalPricesAvailable === false) {
      this.reportUnavailable();
      return undefined;
    }
    try {
      const info = this.getInfo();
      const platform = info.base.platform == "pc" ? "PC" : "PS";
      const response = await this.request(
        "GET",
        `https://www.futbin.org/futbin/api/${info.base.year}/fetchPlayerInformationMinimal?ID=${futbinId}&platform=${platform}`
      );
      const data = this.parseJsonResponse(response, null, "futbin-player-information");
      const result = parseFutbinPrices(data, {
        definitionIdKey: "Player_Resource",
        platform: info.base.platform === "pc" ? "pc" : "ps",
        now: this.now()
      });
      this.commitPriceBatch([Number(definitionId)], result);

      return info.roster.data[definitionId];
    } catch (error) {
      this.handleError(error);
    }
  }

  createFutbinIdFacade() {
    return {
      init: () => this.initFutbinId(),
      set: (/** @type {any} */ definitionId, /** @type {any} */ futbinId) => this.setFutbinMapping(definitionId, futbinId),
      getId: (/** @type {any} */ player) => this.getFutbinPlayerId(player),
      getPrice: (/** @type {any} */ definitionId, /** @type {any} */ futbinId) => this.getFutbinPrice(definitionId, futbinId),
      setPrice: (/** @type {any} */ data, /** @type {any} */ definitionId) => this.setPriceFromFutbinData(data, definitionId),
      commitSquadPlayers: (/** @type {any[]} */ players) => this.commitFutbinSquadPlayers(players)
    };
  }
}


export {
  PRICE_BATCH_SIZE,
  PRICE_FRESH_TTL_MS,
  PRICE_STALE_MAX_AGE_MS
};
