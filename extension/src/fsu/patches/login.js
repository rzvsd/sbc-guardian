export function installLoginPatches(deps) {
  const { call, info, services, debug, GM_getValue, GM_xmlhttpRequest } = deps;
  //24.20 lodin页面插入已加载提示
UTLoginView.prototype._generate = function (...args) {
    if (!this._generated) {
        call.view.login.call(this, ...args);

        let locale = services.Localization.locale;
        if(locale.language == "zh"){
            info.language = locale.variant == "Hans" ? 0 : 1;
        }
        //读取是否有futgg接口
        const apiProxy = GM_getValue("apiproxy");

        if (_.isString(apiProxy) && !_.isEmpty(apiProxy)) {
            info.apiProxy = apiProxy;
        }

        //26.04 自动切换价格获取接口的脚本
        if (info.externalPricesAvailable !== false) GM_xmlhttpRequest({
            method: 'GET',
            url: `https://www.fut.gg/api/fut/player-prices/26/?ids=${_.random(20000, 39999)}`,
            anonymous: false, // 关键：利用当前页面的已存 Cookie
            headers: {
                'Accept': 'application/json',
                'Referer': window.location.origin, // 动态获取当前页面的 origin
                'X-Requested-With': 'XMLHttpRequest'
            },
            onload: function (res) {
                if (res.status === 200) {
                    info.apiPlatform = 1; // 使用 futgg API
                } else {
                    // info.apiPlatform = info.apiProxy === "" ? 3 : 2;
                    info.apiPlatform = 3;
                }
                debug.log("apiPlatform:", info.apiPlatform);
            },
            onerror: function (_err) {
                // info.apiPlatform = info.apiProxy === "" ? 3 : 2;
                info.apiPlatform = 3;
                debug.log("apiPlatform:", info.apiPlatform);
            }
        });



    }
}
//24.15 底层界面展示
EAViewController.prototype.viewDidAppear = function(...args) {
    call.view.ea.call(this,...args);
}
}
