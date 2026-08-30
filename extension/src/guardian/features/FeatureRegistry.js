/**
 * @type {Readonly<Record<string, { visible: boolean, defaultEnabled: boolean, providerRequired?: boolean, confirmationRequired?: boolean, geckoUnsupported?: boolean }>>}
 */
export const FEATURE_CAPABILITIES = Object.freeze({
  sbcEnhancer: { visible: true, defaultEnabled: true },
  squadBuilder: { visible: true, defaultEnabled: true },
  guardian: { visible: true, defaultEnabled: true },
  ratingTools: { visible: true, defaultEnabled: true },
  prices: { visible: true, defaultEnabled: true, providerRequired: true },
  marketActions: { visible: true, defaultEnabled: true, confirmationRequired: true },
  packTools: { visible: true, defaultEnabled: true, confirmationRequired: true },
  objectives: { visible: true, defaultEnabled: true },
  evolutions: { visible: true, defaultEnabled: true }
});

export const FEATURE_STATUSES = Object.freeze({
  AVAILABLE: "AVAILABLE",
  REQUIRES_CONFIRMATION: "REQUIRES_CONFIRMATION",
  PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE",
  UNSUPPORTED_ON_GECKO: "UNSUPPORTED_ON_GECKO",
  READ_ONLY: "READ_ONLY"
});

/**
 * Resolve the effective status of a feature given the runtime context.
 * @param {string} featureKey
 * @param {{ platform?: "chrome"|"gecko", providerAvailable?: boolean, readOnly?: boolean }} [ctx]
 * @returns {string|null} status or null if feature is unknown/hidden
 */
export function getFeatureStatus(featureKey, ctx = {}) {
  const def = FEATURE_CAPABILITIES[featureKey];
  if (!def || !def.visible) {
    return null;
  }
  if (ctx.platform === "gecko" && def.geckoUnsupported) {
    return FEATURE_STATUSES.UNSUPPORTED_ON_GECKO;
  }
  if (def.providerRequired && !ctx.providerAvailable) {
    return FEATURE_STATUSES.PROVIDER_UNAVAILABLE;
  }
  if (def.confirmationRequired) {
    return FEATURE_STATUSES.REQUIRES_CONFIRMATION;
  }
  if (ctx.readOnly) {
    return FEATURE_STATUSES.READ_ONLY;
  }
  return FEATURE_STATUSES.AVAILABLE;
}

/**
 * @param {string} featureKey
 * @returns {boolean}
 */
export function isFeatureEnabledByDefault(featureKey) {
  const def = FEATURE_CAPABILITIES[featureKey];
  return Boolean(def && def.visible && def.defaultEnabled);
}
