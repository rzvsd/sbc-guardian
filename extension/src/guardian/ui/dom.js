/**
 * Safe DOM builder. Never uses innerHTML with dynamic data; remote/unknown
 * values always go through textContent. Extension-owned constant markup is the
 * only thing allowed into innerHTML, and only via createTrustedMarkup elsewhere.
 */

/**
 * @param {string} tag
 * @param {{
 *   text?: string,
 *   className?: string,
 *   attrs?: Record<string, string|number|boolean|null|undefined>,
 *   children?: (Node|null|undefined)[]
 * }} [opts]
 * @returns {HTMLElement}
 */
export function el(tag, opts = {}) {
  const node = document.createElement(tag);
  if (opts.className) {
    node.className = opts.className;
  }
  if (opts.text != null) {
    node.textContent = String(opts.text);
  }
  if (opts.attrs) {
    for (const [key, value] of Object.entries(opts.attrs)) {
      if (value == null || value === false) {
        continue;
      }
      node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  if (opts.children) {
    for (const child of opts.children) {
      if (child) {
        node.appendChild(child);
      }
    }
  }
  return node;
}

/**
 * The required "i" info button on every important action.
 * @param {(event: MouseEvent) => void} onClick
 * @param {string} [label]
 * @returns {HTMLButtonElement}
 */
export function infoButton(onClick, label = "More information") {
  const button = /** @type {HTMLButtonElement} */ (
    el("button", {
      className: "guardian-info-btn",
      attrs: { type: "button", "aria-label": label, title: label }
    })
  );
  button.textContent = "i";
  button.addEventListener("click", onClick);
  return button;
}

/**
 * @param {string} message
 * @param {(event: MouseEvent) => void} onClose
 * @returns {HTMLElement}
 */
export function infoPopoverContent(message, onClose) {
  const close = el("button", {
    className: "guardian-popover-close",
    attrs: { type: "button", "aria-label": "Close" }
  });
  close.textContent = "×";
  close.addEventListener("click", onClose);
  return el("div", {
    className: "guardian-popover-card",
    children: [
      el("p", { className: "guardian-popover-text", text: message }),
      close
    ]
  });
}
