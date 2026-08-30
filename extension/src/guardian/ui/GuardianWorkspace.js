import { el } from "./dom.js";

/**
 * Top-level Guardian workspace that hosts the contextual SBC surface.
 * @param {{ t: (key:string, vars?:object)=>string, children?: (Node|null)[] }} deps
 * @returns {HTMLElement}
 */
export function createGuardianWorkspace({ t, children = [] }) {
  const header = el("header", {
    className: "guardian-workspace-header",
    children: [el("span", { className: "guardian-brand", text: t("brand.name") })]
  });
  const body = el("section", {
    className: "guardian-workspace-body",
    attrs: { role: "region", "aria-label": t("workspace.label") },
    children
  });
  return el("div", { className: "guardian-workspace", children: [header, body] });
}
