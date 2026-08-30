export const GUARDIAN_STATES = Object.freeze({
  BOOTING: "BOOTING",
  EA_LOGIN_REQUIRED: "EA_LOGIN_REQUIRED",
  EA_READY: "EA_READY",
  SBC_CONTEXT_FOUND: "SBC_CONTEXT_FOUND",
  ANALYZING: "ANALYZING",
  REVIEW_REQUIRED: "REVIEW_REQUIRED",
  BUILDING: "BUILDING",
  SOLUTION_READY: "SOLUTION_READY",
  ACTION_CONFIRMATION: "ACTION_CONFIRMATION",
  ACTION_RUNNING: "ACTION_RUNNING",
  ACTION_SUCCESS: "ACTION_SUCCESS",
  ACTION_REJECTED: "ACTION_REJECTED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  ERROR: "ERROR"
});

/** @type {Readonly<Record<string, string[]>>} */
const TRANSITIONS = Object.freeze({
  BOOTING: ["EA_LOGIN_REQUIRED", "EA_READY", "ERROR"],
  EA_LOGIN_REQUIRED: ["EA_READY", "ERROR", "SESSION_EXPIRED"],
  EA_READY: ["SBC_CONTEXT_FOUND", "EA_LOGIN_REQUIRED", "ERROR"],
  SBC_CONTEXT_FOUND: ["ANALYZING", "EA_READY", "ERROR"],
  ANALYZING: ["REVIEW_REQUIRED", "SOLUTION_READY", "ERROR"],
  REVIEW_REQUIRED: ["BUILDING", "SOLUTION_READY", "ACTION_REJECTED", "ERROR"],
  BUILDING: ["SOLUTION_READY", "REVIEW_REQUIRED", "ERROR"],
  SOLUTION_READY: ["ACTION_CONFIRMATION", "REVIEW_REQUIRED", "ERROR"],
  ACTION_CONFIRMATION: ["ACTION_RUNNING", "ACTION_REJECTED", "ERROR"],
  ACTION_RUNNING: ["ACTION_SUCCESS", "ACTION_REJECTED", "ERROR"],
  ACTION_SUCCESS: ["EA_READY", "SBC_CONTEXT_FOUND", "ERROR"],
  ACTION_REJECTED: ["EA_READY", "SBC_CONTEXT_FOUND", "REVIEW_REQUIRED", "ERROR"],
  SESSION_EXPIRED: ["EA_LOGIN_REQUIRED", "ERROR"],
  ERROR: ["BOOTING", "EA_READY", "ERROR"]
});

export class GuardianStateMachine {
  /** @param {string} [initial] */
  constructor(initial = GUARDIAN_STATES.BOOTING) {
    if (!(initial in TRANSITIONS)) {
      throw new Error("unknown state: " + String(initial));
    }
    /** @type {string} */
    this.state = initial;
    /** @type {string[]} */
    this.history = [initial];
  }

  /**
   * @param {string} to
   * @returns {boolean}
   */
  canTransition(to) {
    if (!(to in TRANSITIONS)) {
      return false;
    }
    const allowed = TRANSITIONS[this.state];
    return !!allowed && allowed.includes(to);
  }

  /**
   * @param {string} to
   * @returns {string}
   */
  transition(to) {
    if (!this.canTransition(to)) {
      throw new Error("INVALID_TRANSITION:" + this.state + "->" + to);
    }
    this.state = to;
    this.history.push(to);
    return to;
  }

  reset() {
    this.state = GUARDIAN_STATES.BOOTING;
    this.history = [GUARDIAN_STATES.BOOTING];
  }
}
