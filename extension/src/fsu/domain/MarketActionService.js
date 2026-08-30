import { responseText, safeParseJson } from "../infra/JsonParsing.js";
import { EA_CAPABILITIES } from "../ea/EaRuntimeAdapter.js";
import { guardianOrFailClosed } from "../../guardian/mode.js";
import {
  MARKET_RESULT_INVALID,
  normalizeAuctionLookupResult,
  normalizeMarketListingResult,
  normalizeMarketPurchaseResult,
  normalizeMarketSearchResult,
  summarizeAuctionPrices
} from "./MarketResults.js";

/**
 * @param {any} object
 * @param {string|number} key
 */
function hasOwn(object, key) {
  return object !== null &&
    typeof object === "object" &&
    Object.prototype.hasOwnProperty.call(object, key);
}

export class MarketActionService {
  /** @type {Record<string, boolean>} */
  _guardReg = {};
  /**
   * @param {any} i
   * @param {any} p
   * @param {any} helpers
   */
  _getAuctionPriceResult(i, p, helpers) {
    const { debug = { log: () => {} }, ea, getInfo, notice, xmlHttpRequest } = helpers;
    const info = getInfo();
    return new Promise((resolve) => {
      xmlHttpRequest({
        method: "GET",
        url: `https://utas.mob.v5.prd.futc-ext.gcp.ea.com/ut/game/fc26/transfermarket?num=21&start=0&type=player&maskedDefId=${i}&maxb=${p}`,
        headers: {
          "Content-type": "application/json",
          "X-UT-SID": info.base.sId
        },
        onload: (/** @type {any} */ response) => {
          if (response.status == 404 || response.status == 401) {
            const refreshedSessionId = ea?.getUtasSessionId() || null;
            if (refreshedSessionId) {
              info.base.sId = refreshedSessionId;
            } else {
              debug.log("EA capability unavailable", ea?.inspect?.(EA_CAPABILITIES.UTAS_SESSION));
            }
            notice("notice.loaderror", 2);
            resolve({
              success: false,
              data: { auctions: [] },
              error: { code: "MARKET_REQUEST_REJECTED", status: response.status }
            });
          } else {
            const parsedResponse = safeParseJson(responseText(response), null, {
              label: "transfer-market-auctions",
              onError: (error, context) => debug.log(`${context.label} parse failed`, error)
            });
            const result = normalizeAuctionLookupResult(parsedResponse);
            if (!result.success) {
              debug.log("Transfer market response rejected", result.error);
            }
            resolve(result);
          }
        },
        onerror: function () {
          notice("notice.loaderror", 2);
          resolve({
            success: false,
            data: { auctions: [] },
            error: { code: "MARKET_NETWORK_ERROR" }
          });
        }
      });
    });
  }

  /**
   * @param {any} i
   * @param {any} p
   * @param {any} helpers
   */
  async _getAuctionPrice(i, p, helpers) {
    const result = await this._getAuctionPriceResult(i, p, helpers);
    return result.data.auctions;
  }

