import { futweb } from "./legacy/futweb.js";
import { mountReactGuardianOverlay } from "../guardian/reactOverlay.jsx";
import { applyFsuLodashMixins } from "./domain/lodashMixins.js";
import {
  getBundledGuardianMessages,
  getGuardian,
  installGuardianFc26Product,
  installGuardianFc27Product,
  mountGuardian
} from "../guardian/index.js";

class FsuUserscriptApp {
  constructor(windowRef, lodashRef) {
    this.windowRef = windowRef;
    this.lodashRef = lodashRef;
    this.href = windowRef.location.href;
  }

  run() {
    this.exposeLodash();
    applyFsuLodashMixins(this.lodashRef);

    if (this.isFutWebApp()) {
      // Guardian must exist before FSU creates any irreversible service owner.
      // Those owners register themselves through the internal module boundary
      // during futweb bootstrap; no mutable context is exposed on window.
      let product = null;
      mountGuardian({
        window: this.windowRef,
        document: this.windowRef.document,
        nativeConfirm: this.windowRef.__guardianNativeConfirm,
        onToolSelect: (tool) => product && product.open(tool)
      });
      const fsuCtx = futweb();
      const guardian = getGuardian();
      if (guardian) {
        const challengeEdition = String(fsuCtx?.cntlr?.current?.()?._challenge?.edition || "").toUpperCase();
        const install = challengeEdition === "FC27" ? installGuardianFc27Product : installGuardianFc26Product;
        product = install({
          document: this.windowRef.document,
          ctx: fsuCtx,
          guardian,
          apiTransport: this.windowRef.__guardianApiRequest,
          messages: getBundledGuardianMessages(this.windowRef.navigator?.language || "en")
        });
        mountReactGuardianOverlay({ document: this.windowRef.document, adapter: product.uiAdapter });
      }
    }
  }

  exposeLodash() {
    unsafeWindow._ = this.lodashRef;
  }

  isFutWebApp() {
    return this.lodashRef.includes(this.href, "ultimate-team/web-app");
  }
}

new FsuUserscriptApp(window, _).run();
