const previewState = {
  phase: "SBC_DETECTED",
  edition: "FC26",
  challenge: { name: "Preview SBC", edition: "FC26", squad_size: 11 },
  activity: [],
  policy: { version: 2, preset: "RECOMMENDED", protect_favorites: true, protect_active_squad: true, protect_special: true, protect_evolution_eligible: true },
  policyCapabilities: { protect_favorites: true, protect_active_squad: true, protect_special: true, protect_evolution_eligible: true },
  account: { name: "Preview account", role: "SUBSCRIBER" },
  access: { access_level: "FULL" }
};

export function createPreviewAdapter() {
  let state = structuredClone(previewState);
  const listeners = new Set();
  const publish = next => { state = { ...state, ...next }; listeners.forEach(listener => listener(state)); };
  return {
    getState: () => state,
    subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
    openEa: () => publish({ phase: "SBC_DETECTED" }),
    refreshClub: () => publish({ phase: "SBC_DETECTED" }),
    findSolution: async () => { publish({ phase: "SOLVING" }); await Promise.resolve(); publish({ phase: "SOLUTION_READY", solution: { edition: "FC26", team_rating: 83, chemistry: 24, selected_items: Array.from({ length: 11 }, (_, index) => ({ id: index + 1 })) } }); },
    applySolution: () => publish({ phase: "APPLIED_NOT_SUBMITTED" }),
    tryAlternative: () => publish({ phase: "SOLUTION_READY" }),
    discardSolution: () => publish({ phase: "EA_READY", solution: null }),
    loadPolicy: async () => state.policy,
    getLatestSnapshot: async () => ({ player_count: 2184, edition: "FC26", schema_version: 1 }),
    listSolutions: async () => [],
    loadHome: async () => { publish({ snapshot: { player_count: 2184, edition: "FC26", schema_version: 1 }, activity: [] }); return { snapshot: state.snapshot, activity: state.activity }; },
    updatePolicy: async policy => { publish({ policy }); return policy; },
    loadAccount: async () => ({ account: state.account, access: state.access }),
    signOut: () => publish({ phase: "SESSION_EXPIRED", account: null, access: null })
  };
}
