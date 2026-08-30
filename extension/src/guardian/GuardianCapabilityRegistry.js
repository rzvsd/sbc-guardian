import { FEATURE_CAPABILITIES, getFeatureStatus } from "./features/FeatureRegistry.js";

export class GuardianCapabilityRegistry {
  constructor({ probeProvider = () => false, platform = "chrome" } = {}) {
    this.probeProvider = probeProvider;
    this.platform = platform;
  }

  snapshot() {
    const providerAvailable = this.probeProvider() === true;
    return Object.freeze(
      Object.fromEntries(
        Object.keys(FEATURE_CAPABILITIES).map((key) => [
          key,
          getFeatureStatus(key, { platform: this.platform, providerAvailable })
        ])
      )
    );
  }
}
