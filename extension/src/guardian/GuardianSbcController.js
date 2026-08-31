import { createFsuProductBindings, FsuSnapshotAdapter } from "./FsuSnapshotAdapter.js";
import { GuardianApiClient } from "./GuardianApiClient.js";
import { GuardianApplyController } from "./GuardianApplyController.js";
import { GuardianSolveFacade } from "./GuardianSolveFacade.js";
import { Fc26RequirementAdapter } from "./fc26/Fc26RequirementAdapter.js";
import { Fc26SolutionPresenter } from "./fc26/Fc26SolutionPresenter.js";
import { GuardianUiAdapter } from "./GuardianUiAdapter.js";
import { Fc27SnapshotAdapter } from "./Fc27SnapshotAdapter.js";
import { Fc27SolveFacade } from "./Fc27SolveFacade.js";
import { SubmitReconciler } from "./SubmitReconciler.js";

export class GuardianSbcController {
  /** @param {{solveFacade:any, applyController:any, render:(state:any)=>void}} config */
  constructor({ solveFacade, applyController, render }) {
    this.solveFacade = solveFacade;
    this.applyController = applyController;
    this.render = render;
    this.activeChallenge = null;
    this.solution = null;
    this.busy = false;
    this.generation = 0;
  }

  /** @param {any} challenge */
  attach(challenge) {
    this.generation += 1;
    this.activeChallenge = challenge;
    this.solution = null;
    this.render({ phase: "READY", challenge });
  }

