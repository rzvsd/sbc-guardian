import { el, infoButton } from "./dom.js";

/**
 * SBC-specific workspace: shows requirements + warnings + build controls.
 * @param {{ t:(key:string,vars?:object)=>string, challenge?:{name?:string, requirements?:string[]}, onBuild?:()=>void, onAnalyze?:()=>void }} deps
 * @returns {HTMLElement}
 */
export function createGuardianSbcWorkspace({ t, challenge, onBuild, onAnalyze }) {
  const title = el("h2", {
    className: "guardian-sbc-title",
    text: challenge && challenge.name ? challenge.name : t("sbc.untitled")
  });

  const reqs = (challenge && challenge.requirements ? challenge.requirements : []).map((r) =>
    el("li", { className: "guardian-sbc-req", text: r })
  );
  const reqList = el("ul", { className: "guardian-sbc-reqs", children: reqs });

  const analyzeBtn = /** @type {HTMLButtonElement} */ (
    el("button", { className: "guardian-btn", attrs: { type: "button" }, text: t("sbc.analyze") })
  );
  analyzeBtn.addEventListener("click", () => onAnalyze && onAnalyze());

  const buildBtn = /** @type {HTMLButtonElement} */ (
    el("button", { className: "guardian-btn guardian-btn-primary", attrs: { type: "button" }, text: t("sbc.build") })
  );
  buildBtn.addEventListener("click", () => onBuild && onBuild());

  const info = infoButton(
    () => {},
    t("sbc.info")
  );

  return el("section", {
    className: "guardian-sbc-workspace",
    attrs: { role: "region", "aria-label": t("sbc.label") },
    children: [title, info, reqList, analyzeBtn, buildBtn]
  });
}
