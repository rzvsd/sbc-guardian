import { el, infoButton } from "./dom.js";

/**
 * Bottom sheet with filters. Each filter row carries an explanatory "i" button.
 * @param {{ t:(key:string,vars?:object)=>string, filters?: {id:string, label:string, hint:string}[], onToggle?:(id:string, value:boolean)=>void, values?:Record<string,boolean> }} deps
 * @returns {HTMLElement}
 */
export function createGuardianFilterSheet({ t, filters = [], onToggle, values = {} }) {
  const rows = filters.map((filter) => {
    const checkbox = /** @type {HTMLInputElement} */ (
      el("input", { attrs: { type: "checkbox", "data-filter": filter.id } })
    );
    checkbox.checked = Boolean(values[filter.id]);
    checkbox.addEventListener("change", () => onToggle && onToggle(filter.id, checkbox.checked));
    const label = el("label", { className: "guardian-filter-label", text: filter.label });
    label.appendChild(checkbox);
    const hint = infoButton(() => {}, filter.hint);
    return el("div", { className: "guardian-filter-row", children: [label, hint] });
  });
  return el("div", {
    className: "guardian-filter-sheet",
    attrs: { role: "group", "aria-label": t("filters.label") },
    children: rows
  });
}
