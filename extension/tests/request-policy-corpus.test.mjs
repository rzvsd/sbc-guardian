/**
 * H3: Extension consumes the shared request-policy corpus
 * (shared/request-policy-corpus.json) used by the extension request policy.
 * productionEndpoints is the drift source of truth for allowed API origins.
 */
import assert from "assert";
import fs from "fs";
import path from "path";
import { createRequire } from "module";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { loadBackground } = require("./load-background.cjs");
const root = path.resolve(__dirname, "..");
const background = loadBackground(root);

const corpusPath = path.resolve(
  __dirname,
  "../../shared/request-policy-corpus.json"
);

function authorizeOrNull(policy, method, url) {
  try {
    return { ok: true, value: policy.authorize({ method, url }) };
  } catch (error) {
    return { ok: false, error };
  }
}

function requestRuleOriginsFromSource(bgSource) {
  const start = bgSource.indexOf("const REQUEST_RULES");
  const end = bgSource.indexOf("class RequestPolicy");
  assert.ok(start >= 0 && end > start, "REQUEST_RULES block not found");
  const ruleBlock = bgSource.slice(start, end);
  return [
    ...new Set(
      [...ruleBlock.matchAll(/origin:\s*"(https:\/\/[^"]+)"/g)].map((m) => m[1])
    )
  ].sort();
}

export function runRequestPolicyCorpusTests() {
  const corpus = JSON.parse(fs.readFileSync(corpusPath, "utf8"));
  const raw = fs.readFileSync(corpusPath, "utf8").toLowerCase();

  assert.equal(corpus.invariants.noSessionInFixtures, true);
  assert.equal(corpus.invariants.maxResponseBytes, 5 * 1024 * 1024);
  assert.equal(raw.includes("cookie="), false);
  assert.deepEqual(corpus.invariants.methods, ["GET"]);
  assert.equal(corpus.invariants.redirect, "fail_closed");

  const policy = new background.RequestPolicy();
  for (const testCase of corpus.urlCases) {
    const result = authorizeOrNull(policy, testCase.method, testCase.url);
    if (testCase.expect === "allow") {
      assert.equal(
        result.ok,
        true,
        `${testCase.id}: expected allow for ${testCase.url}`
      );
      assert.equal(result.value.method, "GET");
    } else if (testCase.expect === "deny") {
      assert.equal(
        result.ok,
        false,
        `${testCase.id}: expected deny for ${testCase.url}`
      );
      assert.equal(result.error.name, "SecurityError");
    } else {
      assert.fail(`${testCase.id}: unknown expect ${testCase.expect}`);
    }
  }

  const normalizer = new background.RequestNormalizer();
  const allowed = new Set([
    "accept",
    "content-type",
    "cache-control",
    "pragma",
    "x-requested-with"
  ]);
  const eaAllowed = new Set(["accept", "content-type", "x-ut-sid"]);

  for (const testCase of corpus.headerCases) {
    const allowedHeaders =
      testCase.endpoint === "ea_transfer_market" ? eaAllowed : allowed;
    const normalized = normalizer.normalizeHeaders(
      testCase.headers,
      allowedHeaders
    );

    assert.equal(
      Object.keys(normalized).some((k) => k.toLowerCase() === "user-agent"),
      false,
      `${testCase.id}: User-Agent must be dropped`
    );

    if (testCase.expect === "accept") {
      for (const [name, value] of Object.entries(testCase.headers)) {
        const lower = name.toLowerCase();
        if (lower === "user-agent") continue;
        if (allowedHeaders.has(lower)) {
          assert.equal(
            normalized[name] ?? normalized[lower],
            value,
            `${testCase.id}: expected keep ${name}`
          );
        }
      }
    }

    if (testCase.expect === "reject_or_drop") {
      for (const name of Object.keys(testCase.headers)) {
        const lower = name.toLowerCase();
        if (allowedHeaders.has(lower) && lower !== "user-agent") continue;
        assert.equal(
          normalized[name],
          undefined,
          `${testCase.id}: expected drop ${name}`
        );
      }
    }
  }

  // --- Production-rule drift detection (inventory is source of truth) ---
  assert.ok(
    Array.isArray(corpus.productionEndpoints) &&
      corpus.productionEndpoints.length > 0,
    "productionEndpoints inventory required for drift detection"
  );

  const inventoryOrigins = [
    ...new Set(corpus.productionEndpoints.map((ep) => ep.origin))
  ].sort();

  for (const ep of corpus.productionEndpoints) {
    for (const routePath of ep.paths) {
      const url = `${ep.origin}${routePath}`;
      const result = authorizeOrNull(policy, "GET", url);
      assert.equal(
        result.ok,
        true,
        `inventory path must allow: ${ep.id} ${url}`
      );
      assert.equal(
        result.value.credentials,
        ep.credentials,
        `inventory credentials must match: ${ep.id}`
      );
    }
  }

  const bgSource = fs.readFileSync(
    path.join(root, "src", "platform", "background-core.js"),
    "utf8"
  );
  assert.deepEqual(
    requestRuleOriginsFromSource(bgSource),
    inventoryOrigins,
    "Extension REQUEST_RULES origins must match productionEndpoints inventory"
  );

  // Every allow urlCase host must be in inventory.
  for (const testCase of corpus.urlCases) {
    if (testCase.expect !== "allow") continue;
    const origin = new URL(testCase.url).origin;
    assert.ok(
      inventoryOrigins.includes(origin),
      `allow case ${testCase.id} origin ${origin} missing from productionEndpoints`
    );
  }

  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );
  // Content-script web app hosts (not request-policy API origins).
  const contentHosts = new Set([
    "https://www.ea.com",
    "https://www.easports.com"
  ]);
  const apiHostPermissions = (manifest.host_permissions || [])
    .map((h) => h.replace(/\/\*$/, ""))
    .filter(
      (origin) =>
        !contentHosts.has(origin) &&
        origin !== "https://sbc-guardian.duckdns.org"
    )
    .sort();
  assert.deepEqual(
    apiHostPermissions,
    inventoryOrigins,
    "manifest API host_permissions must match productionEndpoints inventory"
  );

  // Broad www.futnext.com access stays denied; only preview/probability routes are allowed.
  assert.equal(
    authorizeOrNull(policy, "GET", "https://www.futnext.com/anything").ok,
    false,
    "www.futnext.com must be denied"
  );
  assert.ok(
    manifest.host_permissions.includes("https://www.futnext.com/*"),
    "manifest must grant the policy-enforced FutNext preview host"
  );
  assert.ok(
    manifest.host_permissions.includes("https://sbc-guardian.duckdns.org/*"),
    "manifest must grant only the dedicated Guardian background transport host"
  );
}