  async solve() {
    if (this.busy || !this.activeChallenge) return;
    const generation = this.generation;
    this.busy = true;
    this.render({ phase: "SOLVING", challenge: this.activeChallenge });
    try {
      this.solution = await this.solveFacade.solve(this.activeChallenge);
      if (generation !== this.generation) return;
      this.render({ phase: this.solution.status, challenge: this.activeChallenge, solution: this.solution });
    } catch (error) {
      if (generation !== this.generation) return;
      this.render({ phase: "ERROR", error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.busy = false;
    }
  }

  async apply() {
    if (this.busy || !this.solution || this.solution.status !== "SOLVED") return;
    const generation = this.generation;
    this.busy = true;
    try {
      await this.applyController.apply(this.solution);
      if (generation !== this.generation) return;
      this.render({ phase: "APPLIED_NOT_SUBMITTED", solution: this.solution });
    } catch (error) {
      if (generation !== this.generation) return;
      this.render({ phase: "ERROR", error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.busy = false;
    }
  }

  async tryAlternative() {
    if (this.busy || !this.solution || typeof this.solveFacade.tryAlternative !== "function") {
      throw new Error("ALTERNATIVE_NOT_AVAILABLE");
    }
    const generation = this.generation;
    this.busy = true;
    this.render({ phase: "SOLVING", challenge: this.activeChallenge });
    try {
      this.solution = await this.solveFacade.tryAlternative(this.activeChallenge, this.solution);
      if (generation !== this.generation) return;
      this.render({ phase: this.solution.status, challenge: this.activeChallenge, solution: this.solution });
    } catch (error) {
      if (generation !== this.generation) return;
      this.render({ phase: "ERROR", error: error instanceof Error ? error.message : String(error) });
      throw error;
    } finally {
      this.busy = false;
    }
  }
}

/** @param {{document:Document, ctx:any, guardian:any, messages:Record<string,string>, apiTransport:(request:{url:string,method:string,body?:unknown,timeoutMs:number})=>Promise<{status:number,body:unknown}>}} config */
export function installGuardianFc26Product({ ctx, guardian, apiTransport }) {
  const bindings = createFsuProductBindings(ctx);
  const snapshotAdapter = new FsuSnapshotAdapter({ readClubItems: bindings.readClubItems });
  const api = new GuardianApiClient({
    baseUrl: "https://sbc-guardian.duckdns.org",
    transport: apiTransport
  });
  const solveFacade = new GuardianSolveFacade({
    api,
    snapshotAdapter,
    requirementAdapter: new Fc26RequirementAdapter(ctx.SBCEligibilityKey),
    presenter: new Fc26SolutionPresenter()
  });
  const applyController = new GuardianApplyController({
    guardian,
    applySelected: bindings.applySelected,
    captureSnapshot: () => snapshotAdapter.capture()
  });
  const reconciler = new SubmitReconciler({
    guardedSubmit: bindings.submitCurrentChallenge,
    confirmBackend: (solutionId, decisionId) => api.confirmSolution(solutionId, decisionId),
    store: ctx?.unsafeWindow?.localStorage || null
  });
  /** @type {GuardianUiAdapter|null} */
  let uiAdapter = null;
  const render = (/** @type {any} */ state) => {
    uiAdapter?.publish(state);
  };
  const controller = new GuardianSbcController({ solveFacade, applyController, render });
  uiAdapter = new GuardianUiAdapter({
    controller,
    api,
    reconciler,
    openEa: () => ctx?.unsafeWindow?.focus?.(),
    refreshClub: async () => {
      const snapshot = await snapshotAdapter.capture();
      const summary = {
        edition: snapshot.edition,
        schema_version: snapshot.schema_version,
        snapshot_hash: snapshot.snapshot_hash,
        player_count: snapshot.player_count
      };
      uiAdapter?.publish({ ...(uiAdapter?.getState() || {}), snapshot: summary, localSnapshot: snapshot });
      return summary;
    }
  });
  return {
    open(/** @type {string} */ tool) {
      if (tool !== "sbc") return;
      const challenge = bindings.currentChallenge();
      if (!challenge) render({ phase: "ERROR", error: "Open an FC26 SBC challenge first." });
      else controller.attach(challenge);
    },
    controller,
    uiAdapter
  };
}

/** @param {{ctx:any, guardian:any, apiTransport:any}} config */
export function installGuardianFc27Product({ ctx, guardian, apiTransport }) {
  const bindings = createFsuProductBindings(ctx);
  const snapshotAdapter = new Fc27SnapshotAdapter({ readClubItems: bindings.readClubItems });
  const api = new GuardianApiClient({ baseUrl: "https://sbc-guardian.duckdns.org", transport: apiTransport });
  const facade = new Fc27SolveFacade({ api, snapshotAdapter });
  const applyController = new GuardianApplyController({ guardian, applySelected: bindings.applySelected, captureSnapshot: () => snapshotAdapter.capture() });
  const reconciler = new SubmitReconciler({
    guardedSubmit: bindings.submitCurrentChallenge,
    confirmBackend: (solutionId, decisionId) => api.confirmSolution(solutionId, decisionId),
    store: ctx?.unsafeWindow?.localStorage || null
  });
  const controller = new GuardianSbcController({
    solveFacade: {
      solve: (/** @type {any} */ challenge) => facade.solve(Number(challenge.target_count || 11), String(challenge.ruleset_version || "")),
      tryAlternative: (/** @type {any} */ challenge, /** @type {{solutionId?:string}} */ previous) => facade.tryAlternative(Number(challenge.target_count || 11), String(challenge.ruleset_version || ""), String(previous.solutionId || "")),
    },
    applyController,
    render: () => {}
  });
  const adapter = new GuardianUiAdapter({
    controller,
    api,
    reconciler,
    openEa: () => ctx?.unsafeWindow?.focus?.(),
    refreshClub: async () => {
      const snapshot = await snapshotAdapter.capture();
      const summary = {
        edition: snapshot.edition,
        schema_version: snapshot.schema_version,
        snapshot_hash: snapshot.snapshot_hash,
        player_count: snapshot.player_count
      };
      adapter.publish({ ...adapter.getState(), snapshot: summary, localSnapshot: snapshot });
      return summary;
    }
  });
  controller.render = (state) => adapter.publish(state);
  return {
    open(/** @type {string} */ tool) {
      if (tool !== "sbc") return;
      const challenge = bindings.currentChallenge();
      if (!challenge || String(challenge.edition || "").toUpperCase() !== "FC27") throw new Error("FC27_CHALLENGE_REQUIRED");
      controller.attach(challenge);
    },
    controller,
    uiAdapter: adapter,
  };
}
