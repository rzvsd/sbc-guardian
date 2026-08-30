import assert from "node:assert/strict";
import { CONTRACT_INDEX, loadSchema, loadFixture, validate } from "../../shared-contracts/contracts.js";

// Every golden fixture must validate against its contract schema.
for (const { schema, fixture } of CONTRACT_INDEX) {
  const value = loadFixture(fixture);
  const result = validate(value, loadSchema(schema));
  assert.ok(
    result.valid,
    `${schema} <- ${fixture} failed: ${JSON.stringify(result.errors)}`
  );
}
