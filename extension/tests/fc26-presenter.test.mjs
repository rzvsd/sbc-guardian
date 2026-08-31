import assert from "assert/strict";
import { Fc26SolutionPresenter } from "../src/guardian/fc26/Fc26SolutionPresenter.js";

const result = new Fc26SolutionPresenter().present(
  { status: "SOLVED", selected: ["a"], solution_id: "s1", decision_id: "d1", rating_sum: 82 },
  { snapshot_hash: "h1", items: [{ id: "a", name: "A", rating: 82, special: false, duplicate: false, tradeable: true }] }
);
assert.equal(result.ratingSum, 82);
assert.equal(result.teamRating, null);
assert.equal(result.snapshotHash, "h1");
console.log("fc26-presenter: all assertions passed");
