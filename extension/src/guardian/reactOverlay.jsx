import React from "react";
import { createRoot } from "react-dom/client";
import ProductionApp from "./ProductionApp.jsx";
import guardianCss from "guardian-ui-css";

const HOST_SELECTOR = "[data-guardian-react-root='true']";

function safeUnavailableAdapter() {
  return null;
}

export function mountReactGuardianOverlay({ document: documentRef, adapter = null } = {}) {
  if (!documentRef || !documentRef.body) return null;
  const existing = documentRef.querySelector(HOST_SELECTOR);
  if (existing) return existing;

  const host = documentRef.createElement("div");
  host.dataset.guardianReactRoot = "true";
  host.style.position = "fixed";
  host.style.inset = "0";
  host.style.zIndex = "2147483000";
  host.style.pointerEvents = "none";
  documentRef.body.appendChild(host);

  const shadow = host.attachShadow?.({ mode: "open" });
  if (!shadow) {
    host.remove();
    return null;
  }
  const style = documentRef.createElement("style");
  style.textContent = guardianCss;
  shadow.appendChild(style);
  const mountPoint = documentRef.createElement("div");
  mountPoint.style.pointerEvents = "none";
  shadow.appendChild(mountPoint);
  createRoot(mountPoint).render(<ProductionApp runtimeAdapter={adapter || safeUnavailableAdapter()} />);
  return host;
}
