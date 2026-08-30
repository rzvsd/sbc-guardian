import { el, infoButton } from "./dom.js";

/**
 * First-run onboarding card. Explains Guardian is contextual inside EA Web App.
 * @param {{ t:(key:string,vars?:object)=>string, onDismiss?:()=>void }} deps
 * @returns {HTMLElement}
 */
export function createGuardianOnboarding({ t, onDismiss }) {
  const title = el("h2", { className: "guardian-onboarding-title", text: t("onboarding.title") });
  const body = el("p", { className: "guardian-onboarding-body", text: t("onboarding.body") });
  const info = infoButton(() => {}, t("onboarding.info"));
  const dismiss = /** @type {HTMLButtonElement} */ (
    el("button", { className: "guardian-btn guardian-btn-primary", attrs: { type: "button" }, text: t("onboarding.gotIt") })
  );
  dismiss.addEventListener("click", () => onDismiss && onDismiss());
  return el("div", {
    className: "guardian-onboarding",
    attrs: { role: "dialog", "aria-label": t("onboarding.label") },
    children: [info, title, body, dismiss]
  });
}
