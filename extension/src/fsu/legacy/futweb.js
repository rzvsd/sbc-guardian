import { FsuContext } from "../core/FsuContext.js";
import { createAppRuntime } from "../core/AppRuntime.js";
import { finalizeBootstrap, runMidBootstrap } from "../core/BootstrapPipeline.js";
import { PatchRegistry } from "../core/PatchRegistry.js";
import { PatchLifecycleRegistry } from "../core/PatchLifecycleRegistry.js";
import { createSbcServices } from "../core/SbcServices.js";
import { attachBootstrapEvents } from "../core/BootstrapEvents.js";
import { createStartupFacades } from "../core/StartupFacades.js";

export function futweb() {
        var events = {}, html = {}, call = {}, pdb = {};
        const patchRegistry = new PatchRegistry();
        const sbcServices = createSbcServices();
        const runtime = createAppRuntime();
        const { info, ctx, store, httpClient, priceService, debug, cntlr, fy, eafy } = runtime;
        const patchLifecycle = new PatchLifecycleRegistry({
            onDiagnostic: (diagnostic) => debug.log("Patch lifecycle", diagnostic)
        });

        attachBootstrapEvents(events, { info, cntlr, isPhone, fy });

        const { set, build, lock, SBCCount, futbinId } = createStartupFacades(ctx, {
            events,
            isPhone,
            fy,
            priceService
        });

        const fsuCtx = new FsuContext({
            events, info, html, call, pdb, cntlr, fy, debug, ctx, store, httpClient, priceService,
            repositories, services, isPhone, set, build, lock, SBCCount, futbinId, eafy,
            SBCEligibilityKey, unsafeWindow, AssetLocationUtils, enums,
            GM_getValue, GM_setValue, GM_xmlhttpRequest, GM_openInTab, GM_info,
            patchLifecycle,
            ...sbcServices
        });

        runMidBootstrap({ fsuCtx, ctx, events, fy });
        finalizeBootstrap({ fsuCtx, patchRegistry, html, call });
        return fsuCtx;
}
