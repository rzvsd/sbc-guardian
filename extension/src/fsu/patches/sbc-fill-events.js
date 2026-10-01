export function registerSbcFillEvents(deps) {
  const { call, events, info, cntlr, isPhone, services, debug, repositories, fastSbcService, oneFillCriteriaService, sbcSquadFillService, sbcTemplateService, sbcSquadSaveService } = deps;
  events.fastSBCQuantity = (clubMode, playerPool, criteria) =>
    fastSbcService.calculateQuantity({
        clubMode,
        playerPool,
        criteria,
        helpers: {
            getItemBy: (...args) => events.getItemBy(...args),
            isEligibleForOneFill: (...args) => events.isEligibleForOneFill(...args),
            ignorePlayerToCriteria: (...args) => events.ignorePlayerToCriteria(...args),
            build: info.build
        }
    });
//未分配界面
UTUnassignedItemsViewController.prototype.renderView = function(...args) {
    call.view.unassigned.call(this, ...args);
    //未分配为0直接返回
    setTimeout(() => {
        if(this.getViewModel() && this.getViewModel().length === 0 && !document.querySelector(".ut-player-picks-view")){
            if(isPhone()){
                this.parentViewController.backButton._tapDetected(this)
            }else{
                this.parentViewController.parentViewController.backButton._tapDetected(this)
            }
            events.notice("notice.packback",1);
        }

        if(this.getViewModel() == null){
            return;
        }
        //24.15 头部SBC导航：未分配列表时检测无效的包予以隐藏
        let invalidPick = _.filter(this.getViewModel().values(), item => {
            return item.isPlayerPickItem() && item.id === item.definitionId;
        });
        if(invalidPick.length){
            _.map(this.getView().sections,section => {
                _.map(section.listRows,item => {
                    if(item.data.isPlayerPickItem() && item.data.id === item.data.definitionId){
                        item.hide()
                    }
                })
            })
        }



    },800);
}

//SBC无须排列创建队伍
UTSquadBuilderViewModel.prototype.generatePlayerCollection = function(e, o, n, r) {
    let c = 0;
    let ls = info.build.league ? info.set.shield_league : [];
    let rs = info.build.rare ? [3] : [];
    let p = o.filter(item => !info.lock.includes(item.id) && !ls.includes(item.leagueId) && !rs.includes(item.rareflag))
    let v = 0;
    for (let i = 0; i < 11; i++) {
        if(!r || (!r.getSlot(i).isValid() && !r.getSlot(i).isBrick())){
            v++;
        }
    }
    if(p.length < v && (ls.length || rs.length)){
        events.notice("notice.builder",2)
    }
    let s = this;
    let pa = e.map(function (_, t) {
        var i = r ? r.getSlot(t) : null;
        return i && (i.isValid() || i.isBrick()) ?
            i.getItem() :
            (n || info.build.ignorepos) ?
            p[c++] : s.getBestPlayerForPos(_, p);
    })
    events.loadPlayerInfo(pa);
    return pa;
};

//拍卖优化部分代码加载 → installMarketPatches

//购买失败添加标识
events.cardAddBuyErrorTips = (defId) => {
    let squad = cntlr.current()._squad;
    if(!("_fsuBuyEroor" in squad)){
        squad._fsuBuyEroor = [];
    }
    if (!_.includes(squad._fsuBuyEroor,defId)) {
        squad._fsuBuyEroor.push(defId);
    }
    debug.log(squad._fsuBuyEroor)
    if(!isPhone()){
        _.map(squad._fsuBuyEroor,i => {
            if(document.querySelector(`.fsu-cards-buyerror[data-id="${i}"]`) == null && document.querySelector(`.fsu-cards-price[data-id="${i}"]`) !== null){
                let buyErrorElement = events.getCardTipsHtml(1);
                let targetElement = document.querySelector(`.ut-squad-slot-view .concept .fsu-cards-price[data-id="${i}"]`).parentNode;
                let parentElement = targetElement.parentNode;
                if(parentElement.querySelector(".fsu-cards-buyerror") == null){
                    parentElement.insertBefore(buyErrorElement, targetElement);
                }
            }
        })
    }
}
events.getCardTipsHtml = (type) => {
    const configMap = {
        1: {
            tipsClass: "fsu-cards-buyerror",
            tipsIcon: "icon_untradeable"
        },
        2: {
            tipsClass: "fsu-cards-storage",
            tipsIcon: "icon_sbc"
        },
        3: {
            tipsClass: "fsu-cards-unassigned",
            tipsIcon: "icon_undo_discard"
        },
    };
    //type 1:购买失败 2:SBC仓库 3:未分配列表
    const {
        tipsClass,
        tipsIcon,
    } = configMap[type] || configMap[1]; // 默认使用 type=1 配置
    let tipsElement = events.createElementWithConfig("div",{
        classList:["ut-squad-slot-chemistry-points-view","item","fsu-cards",tipsClass]
    })
    let tipsElementIcon = events.createElementWithConfig("div",{
        classList:["ut-squad-slot-chemistry-points-view--container","chemstyle",tipsIcon]
    })
    tipsElement.appendChild(tipsElementIcon);
    return tipsElement;
}

events.sendPinEvents = (pageId) => {
    services.PIN.sendData(PINEventType.PAGE_VIEW, {type: PIN_PAGEVIEW_EVT_TYPE,pgid: pageId,});
};

//25.13 一键填充的验证
events.isEligibleForOneFill = (obj) => oneFillCriteriaService.isEligibleForOneFill(obj);


//指定ID填充SBC
events.playerListFillSquad = (challenge, list, type) =>
    sbcSquadFillService.fillFromPlayerList(challenge, list, type, {
        showLoader: () => events.showLoader(),
        getFormation: (formation) => repositories.Squad.getFormation(formation),
        ignorePosition: info.build.ignorepos,
        loadPlayerInfo: (...args) => events.loadPlayerInfo(...args),
        saveSquad: (...args) => events.saveSquad(...args),
        saveOldSquad: (...args) => events.saveOldSquad(...args)
    });
//阵容智能填充
events.getTemplate = async (controller, type, sId) =>
    sbcTemplateService.loadTemplate(controller, type, sId, {
        showLoader: () => events.showLoader(),
        hideLoader: () => {
          // Scope-owned hide: only clear shield UI, do not re-enter cancel facades.
          document.querySelector(".ut-click-shield")?.classList.remove("showing", "fsu-loading");
          const loaderIcon = document.querySelector(".loaderIcon");
          if (loaderIcon) loaderIcon.style.display = "none";
          if (typeof events.changeLoadingText === "function") {
            events.changeLoadingText("loadingclose.text");
          }
        },
        changeLoadingText: (...args) => events.changeLoadingText(...args),
        notice: (...args) => events.notice(...args),
        getFutbinSbcSquad: (...args) => events.getFutbinSbcSquad(...args),
        getItemBy: (...args) => events.getItemBy(...args),
        ignorePlayerToCriteria: (...args) => events.ignorePlayerToCriteria(...args),
        createVirtualChallenge: (...args) => events.createVirtualChallenge(...args),
        saveSquad: (...args) => events.saveSquad(...args),
        saveOldSquad: (...args) => events.saveOldSquad(...args),
        getGoldenRange: () => info.set.goldenrange,
        getFormationMap: () => info.formation,
        debug,
        isPhone,
        navigateBack: () => cntlr.current().getNavigationController()._eBackButtonTapped()
    });
events.cancelSbcTemplate = () => sbcTemplateService.cancel();
events.isSbcTemplateRunning = () => sbcTemplateService.isRunning();
//阵容方案保存

events.saveSquad = async (challenge, squad, players) =>
    sbcSquadSaveService.save(challenge, squad, players, {
        setSaving: (value) => {
            info.base.savesquad = value;
        },
        saveChallenge: (target) => services.SBC.saveChallenge(target),
        loadChallengeData: (target) => services.SBC.loadChallengeData(target),
        notice: (...args) => events.notice(...args),
        hideLoader: () => events.hideLoader(),
        loadPlayerInfo: (...args) => events.loadPlayerInfo(...args),
        isPhone,
        getCurrentController: () => cntlr.current(),
        getActiveView: () => (isPhone() ? cntlr.current() : cntlr.left()),
        debug
    });
}