  /**
   * @param {any} e
   * @param {any} player
   * @param {any} helpers
   */
  async getAuction(e, player, helpers) {
    const {
      fy,
      debug,
      futbinId,
      getInfo,
      getCachePrice,
      renderAuctionPrices,
      pdb
    } = helpers;
    const info = getInfo();

    e.setInteractionState(0);
    e.setSubtext(fy("quicklist.getpriceload"));
    const defId = player.definitionId;
    if (hasOwn(info.futbinId, defId)) {
      await futbinId.getPrice(defId, info.futbinId[defId]);
    } else {
      await futbinId.getId(player);
    }
    let price = getCachePrice(defId, 1).num;
    let result = await this._getAuctionPrice(defId, price, helpers);
    let priceList = (result || []).map((/** @type {any} */ i) => i.buyNowPrice);
    if (result.length == 0) {
      for (let i = 0; i < 5; i++) {
        const nextPrice = helpers.ea.incrementMarketPrice(price, "above");
        if (nextPrice === null) break;
        price = nextPrice;
        debug.log(`升价第${i}次循环，当前查询价格${price}`);
        let tempResult = await this._getAuctionPrice(defId, price, helpers);
        (tempResult || []).map((/** @type {any} */ item) => {
          priceList.push(item.buyNowPrice);
        });
        if (tempResult.length > 0) {
          break;
        }
      }
    } else if (result.length == 21) {
      for (let i = 0; i < 5; i++) {
        const nextPrice = helpers.ea.incrementMarketPrice(price, "below");
        if (nextPrice === null) break;
        price = nextPrice;
        debug.log(`降价第${i}次循环，当前查询价格${price}`);
        let tempResult = await this._getAuctionPrice(defId, price, helpers);
        (tempResult || []).map((/** @type {any} */ item) => {
          priceList.push(item.buyNowPrice);
        });
        if (tempResult.length < 21) {
          break;
        }
      }
    }
    if (priceList.length) {
      const displayPrices = summarizeAuctionPrices(priceList);
      if (displayPrices.length > 0 && displayPrices[0]) {
        pdb[defId] = displayPrices[0].price.toLocaleString();
        e.setSubtext(pdb[defId]);
        e.displayCurrencyIcon(!0);
        renderAuctionPrices(e, displayPrices);
      }
    } else {
      e.setSubtext(fy("buyplayer.error.child3").slice(0, -1));
    }
  }

