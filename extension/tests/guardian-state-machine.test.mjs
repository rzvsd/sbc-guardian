import assert from "node:assert/strict";
import { GuardianStateMachine, GUARDIAN_STATES } from "../src/guardian/state/GuardianStateMachine.js";

// valid transitions
{
  const sm = new GuardianStateMachine(GUARDIAN_STATES.BOOTING);
  sm.transition(GUARDIAN_STATES.EA_READY);
  sm.transition(GUARDIAN_STATES.SBC_CONTEXT_FOUND);
  sm.transition(GUARDIAN_STATES.ANALYZING);
  sm.transition(GUARDIAN_STATES.SOLUTION_READY);
  sm.transition(GUARDIAN_STATES.ACTION_CONFIRMATION);
  sm.transition(GUARDIAN_STATES.ACTION_RUNNING);
  sm.transition(GUARDIAN_STATES.ACTION_SUCCESS);
  assert.equal(sm.state, GUARDIAN_STATES.ACTION_SUCCESS);
}

// invalid transition rejected
{
  const sm = new GuardianStateMachine(GUARDIAN_STATES.BOOTING);
  assert.throws(() => sm.transition(GUARDIAN_STATES.ACTION_SUCCESS), /INVALID_TRANSITION/);
  assert.throws(() => sm.transition(GUARDIAN_STATES.SOLUTION_READY), /INVALID_TRANSITION/);
}

// canTransition guard
{
  const sm = new GuardianStateMachine(GUARDIAN_STATES.ACTION_REJECTED);
  assert.equal(sm.canTransition(GUARDIAN_STATES.REVIEW_REQUIRED), true);
  assert.equal(sm.canTransition(GUARDIAN_STATES.BOOTING), false);
}

// reset
{
  const sm = new GuardianStateMachine(GUARDIAN_STATES.ERROR);
  sm.reset();
  assert.equal(sm.state, GUARDIAN_STATES.BOOTING);
}

// unknown initial state rejected
assert.throws(() => new GuardianStateMachine("NOT_A_STATE"), /unknown state/);
