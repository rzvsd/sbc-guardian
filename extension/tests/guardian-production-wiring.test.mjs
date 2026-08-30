import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGuardianRuntime, setGuardian } from "../src/guardian/runtime.js";
import { registerGuardianServiceOwner } from "../src/guardian/fsu/registerServiceOwner.js";
import { MarketActionService } from "../src/fsu/domain/MarketActionService.js";
import { SbcSubmitTransactionService } from "../src/fsu/domain/SbcSubmitTransactionService.js";
import { StorePackOpenTransactionService } from "../src/fsu/domain/StorePackOpenTransactionService.js";
import { BulkPackOpenService } from "../src/fsu/domain/BulkPackOpenService.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export async function runGuardianProductionWiringTests() {
const entry = fs.readFileSync(path.join(root, "src/fsu/index.js"), "utf8");
assert.equal(entry.includes("__fsuContext"), false, "production bootstrap must not depend on an unassigned window context");
assert.ok(entry.indexOf("mountGuardian(") < entry.indexOf("futweb();"), "Guardian mounts before service owners are created");

const guardian = createGuardianRuntime({ sessionNonce: "production-wiring", mutations: {} });
setGuardian(guardian);
guardian.defaultPreviewHandler = (_preview, controls) => controls.approve();

const calls = [];
const market = new MarketActionService();
market._buyPlayerImpl = (player) => calls.push(["buy", Number(player)]);
market._playerToAuctionImpl = (item, price, duration) => calls.push(["list", item.id, price, duration]);

const noopObservable = {
  observe() {
    return this;
  },
  unobserve() {}
};
const sbc = new SbcSubmitTransactionService();
sbc._interceptImpl = (options) => {
  calls.push(["sbc", options.args[0].id]);
  return noopObservable;
};

const store = new StorePackOpenTransactionService({
  adapter: {
    prepare: () => ({ success: true, data: { tracked: true, key: "store-1", packId: 7, initialCount: 1 } })
  }
});
store._interceptImpl = (_options, dto) => calls.push(["store", dto.packId]);

const bulk = new BulkPackOpenService({ adapter: {} });
bulk._runImpl = ({ packId, count }) => calls.push(["bulk", packId, count]);

registerGuardianServiceOwner("market", market);
registerGuardianServiceOwner("sbc", sbc);
registerGuardianServiceOwner("store", store);
registerGuardianServiceOwner("bulk", bulk);
registerGuardianServiceOwner("market", market); // same-owner idempotency
assert.throws(
  () => registerGuardianServiceOwner("market", new MarketActionService()),
  /GUARDIAN_OWNER_CONFLICT:market/,
  "a second production owner cannot silently replace or orphan the first"
);

assert.deepEqual(
  guardian.getRegisteredKinds().sort(),
  ["MARKET_BUY", "MARKET_LIST", "PACK_OPEN", "PACK_OPEN_BULK", "SBC_SUBMIT"].sort(),
  "production owners register exactly the real routed capabilities"
);

const marketHelpers = { getCachePrice: () => ({ num: 1_500 }) };
await market.buyPlayer(11, null, marketHelpers);
await market.playerToAuction({ id: 12 }, 1_000, 1, marketHelpers);
await sbc.intercept({ args: [{ id: 13 }], observerContext: {}, invoke() {}, onSuccess() {} });
await store.intercept({ controller: {}, args: [], invoke() {}, onSuccess() {} });
await bulk.run({ packId: 14, count: 2, context: {} });

assert.deepEqual(calls, [
  ["buy", 11],
  ["list", 12, 1_000, 1],
  ["sbc", 13],
  ["store", 7],
  ["bulk", 14, 2]
]);

setGuardian(null);
console.log("guardian-production-wiring: all assertions passed");
}