  /**
   * @param {any} players
   * @param {any} view
   * @param {any} helpers
   * @returns {Promise<any>}
   */
  async buyConceptPlayer(players, view, helpers) {
    const {
      getInfo,
      showLoader,
      hideLoader,
      notice,
      changeLoadingText,
      sendPinEvents,
      wait,
      cardAddBuyErrorTips,
      fy,
      debug,
      isPhone,
      getCurrentController,
      ea,
      maxNewItems = 100
    } = helpers;
    const info = getInfo();
    const playersNumber = Array.isArray(players) ? players.length : 0;
    /** @type {{
     *   success: boolean,
     *   requested: number,
     *   attempted: number,
     *   purchased: number,
     *   moved: number,
     *   failed: number,
     *   cancelled: boolean,
     *   cost: number,
     *   reason?: string
     * }} */
    const summary = {
      success: false,
      requested: playersNumber,
      attempted: 0,
      purchased: 0,
      moved: 0,
      failed: 0,
      cancelled: false,
      cost: 0
    };

    const purchaseCapacity = ea.isPurchaseCapacityReached(maxNewItems);
    if (!purchaseCapacity.success) {
      debug.log("EA purchase-capacity capability unavailable", purchaseCapacity.error);
      notice("notice.loaderror", 2);
      summary.reason = "capacity-unavailable";
      return summary;
    }
    if (purchaseCapacity.reached) {
      notice(["buyplayer.error", "", fy("buyplayer.error.child5")], 2);
      summary.reason = "capacity-reached";
      return summary;
    }

    info.run.bulkbuy = true;
    showLoader();
    try {
      for (let index = 0; index < playersNumber; index++) {
        if (!info.run.bulkbuy) {
          summary.cancelled = true;
          break;
        }
        const player = players[index];
        summary.attempted += 1;
        let defId,
          playerName,
          buyStatus = false;
        if (Number.isInteger(player)) {
          defId = player;
          const staticData = ea.getStaticItemData(defId);
          if (!staticData.success || !staticData.data) {
            debug.log("EA static-item capability unavailable", staticData.error);
            notice("buyplayer.getinfo.error", 2);
            summary.failed += 1;
            continue;
          }
          playerName = staticData.data.name;
        } else if (typeof player == "object" && player.isPlayer()) {
          defId = player.definitionId;
          playerName = player.getStaticData().name;
        }
        if (!defId) {
          notice("buyplayer.getinfo.error", 2);
          summary.failed += 1;
          continue;
        }
        let loadingInfo =
          playersNumber == 1 ? "" : ["readauction.progress", index + 1, playersNumber];
        let priceList;
        try {
          priceList = await this.readAuctionPrices(player, false, loadingInfo, helpers);
        } catch (error) {
          debug.log("Bulk buy price lookup failed", error);
          notice("notice.loaderror", 2);
          summary.failed += 1;
          if (defId) cardAddBuyErrorTips(defId);
          continue;
        }
        priceList.sort((a, b) => b._auction.buyNowPrice - a._auction.buyNowPrice);
        debug.log(priceList);
        changeLoadingText("buyplayer.loadingclose", loadingInfo);
        if (priceList.length == 0) {
          notice(["buyplayer.error", playerName, fy("buyplayer.error.child3")], 2);
          summary.failed += 1;
        } else {
          let currentPlayer = priceList[priceList.length - 1];
          const purchasePrice = currentPlayer._auction.buyNowPrice;
          let purchaseResult;
          try {
            purchaseResult = normalizeMarketPurchaseResult(
              await ea.purchaseItemToClub(
                currentPlayer,
                purchasePrice,
                this,
                () => sendPinEvents("Item - Detail View")
              )
            );
          } catch (error) {
            debug.log("Bulk purchase helper threw", error);
            notice("notice.loaderror", 2);
            summary.failed += 1;
            cardAddBuyErrorTips(defId);
            continue;
          }
          if (purchaseResult.success || purchaseResult.purchased) {
            notice(["buyplayer.success", playerName, purchasePrice], 0);
            summary.purchased += 1;
            summary.cost += purchasePrice;
          }
          if (purchaseResult.success) {
            notice(["buyplayer.sendclub.success", playerName], 0);
            summary.moved += 1;
            buyStatus = true;
            if (isPhone() && playersNumber == 1) {
              let controller = getCurrentController();
              if (controller.className == "UTSquadItemDetailsNavigationController") {
                controller.getParentViewController()._eBackButtonTapped();
              }
            }
          } else if (purchaseResult.reason === "insufficient-funds") {
            notice(["buyplayer.error", playerName, fy("buyplayer.error.child2")], 2);
            summary.failed += 1;
          } else if (purchaseResult.reason === "expired") {
            notice(["buyplayer.error", playerName, fy("buyplayer.error.child4")], 2);
            summary.failed += 1;
          } else if (purchaseResult.reason === "bid-failed") {
            notice(
              [
                "buyplayer.error",
                playerName,
                `${purchaseResult.permissionDenied ? fy("buyplayer.error.child1") : ""}`
              ],
              2
            );
            summary.failed += 1;
          } else if (purchaseResult.reason === "move-failed") {
            notice(["buyplayer.sendclub.error", playerName], 2);
            summary.failed += 1;
          } else if (!(purchaseResult.success || purchaseResult.purchased)) {
            debug.log("Bulk purchase unavailable", purchaseResult.error);
            notice("notice.loaderror", 2);
            summary.failed += 1;
          }
        }
        if (!buyStatus) {
          cardAddBuyErrorTips(defId);
        }
        if (playerName !== index) {
          await wait(0.5, 1);
        }
      }

      notice(
        ["buyplayer.bibresults", summary.purchased, playersNumber - summary.purchased, summary.cost],
        summary.purchased !== playersNumber ? 2 : 0
      );
      summary.success = !summary.cancelled && summary.failed === 0 && summary.purchased === playersNumber;
      return summary;
    } finally {
      info.run.bulkbuy = false;
      hideLoader();
    }
  }

