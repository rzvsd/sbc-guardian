import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function fail(message) {
  console.error(`check:manifests FAILED: ${message}`);
  process.exit(1);
}

function load(name) {
  const p = join(root, name);
  if (!fs.existsSync(p)) fail(`missing ${name}`);
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (error) {
    fail(`${name} is not valid JSON: ${error.message}`);
  }
}

const chrome = load("manifest.json");
const gecko = load("manifest.gecko.json");

if (chrome.manifest_version !== 3) fail("manifest.json must be MV3");
if (gecko.manifest_version !== 2) fail("manifest.gecko.json must be MV2 for GeckoView required host permissions");
if (chrome.version !== gecko.version) fail("manifest versions must match");
if (chrome.background?.service_worker !== "src/background.js") {
  fail("manifest.json background.service_worker must be src/background.js");
}
if (gecko.background?.service_worker) {
  fail("manifest.gecko.json must not use background.service_worker (GeckoView MV3 uses scripts)");
}
if (!Array.isArray(gecko.background?.scripts) || !gecko.background.scripts.includes("src/background-gecko.js")) {
  fail("manifest.gecko.json background.scripts must include src/background-gecko.js");
}
if (Object.hasOwn(gecko.background ?? {}, "persistent")) {
  fail("manifest.gecko.json must omit background.persistent");
}
if (!gecko.browser_specific_settings?.gecko?.id) {
  fail("manifest.gecko.json must set browser_specific_settings.gecko.id");
}
for (const permission of ["nativeMessaging", "geckoViewAddons"]) {
  if (!gecko.permissions?.includes(permission)) {
    fail(`manifest.gecko.json must include ${permission}`);
  }
}
for (const origin of ["https://www.ea.com/*", "https://www.easports.com/*"]) {
  if (!gecko.permissions?.includes(origin)) {
    fail(`manifest.gecko.json must grant the approved EA origin ${origin}`);
  }
}
for (const forbidden of ["https://www.futbin.org/*", "https://www.fut.gg/*", "https://www.futnext.com/*"]) {
  if (gecko.permissions?.includes(forbidden)) {
    fail(`manifest.gecko.json must not grant the unapproved third-party origin ${forbidden}`);
  }
}

console.log("check:manifests OK (chrome + gecko manifests valid, versions aligned)");
