import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function fail(message) {
  console.error(`check:gecko-compat FAILED: ${message}`);
  process.exit(1);
}

const geckoPath = join(root, "manifest.gecko.json");
if (!fs.existsSync(geckoPath)) fail("manifest.gecko.json missing");
const gecko = JSON.parse(fs.readFileSync(geckoPath, "utf8"));

// GeckoView (Firefox MV3) uses background.scripts, never service_worker.
if (gecko.background?.service_worker) {
  fail("GeckoView cannot use background.service_worker");
}
if (!Array.isArray(gecko.background?.scripts) || gecko.background.scripts.length === 0) {
  fail("GeckoView background.scripts must be a non-empty array");
}
for (const script of gecko.background.scripts) {
  const abs = join(root, script);
  if (!fs.existsSync(abs)) fail(`GeckoView background script missing on disk: ${script}`);
}

// Shared platform modules referenced by the Gecko entry must exist.
for (const file of ["src/platform/background-core.js", "src/platform/webextension-api.js"]) {
  if (!fs.existsSync(join(root, file))) fail(`required platform module missing: ${file}`);
}

// GeckoView WebExtension install requires an explicit id.
if (!gecko.browser_specific_settings?.gecko?.id) {
  fail("browser_specific_settings.gecko.id is required for built-in extension install");
}

console.log("check:gecko-compat OK (GeckoView-compatible manifest + entry scripts present)");