  /**
   * @param {any} player
   * @param {any} view
   * @param {any} helpers
   * @returns {Promise<any>}
   */
  async buyPlayer(player, view, helpers) {
    const g = guardianOrFailClosed("MARKET_BUY");
    if (!g) return this._buyPlayerImpl(player, view, helpers);
    // DTO is primitives only (hash-safe, no functions/controllers/view).
    const defId = Number.isInteger(player)
      ? player
      : Number(player && (/** @type {any} */ (player).definitionId ?? /** @type {any} */ (player).defId));
    if (!Number.isFinite(defId) || defId <= 0) {
      throw new Error("GUARDIAN_PREVIEW_INVALID:MARKET_BUY");
    }
    const maxBuyPrice = Number(helpers?.getCachePrice?.(defId, 1)?.num);
    if (!Number.isFinite(maxBuyPrice) || maxBuyPrice <= 0) {
      throw new Error("GUARDIAN_PREVIEW_INVALID:MARKET_BUY_PRICE");
    }
    const dto = Object.freeze({ kind: "MARKET_BUY", defId, maxBuyPrice });
    // Runtime context (helpers with callbacks, view) is bound internally and is
    // never reachable from the public window API.
    return g.requestGuarded("MARKET_BUY", dto, {
      context: { player, view, helpers },
      summary: `Buy player ${defId}`,
      affectedItemIds: [String(defId)],
      costRisk: `Maximum ${maxBuyPrice} coins`
    });
  }

  /**
   * @param {any} player
   * @param {any} view
   * @param {any} helpers
   * @returns {Promise<any>}
   */
  async _buyPlayerImpl(player, view, helpers, /** @type {{maxBuyPrice?: number}} */ confirmed = {}) {
    const {
      showLoader,
      hideLoader,
      notice,
      changeLoadingText,
      sendPinEvents,
      cardAddBuyErrorTips,
      fy,
      debug,
      isPhone,
      getCurrentController,
      ea,
      maxNewItems = 100
    } = helpers;

    showLoader();
    let shouldMarkBuyError = false;
    let defId = 0,
      playerName = "";
    if (Number.isInteger(player)) {
      defId = player;
      const staticData = ea.getStaticItemData(defId);
      if (!staticData.success || !staticData.data) {
        debug.log("EA static-item capability unavailable", staticData.error);
        hideLoader();
        notice("notice.loaderror", 2);
        return;
      }
      playerName = staticData.data.name;
    } else if (typeof player == "object" && player.isPlayer()) {
      defId = player.definitionId;
      playerName = player.getStaticData().name;
    }
    if (!defId) {
      hideLoader();
      return;
    }
    const purchaseCapacity = ea.isPurchaseCapacityReached(maxNewItems);
    if (!purchaseCapacity.success) {
      debug.log("EA purchase-capacity capability unavailable", purchaseCapacity.error);
      notice("notice.loaderror", 2);
      hideLoader();
      return;
    }
    if (purchaseCapacity.reached) {
      notice(["buyplayer.error", playerName, fy("buyplayer.error.child5")], 2);
      shouldMarkBuyError = true;
    } else {
      const confirmedMaxBuyPrice = Number(confirmed.maxBuyPrice);
      let priceList = await this.readAuctionPrices(
        player,
        Number.isFinite(confirmedMaxBuyPrice) && confirmedMaxBuyPrice > 0 ? confirmedMaxBuyPrice : undefined,
        undefined,
        helpers
      );
      priceList.sort((a, b) => b._auction.buyNowPrice - a._auction.buyNowPrice);
      debug.log(priceList);
      changeLoadingText("buyplayer.loadingclose");
      if (priceList.length == 0) {
        notice(["buyplayer.error", playerName, fy("buyplayer.error.child3")], 2);
        shouldMarkBuyError = true;
      } else {
        let currentPlayer = priceList[priceList.length - 1];
        const purchasePrice = currentPlayer._auction.buyNowPrice;
        if (
          Number.isFinite(confirmedMaxBuyPrice) &&
          confirmedMaxBuyPrice > 0 &&
          Number(purchasePrice) > confirmedMaxBuyPrice
        ) {
          throw new Error("GUARDIAN_CONTEXT_MISMATCH:MARKET_BUY_PRICE");
        }
        const purchaseResult = normalizeMarketPurchaseResult(
          await ea.purchaseItemToClub(
            currentPlayer,
            purchasePrice,
            this,
            () => sendPinEvents("Item - Detail View")
          )
        );
        if (purchaseResult.success || purchaseResult.purchased) {
          notice(["buyplayer.success", playerName, purchasePrice], 0);
        }
        if (purchaseResult.success) {
          notice(["buyplayer.sendclub.success", playerName], 0);
          if (isPhone()) {
            let controller = getCurrentController();
            if (controller.className == "UTSquadItemDetailsNavigationController") {
              controller.getParentViewController()._eBackButtonTapped();
            }
          }
        } else if (purchaseResult.reason === "insufficient-funds") {
          notice(["buyplayer.error", playerName, fy("buyplayer.error.child2")], 2);
          shouldMarkBuyError = true;
        } else if (purchaseResult.reason === "expired") {
          notice(["buyplayer.error", playerName, fy("buyplayer.error.child4")], 2);
          shouldMarkBuyError = true;
        } else if (purchaseResult.reason === "bid-failed") {
          notice(
            [
              "buyplayer.error",
              playerName,
              `${purchaseResult.permissionDenied ? fy("buyplayer.error.child1") : ""}`
            ],
            2
          );
          shouldMarkBuyError = true;
        } else if (purchaseResult.reason === "move-failed") {
          notice(["buyplayer.sendclub.error", playerName], 2);
        } else {
          debug.log("EA purchase unavailable", purchaseResult.error || purchaseResult);
          notice("notice.loaderror", 2);
          shouldMarkBuyError = true;
        }
      }
    }
    if (shouldMarkBuyError) {
      cardAddBuyErrorTips(defId);
      if (view) {
        view.getSuperview().items._collection[view.getSuperview().items._index].render(player);
      }
    }
    hideLoader();
  }

