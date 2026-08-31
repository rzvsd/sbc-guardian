import { createFsuProductBindings, FsuSnapshotAdapter } from "./FsuSnapshotAdapter.js";
import { GuardianApiClient } from "./GuardianApiClient.js";
import { GuardianApplyController } from "./GuardianApplyController.js";
import { GuardianSolveFacade } from "./GuardianSolveFacade.js";
import { Fc26RequirementAdapter } from "./fc26/Fc26RequirementAdapter.js";
import { Fc26SolutionPresenter } from "./fc26/Fc26SolutionPresenter.js";
import { createTranslator } from "./i18n/index.js";
import { createGuardianSbcWorkspace } from "./ui/GuardianSbcWorkspace.js";
import { createGuardianSolutionReview } from "./ui/GuardianSolutionReview.js";
import { createGuardianWorkspace } from "./ui/GuardianWorkspace.js";
import { GuardianUiAdapter } from "./GuardianUiAdapter.js";

export class GuardianSbcController {
  /** @param {{solveFacade:any, applyController:any, render:(state:any)=>void}} config */
  constructor({ solveFacade, applyController, render }) {
    this.solveFacade = solveFacade;
    this.applyController = applyController;
    this.render = render;
    this.activeChallenge = null;
    this.solution = null;
    this.busy = false;
  }

  /** @param {any} challenge */
  attach(challenge) {
    this.activeChallenge = challenge;
    this.solution = null;
    this.render({ phase: "READY", challenge });
  }

  async solve() {
    if (this.busy || !this.activeChallenge) return;
    this.busy = true;
    this.render({ phase: "SOLVING", challenge: this.activeChallenge });
    try {
      this.solution = await this.solveFacade.solve(this.activeChallenge);
      this.render({ phase: this.solution.status, challenge: this.activeChallenge, solution: this.solution });
    } catch (error) {
      this.render({ phase: "ERROR", error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.busy = false;
    }
  }

  async apply() {
    if (this.busy || !this.solution || this.solution.status !== "SOLVED") return;
    this.busy = true;
    try {
      await this.applyController.apply(this.solution);
      this.render({ phase: "APPLIED_NOT_SUBMITTED", solution: this.solution });
    } catch (error) {
      this.render({ phase: "ERROR", error: error instanceof Error ? error.message : String(error) });
    } finally {
      this.busy = false;
    }
  }
}

/** @param {{document:Document, ctx:any, guardian:any, messages:Record<string,string>, apiTransport:(request:{url:string,method:string,body?:unknown,timeoutMs:number})=>Promise<{status:number,body:unknown}>}} config */
export function installGuardianFc26Product({ document, ctx, guardian, messages, apiTransport }) {
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
  const t = createTranslator(messages);
  const root = document.querySelector("[data-guardian-root='true']");

  /** @type {GuardianUiAdapter|null} */
  let uiAdapter = null;
  const render = (/** @type {any} */ state) => {
    uiAdapter?.publish(state);
    if (!root) return;
    root.querySelector(".guardian-workspace")?.remove();
    const children = [];
    if (state.phase === "READY") {
      const requirementText = (state.challenge.eligibilityRequirements || []).map((/** @type {any} */ requirement) =>
        ctx.events.requirementsToText(requirement)
      );
      children.push(
        createGuardianSbcWorkspace({
          t: /** @type {any} */ (t),
          challenge: { name: state.challenge.name, requirements: requirementText },
          onAnalyze: () => controller.solve(),
          onBuild: () => controller.solve()
        })
      );
    } else if (state.phase === "SOLVED") {
      children.push(
        createGuardianSolutionReview({
          t: /** @type {any} */ (t),
          solution: {
            players: state.solution.players.map((/** @type {any} */ player) => `${player.name} (${player.rating})`),
            rating: String(state.solution.rating),
            risk: state.solution.warnings.join("; ") || "No protected-item warnings"
          },
          onAccept: () => controller.apply(),
          onEdit: () => controller.attach(bindings.currentChallenge())
        })
      );
    } else {
      const message = document.createElement("p");
      message.textContent = state.error || state.phase;
      children.push(message);
    }
    root.appendChild(createGuardianWorkspace({ t: /** @type {any} */ (t), children }));
  };
  const controller = new GuardianSbcController({ solveFacade, applyController, render });
  uiAdapter = new GuardianUiAdapter({ controller });
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
