import assert from "node:assert";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { loadBackground } = require("./load-background.cjs");
const background = loadBackground(root);

export async function runGuardianIsolatedTransportTests() {
  const policy = new background.GuardianRequestPolicy();
  assert.equal(
    policy.authorize({
      url: "https://sbc-guardian.duckdns.org/api/v2/snapshots",
      method: "POST",
      body: { edition: "FC26" }
    }).method,
    "POST"
  );
  assert.throws(
    () => policy.authorize({ url: "https://sbc-guardian.duckdns.org/api/v2/account", method: "DELETE" }),
    (error) => error.name === "SecurityError"
  );
  assert.throws(
    () => policy.authorize({ url: "https://sbc-guardian.duckdns.org/api/v2/snapshots?account=other", method: "POST" }),
    (error) => error.name === "SecurityError"
  );

  let capturedOptions;
  const service = new background.GuardianRequestService(
    async (_url, options) => {
      capturedOptions = options;
      return new Response(JSON.stringify({ id: "snapshot-1" }), { status: 201 });
    },
    { getSession: async () => "isolated-secret" }
  );
  const response = await service.perform({
    url: "https://sbc-guardian.duckdns.org/api/v2/snapshots",
    method: "POST",
    body: {
      headers: { "X-Guardian-Session": "page-controlled" },
      edition: "FC26"
    }
  });
  assert.equal(response.status, 201);
  assert.equal(capturedOptions.headers["X-Guardian-Session"], "isolated-secret");
  assert.equal(capturedOptions.credentials, "omit");
  assert.equal(capturedOptions.redirect, "error");

  const missingSession = new background.GuardianRequestService(
    async () => assert.fail("fetch must not run without an isolated session"),
    { getSession: async () => "" }
  );
  await assert.rejects(
    () => missingSession.perform({
      url: "https://sbc-guardian.duckdns.org/api/v2/solve/traditional",
      method: "POST",
      body: {}
    }),
    (error) => error.code === "GUARDIAN_AUTH_REQUIRED"
  );

  let listener;
  const router = new background.BackgroundMessageRouter({
    runtimeApi: { onMessage: { addListener(value) { listener = value; } } },
    senderPolicy: new background.SenderPolicy(),
    requestService: { perform: async () => ({}) },
    guardianRequestService: { perform: async () => ({}) },
    guardianConfirmationService: { request: async (preview) => preview.action === "SBC_APPLY" },
    tabService: { open: async () => ({ id: 1 }) },
    errorSerializer: new background.ErrorSerializer()
  });
  router.register();
  const nativeResponse = await new Promise((resolve) => {
    const staysOpen = listener(
      { source: "fsu-extension-content", type: "GUARDIAN_NATIVE_CONFIRM", preview: { action: "SBC_APPLY" } },
      { url: "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/" },
      resolve
    );
    assert.equal(staysOpen, true);
  });
  assert.deepEqual(nativeResponse, { ok: true, approved: true });

  console.log("guardian-isolated-transport: all assertions passed");
}
