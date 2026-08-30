import { el, infoButton } from "./dom.js";

/**
 * Slide-in drawer of Guardian tools.
 * @param {{ t:(key:string,vars?:object)=>string, tools?: {id:string, label:string, description:string}[], onPick?:(id:string)=>void }} deps
 * @returns {HTMLElement}
 */
export function createGuardianToolsDrawer({ t, tools = [], onPick }) {
  const items = tools.map((tool) => {
    const button = /** @type {HTMLButtonElement} */ (
      el("button", {
        className: "guardian-tool-item",
        attrs: { type: "button", "data-tool": tool.id, title: tool.description }
      })
    );
    button.textContent = tool.label;
    button.addEventListener("click", () => onPick && onPick(tool.id));
    const itemInfo = infoButton(() => {}, tool.description);
    return el("div", { className: "guardian-tool-row", children: [button, itemInfo] });
  });
  return el("aside", {
    className: "guardian-tools-drawer",
    attrs: { role: "complementary", "aria-label": t("tools.label") },
    children: items
  });
}
