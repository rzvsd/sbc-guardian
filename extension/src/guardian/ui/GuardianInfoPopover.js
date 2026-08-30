import { el, infoPopoverContent } from "./dom.js";

/**
 * Popover that explains what an action does, what it consumes and what risk it carries.
 * @param {{ t:(key:string,vars?:object)=>string, message?:string, onClose?:()=>void }} deps
 * @returns {HTMLElement}
 */
export function createGuardianInfoPopover({ t, message, onClose }) {
  const card = infoPopoverContent(message || t("info.default"), () => onClose && onClose());
  return el("div", {
    className: "guardian-info-popover",
    attrs: { role: "dialog", "aria-label": t("info.label") },
    children: [card]
  });
}
