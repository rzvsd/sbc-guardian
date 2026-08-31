import assert from "assert/strict";
import { requireStreamlinedSolveResponse } from "../src/guardian/GuardianContracts.js";

assert.equal(requireStreamlinedSolveResponse({ status: "INFEASIBLE", selected: [], edition: "FC27", ruleset_version: "v1" }).status, "INFEASIBLE");
assert.throws(() => requireStreamlinedSolveResponse({ status: "SOLVED", selected: ["x"], edition: "FC26", ruleset_version: "v1" }), /STREAMLINED/);
console.log("streamlined-contract: all assertions passed");
