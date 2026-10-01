import { FSU_BASE_STYLE } from "../ui/fsu-styles.js";
import { installUnassignedPatches } from "../patches/unassigned.js";
import { installLoginPatches } from "../patches/login.js";
import { installNavigationPatches } from "../patches/navigation.js";
import { installSquadBuilderPatches } from "../patches/squad-builder.js";
import { installPlayerCardPatches } from "../patches/player-cards.js";
import { installPicksRewardsPatches } from "../patches/picks-rewards.js";
import { installSquadOverviewViewPatches } from "../patches/squad-overview-view.js";
import { installSectionedListPatches } from "../patches/sectioned-list.js";
import { registerBuildIgnoreEvents } from "../patches/build-ignore.js";
import { installPlayerListPatches } from "../patches/player-list.js";
import { installSbcHubPatches, registerSbcInfoFillEvent } from "../patches/sbc-hub.js";
import { installAcademyHubPatches } from "../patches/academy-hub.js";
import { registerSbcNavEvents } from "../patches/sbc-nav-events.js";
import { installSbcSquadSubmitPatches, installSbcRequirementsPatch } from "../patches/sbc-squad.js";
import { registerSbcSubstitutionEvents } from "../patches/sbc-substitution.js";
import { installObjectivesHubPatches } from "../patches/objectives-hub.js";
import { registerHomeHubEvents, installHomeHubPatches } from "../patches/home-hub.js";
import { installMarketPatches } from "../patches/market.js";
import { installStorePatches } from "../patches/store.js";
import { installSearchPatches, registerSearchEvents } from "../patches/search-events.js";
import { registerSbcFillEvents } from "../patches/sbc-fill-events.js";
import { installSbcFillPatches } from "../patches/sbc-fill-patches.js";
import { registerSbcTileEvents } from "../patches/sbc-tile-events.js";
import { registerSbcRewardEvents } from "../patches/sbc-reward-events.js";
import { registerFastSbcEvents } from "../patches/sbc-fast.js";
import { installClubSelectPatches } from "../patches/club-select.js";
import { registerClubSelectEvents } from "../patches/club-select-events.js";
import { installClubSelectSearchPatches } from "../patches/club-select-search-patches.js";
import { installRewardPatches } from "../patches/rewards.js";
import { installClubHubPatches } from "../patches/club-hub.js";
import { registerListFilterEvents } from "../patches/list-filter-events.js";
import { registerUiUtilsEvents, installUiUtilsPatches } from "../patches/ui-utils.js";
import { installLocalizationPatch, registerPlayerMetaEvents } from "../patches/player-meta.js";
import { installSbcSubmitPatch } from "../patches/sbc-submit.js";
import { registerMiscEvents, installMiscPatches } from "../patches/misc-patches.js";
import { registerLifecycleEvents, installLifecyclePatches } from "../patches/lifecycle-patches.js";
import { installAcademyDetailsPatches } from "../patches/academy-details.js";
import {
  registerSbcIgnoreTextEvent,
  installSbcSquadOverviewPatches,
  installSbcSquadDetailPanelPatches
} from "../patches/sbc-squad-overview.js";
import { installPlayerBioPatches } from "../patches/player-bio.js";
import { installPanelPatches } from "../patches/panel-patches.js";
import { installPlayerMetaCachePatches } from "../patches/player-meta-cache.js";

/**
 * Declarative patch installer preserving legacy hook order.
 */
export class PatchInstaller {
  /**
   * @param {object} ctx - Shared futweb runtime context
   */
  constructor(ctx) {
    this.ctx = ctx;
  }

  applyBaseStyle() {
    const { info } = this.ctx;
    info.base.style = FSU_BASE_STYLE;
  }

  wirePriceService() {
    const { events, fy, priceService } = this.ctx;
    priceService.setErrorHandler((error) => {
      if (error === "PRICE_PROVIDER_UNAVAILABLE") {
        events.notice("notice.pricesunavailable", 2);
        return;
      }
      events.notice(fy("notice.loaderror") + error, 2);
      events.hideLoader();
    });
    events.getFutbinUrl = (url) => priceService.getFutbinUrl(url);
    events.getPriceForUrl = (definitionIds) => priceService.getPriceForUrl(definitionIds);
    events.getPriceForFubin = (playerResourceId) => priceService.getPriceForFutbin(playerResourceId);
    events.getCachePrice = (definitionId, type) => priceService.getCachePrice(definitionId, type);
    events.priceLastDiff = (purchasePrice, lastPrice) => priceService.priceLastDiff(purchasePrice, lastPrice);
    events.externalRequest = (method, url, body, cType) =>
      this.ctx.httpClient.request(method, url, body, cType);
  }

