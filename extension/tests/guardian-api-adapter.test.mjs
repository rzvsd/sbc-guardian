import assert from "assert/strict";
import { GuardianUiAdapter } from "../src/guardian/GuardianUiAdapter.js";

const calls = [];
const api = {
  getPolicy: async () => { calls.push("policy"); return { version: 2 }; },
  putPolicy: async (body) => { calls.push(["put", body]); return body; },
  getAccount: async () => { calls.push("account"); return { id: "a" }; },
  getAccess: async () => { calls.push("access"); return { access_level: "FULL" }; },
  signOut: async () => { calls.push("logout"); return {}; }
};
const adapter = new GuardianUiAdapter({ api });
assert.deepEqual(await adapter.loadPolicy(), { version: 2 });
assert.deepEqual(await adapter.loadAccount(), [{ id: "a" }, { access_level: "FULL" }]);
await adapter.updatePolicy({ version: 2 });
await adapter.signOut();
assert.deepEqual(calls, ["policy", "account", "access", ["put", { version: 2 }], "logout"]);
console.log("guardian-api-adapter: all assertions passed");