  /**
   * @param {any} player
   * @param {any} price
   * @param {any} loadingInfo
   * @param {any} helpers
   * @returns {Promise<any[]>}
   */
  async readAuctionPrices(player, price, loadingInfo, helpers) {
    const {
      getInfo,
      changeLoadingText,
      getCachePrice,
      wait,
      notice,
      sendPinEvents,
      futbinId,
      debug,
      ea
    } = helpers;
    const info = getInfo();

    changeLoadingText("readauction.loadingclose", loadingInfo);
    let attempts = "queries_number" in info.set ? info.set.queries_number : 5;
    let defId = Number.isInteger(player)
      ? player
      : typeof player == "object" && "definitionId" in player
        ? player.definitionId
        : Number(player);
    if (!Number.isFinite(defId)) return [];
    const marketSearch = ea.createPlayerMarketSearch(defId);
    if (!marketSearch) {
      debug.log("EA capability unavailable", ea.inspect(EA_CAPABILITIES.MARKET_QUERY_MODEL));
      notice("readauction.error", 2);
      return [];
    }
    /** @type {any[]} */
    let result = [];
    /** @type {any[]} */
    let queried = [];
    if (price) {
      marketSearch.setMaxBuy(Number(price));
    } else {
      try {
        if (hasOwn(info.futbinId, defId)) {
          await futbinId.getPrice(defId, info.futbinId[defId]);
        } else {
          await futbinId.getId(player);
        }
      } catch {
        return [];
      }
      marketSearch.setMaxBuy(getCachePrice(defId, 1).num);
    }
    changeLoadingText("readauction.loadingclose2", loadingInfo);
    while (attempts-- > 0) {
      const currentMaxBuy = marketSearch.getMaxBuy();
      changeLoadingText(
        ["readauction.loadingclose3", `${currentMaxBuy.toLocaleString()}`],
        loadingInfo
      );
      if (queried.includes(currentMaxBuy)) {
        break;
      }
      ea.clearTransferMarketCache();
      const response = await this.searchTransferMarket(
        marketSearch.getCriteria(),
        1,
        helpers
      );
      if (response.success) {
        const items = response.data.items;
        sendPinEvents("Transfer Market Results - List View");
        result = result.concat(items);
        queried.push(currentMaxBuy);
        if (items.length == 0 || items.length == 21) {
          const direction = items.length == 0 ? "above" : "below";
          const nextPrice = ea.incrementMarketPrice(currentMaxBuy, direction);
          if (nextPrice === null) {
            debug.log("EA capability unavailable", ea.inspect(EA_CAPABILITIES.CURRENCY_STEPS));
            break;
          }
          marketSearch.setMaxBuy(nextPrice);
        } else {
          break;
        }
      } else {
        notice("readauction.error", 2);
        break;
      }
      if (attempts > 0) {
        await wait(0.2, 0.5);
      }
    }
    return result;
  }

