import {
  GuardianMutationFacade,
  getGuardian as getActiveGuardian,
  setGuardian
} from "./runtime.js";
import { createTranslator } from "./i18n/index.js";
import enMessages from "./i18n/en.json";
import roMessages from "./i18n/ro.json";
import { createGuardianActionConfirmation } from "./ui/GuardianActionConfirmation.js";
import { el } from "./ui/dom.js";
import { registerFsuMutations } from "./fsu/registerFsuMutations.js";
import tokensCss from "./ui/tokens.css";

export function getGuardian() {
  return getActiveGuardian();
}

export { installGuardianFc26Product } from "./GuardianSbcController.js";
export { installGuardianFc27Product } from "./GuardianSbcController.js";

/** @type {{ en: Record<string, string>, ro: Record<string, string> }} */
const MESSAGES = { en: enMessages, ro: roMessages };

/**
 * @param {string} [locale]
 * @returns {Record<string, string>}
 */
function pickMessages(locale) {
  const base = (locale || "en").slice(0, 2).toLowerCase();
  if (base === "ro") {
    return MESSAGES.ro;
  }
  return MESSAGES.en;
}

/** @param {string} [locale] */
export function getBundledGuardianMessages(locale) {
  return pickMessages(locale);
}

/**
 * @param {any} doc
 * @param {string} css
 */
function injectStyles(doc, css) {
  if (!doc || !doc.createElement) return;
  const style = doc.createElement("style");
  style.setAttribute("data-guardian", "tokens");
  style.textContent = css;
  const head = doc.head || (doc.body && doc.body.parentNode) || doc;
  (head.appendChild ? head : doc).appendChild(style);
}

/**
 * Mount Guardian into the FUT Web App document and create the Action Guard
 * facade. The facade captures all low-level mutation executors in private
 * closures; only `requestGuarded` is exposed publicly (window.__guardian),
 * which requires a UI confirmation step to emit a token.
 *
 * @param {{ window?: any, document?: any, ctx?: any, mutations?: Record<string, (payload: unknown, preview: object) => unknown>, sessionNonce?: string, locale?: string, onToolSelect?: (tool:string)=>void, nativeConfirm?: (preview:object)=>Promise<boolean> }} [options]
 * @returns {{ requestGuarded: (kind: string, payload: unknown) => Promise<any>, isRegistered: (kind: string) => boolean, getRegisteredKinds: () => string[] }}
 */
export function mountGuardian({ window, document, ctx, mutations, sessionNonce, locale, onToolSelect: _onToolSelect, nativeConfirm } = {}) {
  const w = window || (typeof globalThis !== "undefined" ? globalThis : undefined);
  const doc = document || (w && w.document);
  const nonce =
    sessionNonce ||
    "sess-" + (w && w.crypto && typeof w.crypto.randomUUID === "function" ? w.crypto.randomUUID() : String(Date.now()));

  injectStyles(doc, tokensCss);

  const messages = pickMessages(locale);
  const t = createTranslator(messages);
  const guardian = new GuardianMutationFacade({ sessionNonce: nonce, mutations: mutations || {} });
  setGuardian(guardian);

  if (ctx) {
    registerFsuMutations(ctx, guardian);
  }

  // The confirmation UI is the ONLY place that may call controls.approve();
  // controls is a private closure, never exposed on window.__guardian.
  guardian.defaultPreviewHandler = (preview, controls) => {
    if (!doc || !doc.body) {
      controls.dismiss();
      return;
    }
    if (nativeConfirm) {
      nativeConfirm(preview)
        .then((approved) => approved ? controls.approve() : controls.dismiss())
        .catch(() => showBrowserConfirmation());
      return;
    }
    return showBrowserConfirmation();

    function showBrowserConfirmation() {
      const dialog = createGuardianActionConfirmation({ t: /** @type {any} */ (t), preview: /** @type {any} */ (preview), controls });
    const overlay = /** @type {HTMLElement} */ (
      el("div", { className: "guardian-overlay", attrs: { "data-guardian-overlay": "true" }, children: [dialog] })
    );
    doc.body.appendChild(overlay);
      return () => {
        const disposableDialog = /** @type {any} */ (dialog);
        if (typeof disposableDialog.dispose === "function") disposableDialog.dispose();
        overlay.remove();
      };
    }
  };

  // Public surface is requestGuarded + read-only diagnostics ONLY. It must
  // NOT expose the facade, gate, mutable state, pending decisions, executors,
  // controls, or any registration surface. The third argument (options/onPreview)
  // is intentionally dropped: the confirmation UI is the ONLY path that may
  // approve, and it uses the internal defaultPreviewHandler, never an external
  // onPreview callback.
  /** @type {{ requestGuarded: (kind: string, payload: unknown) => Promise<any>, isRegistered: (kind: string) => boolean, getRegisteredKinds: () => string[] }} */
  const api = Object.freeze({
    requestGuarded: (kind, payload) => guardian.requestGuarded(kind, payload),
    isRegistered: (kind) => guardian.isRegistered(kind),
    getRegisteredKinds: () => guardian.getRegisteredKinds()
  });
  if (w) {
    w.__guardian = api;
  }
  return api;
}
