import assert from "node:assert";
import { createGuardianActionConfirmation } from "../src/guardian/ui/GuardianActionConfirmation.js";

// Runtime behavioral proof for finding #3: the Accept/Dismiss affordances must
// only fire on a REAL, user-generated (trusted) event. A page-world script doing
// `button.click()` dispatches an untrusted event (isTrusted === false) and must
// NOT mint a token or mutate anything.
//
// Execution-world boundary: Chrome MV3 content scripts run in an ISOLATED world,
// but the dialog DOM they inject lives in the page's (main-world) document. A
// page script CAN reach those nodes and call .click(); that synthetic event is
// untrusted, so the listener ignores it. Only a genuine user gesture (trusted)
// drives execution.

const allNodes = [];
function makeNode(tag) {
  const node = {
    tagName: tag,
    className: "",
    textContent: "",
    _listeners: {},
    children: [],
    style: {},
    _attrs: {},
    classList: {
      _s: new Set(),
      add(c) {
        this._s.add(c);
      },
      remove(c) {
        this._s.delete(c);
      },
      contains(c) {
        return this._s.has(c);
      }
    },
    setAttribute(k, v) {
      this._attrs[k] = v;
    },
    getAttribute(k) {
      return this._attrs[k];
    },
    appendChild(c) {
      this.children.push(c);
      return c;
    },
    removeChild(c) {
      this.children = this.children.filter((x) => x !== c);
    },
    remove() {},
    addEventListener(type, fn) {
      (this._listeners[type] = this._listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      if (this._listeners[type]) {
        this._listeners[type] = this._listeners[type].filter((f) => f !== fn);
      }
    },
    dispatch(type, ev) {
      (this._listeners[type] || []).forEach((fn) => fn(ev));
    }
  };
  allNodes.push(node);
  return node;
}

function findButton(root, match) {
  const stack = [root, ...root.children];
  while (stack.length) {
    const n = stack.pop();
    const cn = n && n.className;
    if (cn && (typeof match === "function" ? match(cn) : cn.includes(match))) return n;
    if (n && n.children) stack.push(...n.children);
  }
  return null;
}

const winListeners = {};
globalThis.window = {
  addEventListener(type, fn) {
    (winListeners[type] = winListeners[type] || []).push(fn);
  },
  removeEventListener(type, fn) {
    if (winListeners[type]) winListeners[type] = winListeners[type].filter((f) => f !== fn);
  },
  dispatch(type, ev) {
    (winListeners[type] || []).forEach((fn) => fn(ev));
  }
};
globalThis.document = {
  createElement: (t) => makeNode(t),
  head: makeNode("head"),
  body: makeNode("body")
};

const t = (key) => key;

function buildDialog() {
  const controls = { approve: () => {}, dismiss: () => {} };
  const approve = (controls.approve = track(controls.approve));
  const dismiss = (controls.dismiss = track(controls.dismiss));
  const preview = {
    summary: "Submit SBC",
    kind: "SBC_SUBMIT",
    irreversible: true,
    affectedItemIds: ["a", "b"]
  };
  const dialog = createGuardianActionConfirmation({ t, preview, controls });
  return { dialog, approve, dismiss };
}

function track(fn) {
  const wrapped = (...a) => {
    wrapped.calls++;
    return fn(...a);
  };
  wrapped.calls = 0;
  return wrapped;
}

{
  const { dialog, approve, dismiss } = buildDialog();
  const confirmBtn = findButton(dialog, (cn) => cn.includes("guardian-btn-danger"));
  const rejectBtn = findButton(dialog, (cn) => cn === "guardian-btn");

  // Programmatic / untrusted click => ZERO token, ZERO mutation.
  confirmBtn.dispatch("click", { isTrusted: false });
  assert.equal(approve.calls, 0, "untrusted Accept click => no token");
  assert.equal(dismiss.calls, 0, "untrusted Accept click => no dismiss");

  // Real user gesture (trusted) => exactly one token.
  confirmBtn.dispatch("click", { isTrusted: true });
  assert.equal(approve.calls, 1, "trusted Accept click => one token");

  // Untrusted reject must not dismiss either.
  dismiss.calls = 0;
  rejectBtn.dispatch("click", { isTrusted: false });
  assert.equal(dismiss.calls, 0, "untrusted Reject click => no dismiss");

  // Trusted reject dismisses.
  rejectBtn.dispatch("click", { isTrusted: true });
  assert.equal(dismiss.calls, 1, "trusted Reject click => dismiss");

  // Escape key: untrusted ignored, trusted dismisses.
  dismiss.calls = 0;
  window.dispatch("keydown", { key: "Escape", isTrusted: false });
  assert.equal(dismiss.calls, 0, "untrusted Escape => no dismiss");
  window.dispatch("keydown", { key: "Escape", isTrusted: true });
  assert.equal(dismiss.calls, 1, "trusted Escape => dismiss");
}

console.log("guardian-ui (trusted-event): all assertions passed");
