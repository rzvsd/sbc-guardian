import React, { useEffect, useState } from "react";

export default function ProductionApp({ runtimeAdapter }) {
  const [state, setState] = useState(() => runtimeAdapter?.getState?.() || { phase: "BOOTING" });
  const [tab, setTab] = useState("home");
  useEffect(() => runtimeAdapter?.subscribe?.(setState), [runtimeAdapter]);
  const ready = Boolean(runtimeAdapter && state);
  return (
    <div
      data-testid="guardian-production-overlay"
      style={{ pointerEvents: "none", minHeight: "100dvh" }}
    >
      <div
        style={{
          pointerEvents: "auto",
          margin: "16px",
          padding: "12px 16px",
          borderRadius: "12px",
          background: "rgba(9,9,11,.96)",
          color: "#f4f4f5",
          fontFamily: "Inter, sans-serif",
          fontSize: "13px"
        }}
      >
        <div style={{ marginBottom: "10px", fontWeight: 600 }}>SBC Guardian</div>
        <nav style={{ display: "flex", gap: "6px", marginBottom: "10px" }}>
          {["home", "ea", "protection", "profile"].map((name) => (
            <button key={name} type="button" style={{ pointerEvents: "auto" }} onClick={() => setTab(name)}>{name}</button>
          ))}
        </nav>
        {tab === "home" && <div>{ready ? `Status: ${state.phase || "ready"}` : "Connecting securely…"}</div>}
        {tab === "ea" && <div><div>EA FC remains visible below this overlay.</div><button type="button" onClick={() => runtimeAdapter.openEa?.()}>Open EA</button></div>}
        {tab === "protection" && <div><div>Protection is enforced by the server policy.</div><button type="button" onClick={() => runtimeAdapter.loadPolicy?.()}>Refresh policy</button></div>}
        {tab === "profile" && <div><div>Account and subscription are loaded from Guardian.</div><button type="button" onClick={() => runtimeAdapter.loadAccount?.()}>Refresh account</button></div>}
        {ready && state.phase === "SBC_DETECTED" && (
          <button type="button" style={{ marginLeft: "8px" }} onClick={() => runtimeAdapter.findSolution()}>
            Find solution
          </button>
        )}
        {ready && state.phase === "SOLUTION_READY" && (
          <button type="button" style={{ marginLeft: "8px" }} onClick={() => runtimeAdapter.applySolution()}>
            Apply (not submit)
          </button>
        )}
      </div>
    </div>
  );
}
