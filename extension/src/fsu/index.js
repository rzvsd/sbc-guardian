import { futweb } from "./legacy/futweb.js";
import { applyFsuLodashMixins } from "./domain/lodashMixins.js";
import { mountGuardian } from "../guardian/index.js";

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
      // Keep confirmation safeguards active before FSU registers service owners.
      // The EA views own navigation; no cloud-solver dashboard is mounted.
      mountGuardian({
        window: this.windowRef,
        document: this.windowRef.document,
        nativeConfirm: this.windowRef.__guardianNativeConfirm
      });
      futweb();
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
