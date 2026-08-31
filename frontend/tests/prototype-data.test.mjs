import assert from "node:assert/strict";
import test from "node:test";

import { SOLUTION } from "../src/mock/data.js";

test("prototype solution has one unique item per squad slot", () => {
  assert.equal(SOLUTION.players.length, 11);
  assert.equal(new Set(SOLUTION.players.map((player) => player.id)).size, 11);
});
