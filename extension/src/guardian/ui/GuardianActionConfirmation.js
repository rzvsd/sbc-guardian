import { el, infoButton } from "./dom.js";

/**
 * Explicit confirmation modal. The ONLY affordance that triggers execution.
 * Accept calls controls.approve() (which mints the token + executes); Cancel,
 * close or Escape calls controls.dismiss() (zero tokens, zero mutation).
 *
 * @param {{
 *   t: (key:string, vars?:object) => string,
 *   preview: { summary:string, kind:string, irreversible:boolean, affectedItemIds?:string[], costRisk?:string },
 *   controls: { approve: () => void, dismiss: () => void }
 * }} deps
 * @returns {HTMLElement}
 */
export function createGuardianActionConfirmation({ t, preview, controls }) {
  const summary = el("p", { className: "guardian-confirm-summary", text: preview.summary });
  const kind = el("p", {
    className: "guardian-confirm-kind",
    text: t("confirm.kind", { kind: preview.kind })
  });
  const risk = el("p", {
    className: "guardian-confirm-risk",
    text: preview.irreversible ? t("confirm.irreversible") : t("confirm.reversible")
  });

  const items = (preview.affectedItemIds || []).map((id) =>
    el("li", { className: "guardian-confirm-item", text: String(id) })
  );
  const affected = el("ul", { className: "guardian-confirm-items", children: items });
  const info = infoButton(() => {}, t("confirm.info"));

  const costRisk = preview.costRisk
    ? el("p", { className: "guardian-confirm-cost", text: preview.costRisk })
    : null;

  const dialog = el("div", {
    className: "guardian-action-confirmation",
    attrs: { role: "alertdialog", "aria-modal": "true", "aria-label": t("confirm.label") },
    children: [info, summary, kind, risk, ...(costRisk ? [costRisk] : []), affected]
  });

  const reject = /** @type {HTMLButtonElement} */ (
    el("button", { className: "guardian-btn", attrs: { type: "button" }, text: t("confirm.reject") })
  );
  // Only a real, user-generated (trusted) event may drive the dialog. A
  // programmatic .click() from page-world script has isTrusted === false and is
  // ignored, so the page cannot mint a token or dismiss the dialog on its own.
  reject.addEventListener("click", (/** @type {MouseEvent} */ ev) => {
    if (!ev || ev.isTrusted !== true) return;
    controls.dismiss();
  });

  const confirm = /** @type {HTMLButtonElement} */ (
    el("button", {
      className: "guardian-btn guardian-btn-danger",
      attrs: { type: "button", "aria-label": t("confirm.confirmAria") },
      text: t("confirm.confirm")
    })
  );
  confirm.addEventListener("click", (/** @type {MouseEvent} */ ev) => {
    if (!ev || ev.isTrusted !== true) return;
    controls.approve();
  });

  dialog.appendChild(reject);
  dialog.appendChild(confirm);

  const onKey = /** @param {KeyboardEvent} ev */ (ev) => {
    if (ev.key === "Escape") {
      if (!ev || ev.isTrusted !== true) return;
      window.removeEventListener("keydown", onKey);
      controls.dismiss();
    }
  };
  window.addEventListener("keydown", onKey);
  /** @type {any} */ (dialog).dispose = () => window.removeEventListener("keydown", onKey);

  return dialog;
}
