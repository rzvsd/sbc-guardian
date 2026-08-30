import { el, infoButton } from "./dom.js";

/**
 * Review panel for a proposed solution (players, cost, rating, risk).
 * @param {{ t:(key:string,vars?:object)=>string, solution?:{players?:string[], cost?:string, rating?:string, risk?:string}, onAccept?:()=>void, onEdit?:()=>void }} deps
 * @returns {HTMLElement}
 */
export function createGuardianSolutionReview({ t, solution, onAccept, onEdit }) {
  const sol = solution || {};
  const lines = [];
  if (sol.players) {
    lines.push(el("li", { className: "guardian-review-players", text: sol.players.join(", ") }));
  }
  if (sol.cost) lines.push(el("li", { text: t("review.cost", { cost: sol.cost }) }));
  if (sol.rating) lines.push(el("li", { text: t("review.rating", { rating: sol.rating }) }));
  if (sol.risk) lines.push(el("li", { text: t("review.risk", { risk: sol.risk }) }));

  const accept = /** @type {HTMLButtonElement} */ (
    el("button", { className: "guardian-btn guardian-btn-primary", attrs: { type: "button" }, text: t("review.accept") })
  );
  accept.addEventListener("click", () => onAccept && onAccept());
  const edit = /** @type {HTMLButtonElement} */ (
    el("button", { className: "guardian-btn", attrs: { type: "button" }, text: t("review.edit") })
  );
  edit.addEventListener("click", () => onEdit && onEdit());
  const info = infoButton(() => {}, t("review.info"));

  return el("div", {
    className: "guardian-solution-review",
    attrs: { role: "region", "aria-label": t("review.label") },
    children: [info, el("ul", { className: "guardian-review-list", children: lines }), accept, edit]
  });
}
