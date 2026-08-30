import { el, infoButton } from "./dom.js";

/**
 * Error panel shown on ERROR state. Never leaks secrets; message is localized text only.
 * @param {{ t:(key:string,vars?:object)=>string, code?:string, onRetry?:()=>void }} deps
 * @returns {HTMLElement}
 */
export function createGuardianErrorPanel({ t, code, onRetry }) {
  const title = el("h2", { className: "guardian-error-title", text: t("error.title") });
  const message = el("p", {
    className: "guardian-error-message",
    text: code ? t("error.withCode", { code }) : t("error.generic")
  });
  const info = infoButton(() => {}, t("error.info"));
  const retry = /** @type {HTMLButtonElement} */ (
    el("button", { className: "guardian-btn", attrs: { type: "button" }, text: t("error.retry") })
  );
  retry.addEventListener("click", () => onRetry && onRetry());
  return el("div", {
    className: "guardian-error-panel",
    attrs: { role: "alert", "aria-label": t("error.label") },
    children: [info, title, message, retry]
  });
}
