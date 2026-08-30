import { el } from "./dom.js";

/**
 * Left vertical rail with tool shortcuts. Contextual only (no standalone home).
 * @param {{ t: (key:string, vars?:object)=>string, onSelect?: (tool:string)=>void, tools?: string[] }} deps
 * @returns {HTMLElement}
 */
export function createGuardianRail({ t, onSelect, tools }) {
  const toolList = tools && tools.length ? tools : ["sbc", "squad", "filters", "tools"];
  const items = toolList.map((tool) => {
    const button = /** @type {HTMLButtonElement} */ (
      el("button", {
        className: "guardian-rail-item",
        attrs: { type: "button", "data-tool": tool, title: t("rail." + tool) }
      })
    );
    button.textContent = t("rail." + tool);
    button.addEventListener("click", () => onSelect && onSelect(tool));
    return button;
  });
  return el("nav", {
    className: "guardian-rail",
    attrs: { "aria-label": t("rail.label") },
    children: items
  });
}