  installEarly() {
    const c = this.ctx;
    this.applyBaseStyle();
    this.wirePriceService();
    installUnassignedPatches(
      c.pick(
        "call",
        "events",
        "fy",
        "cntlr",
        "info",
        "services",
        "repositories",
        "isPhone",
        "debug"
      )
    );
    Object.assign(c.events, c.ctx.createSbcChemistryService(c.repositories.TeamConfig).createEventsFacade());
    installLoginPatches(c.pick("call", "events", "info", "services", "debug", "fy", "GM_getValue", "GM_xmlhttpRequest"));
    installNavigationPatches(c.pick("call", "events", "info", "isPhone", "SBCCount"));
    this.installTacticsRolePatch();
    installSquadBuilderPatches(c.pick("call", "events", "fy", "info", "build"));
    installPlayerCardPatches(c.pick("call", "events", "fy", "cntlr", "info", "lock"));
  }

  installTacticsRolePatch() {
    const { call } = this.ctx;
    UTTacticsRoleSelectViewController.prototype.viewDidAppear = function (...args) {
      call.view.tacticsRole.call(this, ...args);
    };
  }

  installHubAndLists() {
    const c = this.ctx;
    installPicksRewardsPatches(c.pick("call", "events", "info", "fy", "isPhone", "debug"));
    installSquadOverviewViewPatches(
      c.pick(
        "call",
        "events",
        "info",
        "fy",
        "cntlr",
        "isPhone",
        "repositories",
        "services",
        "debug",
        "SBCEligibilityKey",
        "GM_openInTab"
      )
    );
    installSectionedListPatches(c.pick("call", "events", "info", "fy", "cntlr", "services", "debug"));
    registerBuildIgnoreEvents(c.pick("events", "info", "fy", "set", "build", "debug"));
    installPlayerListPatches(
      c.pick(
        "call",
        "events",
        "info",
        "cntlr",
        "isPhone",
        "debug",
        "repositories",
        "services",
        "fy",
        "futbinId",
        "patchLifecycle"
      )
    );
    installSbcHubPatches(c.pick("info", "events", "services", "fy", "cntlr"));
    installAcademyHubPatches(c.pick("info", "events", "fy", "repositories", "debug"));
    registerSbcInfoFillEvent(c.pick("events", "info", "fy", "html", "repositories"));
    registerSbcNavEvents(
      c.pick(
        "events",
        "info",
        "fy",
        "cntlr",
        "isPhone",
        "repositories",
        "services",
        "futbinId",
        "GM_openInTab",
        "patchLifecycle"
      )
    );
  }

  installSbcCore() {
    const c = this.ctx;
    installPlayerBioPatches(c.pick("events", "info", "cntlr", "services", "debug", "fy", "repositories"));
    installPanelPatches(
      c.pick(
        "call",
        "events",
        "info",
        "fy",
        "cntlr",
        "isPhone",
        "patchLifecycle"
      )
    );
    this.wireSbcMatchEvents();
    registerSbcSubstitutionEvents({ events: c.events });
    installObjectivesHubPatches(c.pick("call", "events", "info", "fy", "isPhone", "services"));
    registerHomeHubEvents(c.pick("events", "info", "cntlr", "isPhone", "services"));
    installHomeHubPatches(c.pick("call", "events", "info", "fy", "cntlr", "services", "debug", "fsuSC"));
  }

  wireSbcMatchEvents() {
    const { events, sbcPlayerMatchService } = this.ctx;
    const getSbcMatchHelpers = () => ({
      calculateChemistry: (...args) => events.calculateChemistry(...args),
      getChemistryPlayers: (...args) => events.getChemistryPlayers(...args),
      getItemBy: (...args) => events.getItemBy(...args),
      createVirtualChallenge: (...args) => events.createVirtualChallenge(...args)
    });
    events.SBCSetMeetsPlayers = (controller) =>
      sbcPlayerMatchService.findMeetsPlayers(controller, getSbcMatchHelpers());
  }

