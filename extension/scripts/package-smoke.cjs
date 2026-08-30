"use strict";

/**
 * Verify a packaged FSU extension ZIP against the release allowlist.
 * Usage:
 *   node scripts/package-smoke.cjs [path-to-zip]
 * Default: extension/dist/fsu-fut-enhancer-<manifest.version>.zip
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { extractZip } = require("./lib/zip-utils.cjs");

const root = path.resolve(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const version = manifest.version;

const ALLOWED = new Set([
  "manifest.json",
  "vendor/lodash.min.js",
  "src/background.js",
  "src/background-gecko.js",
  "src/platform/background-core.js",
  "src/platform/webextension-api.js",
  "src/content-bridge.js",
  "src/page-runtime.js",
  "src/userscript.js"
]);

const FORBIDDEN_SUBSTRINGS = [
  "node_modules",
  ".map",
  "tests/",
  "test/",
  ".har",
  "cookie",
  "session",
  "X-UT-SID"
];

const BOOT_MARKER = "FsuUserscriptApp";

/**
 * @param {string} zipPath
 * @returns {{ ok: true, files: string[] } | { ok: false, error: string }}
 */
function verifyPackageZip(zipPath) {
  if (!fs.existsSync(zipPath)) {
    return { ok: false, error: `ZIP not found: ${zipPath}` };
  }

  const base = path.basename(zipPath);
  if (base !== `fsu-fut-enhancer-${version}.zip`) {
    return {
      ok: false,
      error: `ZIP filename must match manifest version: expected fsu-fut-enhancer-${version}.zip, got ${base}`
    };
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fsu-package-smoke-"));
  try {
    try {
      extractZip(zipPath, tmp);
    } catch {
      return { ok: false, error: `corrupt or unreadable ZIP: ${zipPath}` };
    }

    /** @type {string[]} */
    const files = [];
    function walk(dir, prefix = "") {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          walk(path.join(dir, entry.name), rel);
        } else {
          files.push(rel.replace(/\\/g, "/"));
        }
      }
    }
    walk(tmp);

    for (const file of files) {
      const lower = file.toLowerCase();
      for (const bad of FORBIDDEN_SUBSTRINGS) {
        if (lower.includes(bad.toLowerCase())) {
          return { ok: false, error: `forbidden path in archive: ${file}` };
        }
      }
      if (!ALLOWED.has(file)) {
        return { ok: false, error: `file not on allowlist: ${file}` };
      }
    }

    for (const required of ALLOWED) {
      if (!files.includes(required)) {
        return { ok: false, error: `missing required file: ${required}` };
      }
    }

    const userscript = fs.readFileSync(path.join(tmp, "src/userscript.js"), "utf8");
    if (!userscript.includes(BOOT_MARKER)) {
      return {
        ok: false,
        error: `userscript missing boot marker ${BOOT_MARKER}`
      };
    }

    const packagedManifest = JSON.parse(
      fs.readFileSync(path.join(tmp, "manifest.json"), "utf8")
    );
    if (packagedManifest.version !== version) {
      return {
        ok: false,
        error: `manifest version mismatch inside ZIP: ${packagedManifest.version} vs ${version}`
      };
    }

    return { ok: true, files: files.sort() };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const zipPath = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(root, "dist", `fsu-fut-enhancer-${version}.zip`);

  const result = verifyPackageZip(zipPath);
  if (!result.ok) {
    console.error(result.error);
    process.exit(1);
  }
  console.log(`Package smoke OK: ${zipPath}`);
  console.log(`Files: ${result.files.join(", ")}`);
}

if (require.main === module) {
  main();
}

module.exports = { verifyPackageZip, ALLOWED, BOOT_MARKER };
