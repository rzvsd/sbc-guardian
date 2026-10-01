import { AppContext } from "./AppContext.js";
import { LOCALIZATION_STRINGS } from "../data/localization.js";
import { createGameInfo } from "../data/game-config.js";
import { createLocalization } from "../domain/Localization.js";

/**
 * Builds AppContext, game info, and localization for futweb bootstrap.
 */
export function createAppRuntime() {
  const info = createGameInfo();
  info.externalPricesAvailable = GM_info.externalPricesAvailable !== false;
  const ctx = new AppContext({
    getValue: GM_getValue,
    setValue: GM_setValue,
    xmlHttpRequest: GM_xmlhttpRequest,
    userAgent: navigator.userAgent,
    getInfo: () => info
  });
  const { fy, eafy } = createLocalization(() => info);
  info.localization = LOCALIZATION_STRINGS;

  return {
    info,
    ctx,
    store: ctx.store,
    httpClient: ctx.httpClient,
    priceService: ctx.priceService,
    debug: ctx.debug,
    cntlr: ctx.controllerAccess,
    fy,
    eafy
  };
}