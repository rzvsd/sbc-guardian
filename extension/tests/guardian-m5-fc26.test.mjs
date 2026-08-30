import assert from "node:assert";

import { GuardianApiClient } from "../src/guardian/GuardianApiClient.js";
import { GuardianApplyController } from "../src/guardian/GuardianApplyController.js";
import { FsuSnapshotAdapter } from "../src/guardian/FsuSnapshotAdapter.js";
import { GuardianSolveFacade } from "../src/guardian/GuardianSolveFacade.js";
import { GuardianSbcController } from "../src/guardian/GuardianSbcController.js";
import { Fc26RequirementAdapter } from "../src/guardian/fc26/Fc26RequirementAdapter.js";
import { Fc26SolutionPresenter } from "../src/guardian/fc26/Fc26SolutionPresenter.js";
import { createGuardianRuntime } from "../src/guardian/runtime.js";

export async function runGuardianM5Fc26Tests() {
  const rawItems = [
    { id: 1, name: "One", rating: 84, locked: false, duplicate: true, tradeable: false },
    { id: 2, name: "Two", rating: 83, locked: false, tradeable: true }
  ];
  const snapshotAdapter = new FsuSnapshotAdapter({
    readClubItems: async () => ({ success: true, items: rawItems })
  });
  const snapshot = await snapshotAdapter.capture();
  assert.equal(snapshot.edition, "FC26");
  assert.equal(snapshot.player_count, 2);
  assert.match(snapshot.snapshot_hash, /^[a-f0-9]{64}$/);

  const chemistryRequirement = {
    getFirstKey: () => 2,
    getValue: () => [18]
  };
  const compiledChemistry = new Fc26RequirementAdapter({
    TEAM_RATING: 1,
    CHEMISTRY_POINTS: 2,
    PLAYER_MIN_OVR: 3,
    PLAYER_EXACT_OVR: 4
  }).compile({ id: 10, eligibilityRequirements: [chemistryRequirement] });
  assert.equal(compiledChemistry.request.segments[0].constraints.min_chemistry, 18);

  const calls = [];
  const api = {
    uploadSnapshot: async (value) => {
      calls.push(["snapshot", value.snapshot_hash]);
      return { id: "snap-1", snapshot_hash: value.snapshot_hash };
    },
    solveTraditional: async (body) => {
      calls.push(["solve", body.snapshot_id]);
      assert.equal(body.snapshot_hash, snapshot.snapshot_hash);
      return {
        status: "SOLVED",
        selected: ["1", "2"],
        rating_sum: 167,
        solution_id: "solution-1",
        decision_id: "decision-1"
      };
    }
  };
  const solveFacade = new GuardianSolveFacade({
    api,
    snapshotAdapter,
    requirementAdapter: new Fc26RequirementAdapter(),
    presenter: new Fc26SolutionPresenter()
  });
  const solution = await solveFacade.solve({ id: 9, segments: [{ constraints: { min_team_rating: 80 } }] });
  assert.deepEqual(calls.map((call) => call[0]), ["snapshot", "solve"]);
  assert.equal(solution.players[0].reasons[0], "duplicate preferred");

  const applied = [];
  const guardian = createGuardianRuntime({ sessionNonce: "m5", mutations: {} });
  guardian.defaultPreviewHandler = (_preview, controls) => controls.approve();
  const applyController = new GuardianApplyController({
    guardian,
    applySelected: async (ids) => applied.push(ids),
    captureSnapshot: async () => ({ snapshot_hash: solution.snapshotHash })
  });
  await applyController.apply(solution);
  assert.deepEqual(applied, [["1", "2"]]);
  assert.equal(guardian.isRegistered("SBC_SUBMIT"), false, "apply never submits implicitly");

  const staleApply = new GuardianApplyController({
    guardian: createGuardianRuntime({ sessionNonce: "stale", mutations: {} }),
    applySelected: async () => assert.fail("stale solution must never reach FSU apply"),
    captureSnapshot: async () => ({ snapshot_hash: "changed" })
  });
  await assert.rejects(() => staleApply.apply(solution), /GUARDIAN_STALE_SNAPSHOT/);

  const states = [];
  const controller = new GuardianSbcController({
    solveFacade,
    applyController,
    render: (state) => states.push(state.phase)
  });
  controller.attach({ id: 9, segments: [{ constraints: {} }] });
  await controller.solve();
  await controller.apply();
  assert.deepEqual(states, ["READY", "SOLVING", "SOLVED", "APPLIED_NOT_SUBMITTED"]);

  assert.throws(
    () => new Fc26RequirementAdapter().compile({ id: 1, segments: [] }),
    /GUARDIAN_MALFORMED_REQUIREMENTS/
  );
  const partial = new FsuSnapshotAdapter({ readClubItems: async () => ({ success: true, items: [] }) });
  await assert.rejects(() => partial.capture(), /GUARDIAN_PARTIAL_SNAPSHOT/);

  const invalidApi = new GuardianApiClient({
    baseUrl: "https://guardian.example",
    transport: async () => ({ status: 200, body: { status: "SOLVED", selected: [] } })
  });
  await assert.rejects(
    () => invalidApi.solveTraditional({ request: {}, snapshot_id: "s" }),
    /GUARDIAN_INVALID_SOLVE_RESPONSE/
  );

  console.log("guardian-m5-fc26: all assertions passed");
}