  /**
   * @param {any} criteria
   * @param {any} type
   * @param {any} helpers
   * @returns {Promise<any>}
   */
  async searchTransferMarket(criteria, type, helpers) {
    return normalizeMarketSearchResult(
      await helpers.ea.searchTransferMarket(criteria, type, this)
    );
  }

  /**
   * @param {any} controller
   * @param {any} list
   * @param {any} helpers
   * @returns {Promise<void>}
   */
  async transferToClub(controller, list, helpers) {
    const { notice, isPhone, ea, debug } = helpers;
    const result = await ea.moveItemsToClub(list, controller);
    if (result.success) {
      if (result.movedCount < list.length) {
        notice(["transfertoclub.unable", list.length - result.movedCount], 2);
      }
      if (isPhone()) {
        controller.refreshList();
      }
    } else if (result.error?.code === "EA_CAPABILITY_UNAVAILABLE") {
      debug.log("EA capability unavailable", result.error);
      notice("notice.loaderror", 2);
    }
  }

  /**
   * @param {any} d
   * @param {any} p
   * @param {any} time
   * @param {any} helpers
   * @returns {Promise<any>}
   */
  async playerToAuction(d, p, time, helpers) {
    const g = guardianOrFailClosed("MARKET_LIST");
    if (!g) return this._playerToAuctionImpl(d, p, time, helpers);
    const itemDefId =
      d && typeof d === "object" ? (/** @type {any} */ (d).defId ?? /** @type {any} */ (d).id ?? null) : null;
    if (!Number.isFinite(Number(itemDefId)) || !Number.isFinite(Number(p)) || !Number.isFinite(Number(time))) {
      throw new Error("GUARDIAN_PREVIEW_INVALID:MARKET_LIST");
    }
    const listingPrice = Number(helpers?.getCachePrice?.(Number(itemDefId), 1)?.num);
    if (!Number.isFinite(listingPrice) || listingPrice <= 0) {
      throw new Error("GUARDIAN_PREVIEW_INVALID:MARKET_LIST_PRICE");
    }
    const dto = Object.freeze({
      kind: "MARKET_LIST",
      itemDefId: Number(itemDefId),
      requestedPrice: Number(p),
      durationHours: Number(time),
      listingPrice
    });
    return g.requestGuarded("MARKET_LIST", dto, {
      context: { d, p, time, helpers },
      summary: `List item ${itemDefId}`,
      affectedItemIds: [String(itemDefId)],
      costRisk: `List for ${listingPrice} coins / ${Number(time)}h`
    });
  }