  installMarketAndSquad() {
    const c = this.ctx;
    installMarketPatches(
      c.pick(
        "call",
        "events",
        "info",
        "cntlr",
        "isPhone",
        "fy",
        "debug",
        "repositories",
        "services",
        "GM_setValue",
        "patchLifecycle"
      )
    );
    installStorePatches(
      c.pick(
        "call",
        "events",
        "info",
        "cntlr",
        "isPhone",
        "fy",
        "debug",
        "repositories",
        "services",
        "GM_setValue",
        "AssetLocationUtils",
        "unsafeWindow",
        "patchLifecycle",
        "httpClient"
      )
    );
    installSearchPatches(c.pick("call", "events", "info", "isPhone", "cntlr", "fy"));
    registerSearchEvents(c.pick("call", "events", "info", "cntlr", "isPhone"));
    installSbcSquadSubmitPatches(
      c.pick("call", "events", "info", "repositories", "services", "cntlr", "debug", "fy")
    );
    registerSbcFillEvents(
      c.pick(
        "call",
        "events",
        "info",
        "cntlr",
        "isPhone",
        "services",
        "debug",
        "repositories",
        "build",
        "fastSbcService",
        "oneFillCriteriaService",
        "sbcSquadFillService",
        "sbcTemplateService",
        "sbcSquadSaveService"
      )
    );
    installSbcFillPatches(
      c.pick(
        "call",
        "events",
        "info",
        "cntlr",
        "isPhone",
        "services",
        "debug",
        "repositories",
        "build",
        "fsuSC",
        "fy",
        "enums",
        "GM_setValue"
      )
    );
    registerSbcTileEvents(
      c.pick("events", "info", "fy", "cntlr", "isPhone", "services", "GM_setValue", "AssetLocationUtils")
    );
    registerSbcRewardEvents(
      c.pick(
        "events",
        "info",
        "cntlr",
        "isPhone",
        "repositories",
        "services",
        "debug",
        "oneFillCriteriaService",
        "SBCEligibilityKey"
      )
    );
    registerFastSbcEvents(
      c.pick(
        "events",
        "cntlr",
        "info",
        "debug",
        "repositories",
        "services",
        "fy",
        "fastSbcPlannerService"
      )
    );
  }

  installClubAndUi() {
    const c = this.ctx;
    installClubSelectPatches(c.pick("call", "events", "info", "fy", "cntlr", "isPhone", "repositories", "services", "debug"));
    registerClubSelectEvents(c.pick("events", "info", "cntlr", "isPhone", "services", "repositories", "debug", "fy"));
    installClubSelectSearchPatches(c.pick("call", "events", "info", "fy", "cntlr", "repositories", "services"));
    installRewardPatches(
      c.pick(
        "call",
        "events",
        "info",
        "fy",
        "cntlr",
        "repositories",
        "debug",
        "patchLifecycle",
        "isPhone"
      )
    );
    installClubHubPatches(c.pick("call", "events", "info", "fy", "cntlr", "isPhone", "repositories", "services"));
    registerListFilterEvents(c.pick("events", "repositories"));
    registerUiUtilsEvents(c.pick("events", "info", "cntlr", "debug", "fy", "services"));
    installUiUtilsPatches(c.pick("patchLifecycle"));
    installLocalizationPatch(c.pick("call"));
    registerPlayerMetaEvents(c.pick("events", "info", "fy", "services"));
  }

  installLate() {
    const c = this.ctx;
    installPlayerMetaCachePatches(
      c.pick(
        "info",
        "services",
        "repositories",
        "GM_setValue",
        "patchLifecycle",
        "debug"
      )
    );
    installSbcSubmitPatch({
      sbcCountService: c.ctx.sbcCountService,
      onCountChanged: () => c.SBCCount.changeCount(),
      patchLifecycle: c.patchLifecycle,
      debug: c.debug
    });
    registerMiscEvents(c.pick("events", "info", "cntlr", "services", "repositories", "debug", "fy"));
    installMiscPatches(c.pick("events", "info", "fy", "debug"));
    installSbcRequirementsPatch(c.pick("events", "info", "fy", "repositories"));
    registerLifecycleEvents(c.pick("events", "info", "fy", "debug"));
    installLifecyclePatches(c.pick("events", "cntlr", "isPhone", "info"));
    installAcademyDetailsPatches(
      c.pick("info", "events", "repositories", "services", "cntlr", "isPhone", "debug")
    );
    registerSbcIgnoreTextEvent(c.pick("events", "info", "fy"));
    installSbcSquadOverviewPatches(
      c.pick("events", "info", "fy", "cntlr", "isPhone", "repositories", "debug", "SBCEligibilityKey")
    );
    installSbcSquadDetailPanelPatches(c.pick("events", "info", "cntlr"));
  }

  installAll() {
    this.installEarly();
    this.installHubAndLists();
    this.installSbcCore();
    this.installMarketAndSquad();
    this.installClubAndUi();
    this.installLate();
  }
}
