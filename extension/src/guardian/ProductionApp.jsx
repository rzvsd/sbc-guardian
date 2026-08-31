import React, { useEffect, useState } from "react";

export default function ProductionApp({ runtimeAdapter }) {
  const [state, setState] = useState(() => runtimeAdapter?.getState?.() || { phase: "BOOTING" });
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
        {ready ? `Guardian connected: ${state.phase || "ready"}` : "Guardian is connecting securely…"}
        {ready && state.phase === "SBC_DETECTED" && (
          <button type="button" style={{ marginLeft: "8px" }} onClick={() => runtimeAdapter.findSolution()}>
            Find solution
          </button>
        )}
      </div>
    </div>
  );
}