  /**
   * @param {any} d
   * @param {any} p
   * @param {any} time
   * @param {any} helpers
   * @returns {Promise<any>}
   */
  async _playerToAuctionImpl(d, p, time, helpers, /** @type {{listingPrice?: number}} */ confirmed = {}) {
    const {
      futbinId,
      getInfo,
      getCachePrice,
      notice,
      playerGetLimits,
      getCurrentController,
      debug,
      ea
    } = helpers;
    const info = getInfo();

    const listingItem = ea.findListingItem(d);
    if (!listingItem.success) {
      debug.log("EA listing-inventory capability unavailable", listingItem.error);
      notice("notice.loaderror", 2);
      return false;
    }
    const i = listingItem.item;
    const t = listingItem.alreadyListed;
    if (i) {
      //25.13 读取futbin最新的价格
      const confirmedListingPrice = Number(confirmed.listingPrice);
      if (!Number.isFinite(confirmedListingPrice) || confirmedListingPrice <= 0) {
        try {
          if (hasOwn(info.futbinId, i.definitionId)) {
            await futbinId.getPrice(i.definitionId, info.futbinId[i.definitionId]);
          } else {
            await futbinId.getId(i);
          }
        } catch {
          return false;
        }
      }
      const price =
        Number.isFinite(confirmedListingPrice) && confirmedListingPrice > 0
          ? confirmedListingPrice
          : getCachePrice(i.definitionId, 1).num;

      const listingCapacity = ea.hasTransferListingCapacity();
      if (!listingCapacity.success) {
        debug.log("EA listing-inventory capability unavailable", listingCapacity.error);
        notice("notice.loaderror", 2);
        return false;
      }
      if ((listingCapacity.hasCapacity || t) && price) {
        await playerGetLimits(i);
        if (i.hasPriceLimits()) {
          if (p < i._itemPriceLimits.minimum || p > i._itemPriceLimits.maximum) {
            notice(["notice.auctionlimits", i._staticData.name], 2);
            return false;
          }
        }
        const startingPrice = ea.incrementMarketPrice(price, "below");
        if (startingPrice === null) {
          debug.log("EA currency-step capability unavailable");
          notice("notice.loaderror", 2);
          return false;
        }
        const result = normalizeMarketListingResult(
          await ea.listItemForSale(
            i,
            startingPrice,
            price,
            time * 3600,
            getCurrentController()
          )
        );
        if (result.success) {
          notice(["notice.auctionsuccess", i._staticData.name, price], 0);
        } else if (result.error?.code === "EA_CAPABILITY_UNAVAILABLE") {
          debug.log("EA listing capability unavailable", result.error);
          notice("notice.loaderror", 2);
          return false;
        } else if (result.error?.code === MARKET_RESULT_INVALID) {
          debug.log("EA listing result rejected", result.error);
          notice("notice.loaderror", 2);
          return false;
        }
        return result.success;
      } else {
        notice("notice.auctionmax", 2);
        return false;
      }
    } else {
      notice(["notice.auctionnoplayer", d], 2);
      return false;
    }
  }

