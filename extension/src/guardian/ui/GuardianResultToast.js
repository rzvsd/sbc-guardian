import { el } from "./dom.js";

/**
 * Transient result toast.
 * @param {{ t:(key:string,vars?:object)=>string, message:string, kind?: "success"|"error"|"info", onDismiss?:()=>void }} deps
 * @returns {HTMLElement}
 */
export function createGuardianResultToast({ t, message, kind = "info", onDismiss }) {
  const node = el("div", {
    className: "guardian-result-toast guardian-result-" + kind,
    attrs: { role: "status", "aria-live": "polite" },
    children: [el("span", { text: message })]
  });
  if (onDismiss) {
    const close = el("button", { className: "guardian-toast-close", attrs: { type: "button", "aria-label": t("toast.dismiss") } });
    close.textContent = "×";
    close.addEventListener("click", onDismiss);
    node.appendChild(close);
  }
  return node;
}