  /**
   * @param {any} e
   * @param {any} t
   * @param {any} helpers
   * @returns {Promise<any>}
   */
  async losAuctionSell(e, t, helpers) {
    const {
      getInfo,
      showLoader,
      hideLoader,
      notice,
      changeLoadingText,
      getCachePrice,
      wait,
      debug,
      isPhone,
      getCurrentController,
      getLeftController,
      ea
    } = helpers;
    const info = getInfo();
    /** @type {{
     *   success: boolean,
     *   attempted: number,
     *   listed: number,
     *   failed: number,
     *   cancelled: boolean,
     *   items: Array<{ id: string, success: boolean, reason?: string }>,
     *   reason?: string
     * }} */
    const summary = {
      success: false,
      attempted: 0,
      listed: 0,
      failed: 0,
      cancelled: false,
      items: []
    };

    e.setInteractionState(0);
    info.run.losauction = true;
    showLoader();
    try {
      let a = e._parent._fsuAkbArray,
        b = e._parent._fsuAkbCurrent,
        pn = 0,
        time = t == 0 ? 1 : t;
      notice(["loas.start", `${b}`, `${b * 5}`], 1);
      for (let n in a) {
        if (!info.run.losauction) {
          summary.cancelled = true;
          break;
        }
        pn++;
        summary.attempted += 1;
        changeLoadingText(["loadingclose.loas", `${pn}`, `${b - pn}`]);
        try {
          const listed = await this.playerToAuction(
            n,
            getCachePrice(a[n]._pId, 1).num,
            time,
            helpers
          );
          if (!listed) {
            summary.failed += 1;
            summary.items.push({ id: String(n), success: false, reason: "list-failed" });
            // Continue remaining items (documented fail-continue policy).
            continue;
          }
          summary.listed += 1;
          summary.items.push({ id: String(n), success: true });
          debug.log(a[n]._l);
          if (isPhone()) {
            a[n].toggle(false);
            e._parent.listRows[a[n]._l].hide();
            e._parent._fsuAkbCurrent--;
            e._parent._fsuAkbNumber--;
            delete e._parent._fsuAkbArray[a[n]._id];
            this.losAuctionCount(e._parent, undefined, helpers);
          }
        } catch (error) {
          debug.log("Mass listing item failed", error);
          summary.failed += 1;
          summary.items.push({ id: String(n), success: false, reason: "error" });
          continue;
        }
        await wait(2, 4);
      }

      let currentController = isPhone() ? getCurrentController() : getLeftController();
      if (currentController.className == "UTUnassignedItemsViewController") {
        const resetResult = await ea.resetUnassignedItems();
        if (!resetResult.success) {
          debug.log("EA unassigned reset capability unavailable", resetResult.error);
          notice("notice.loaderror", 2);
          summary.reason = "reset-failed";
          summary.success = false;
          return summary;
        }
        try {
          await currentController.getUnassignedItems();
        } catch (error) {
          debug.log("Unassigned refresh failed", error);
          notice("notice.loaderror", 2);
          summary.reason = "refresh-failed";
          return summary;
        }
      } else {
        try {
          currentController.refreshList();
        } catch (error) {
          debug.log("List refresh failed", error);
          notice("notice.loaderror", 2);
          summary.reason = "refresh-failed";
          return summary;
        }
      }
      summary.success = !summary.cancelled && summary.failed === 0 && !summary.reason;
      return summary;
    } finally {
      info.run.losauction = false;
      hideLoader();
      e.setInteractionState(e._parent._fsuAkbCurrent);
    }
  }

  /**
   * @param {any} e
   * @param {any} t
   * @param {any} helpers
   */
  losAuctionCount(e, t, helpers) {
    const { getCachePrice } = helpers;

    if (
      e.hasOwnProperty("_fsuAkbCurrent") &&
      e.hasOwnProperty("_fsuAkbNumber") &&
      e.hasOwnProperty("_fsuAkbArray")
    ) {
      let pn = 0;
      for (let n in e._fsuAkbArray) {
        const ppValue = getCachePrice(e._fsuAkbArray[n]._pId, 1);
        pn += ppValue.num;
        if (!ppValue.num) {
          e._fsuAkbArray[n].setInteractionState(0);
        } else if (ppValue.text && ppValue.num == 0) {
          e._fsuAkbArray[n].setInteractionState(0);
          e._fsuAkbCurrent--;
          e._fsuAkbNumber--;
          delete e._fsuAkbArray[n];
        } else {
          e._fsuAkbArray[n].setInteractionState(1);
        }
      }
      e._fsuAkb.querySelector(".fsu-akb-num").innerText = e._fsuAkbCurrent;
      e._fsuAkb.querySelector(".fsu-akb-max").innerText = e._fsuAkbNumber;
      e._fsuAkb.querySelector(".fsu-akb-price").innerText = pn.toLocaleString();
      if (pn) {
        e._fsuAkbButton.setInteractionState(1);
        e._fsuAkbToggle.setInteractionState(1);
      } else if (pn == 0) {
        e._fsuAkbButton.setInteractionState(0);
      }
    }
  }
}

