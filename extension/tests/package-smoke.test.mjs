import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const {
  verifyPackageZip,
  ALLOWED,
  BOOT_MARKER
} = require("../scripts/package-smoke.cjs");
const { createZipFromDirectory } = require("../scripts/lib/zip-utils.cjs");

function writeZipFromDir(dir, zipPath) {
  createZipFromDirectory(dir, zipPath);
}

export function runPackageSmokeTests() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "manifest.json"), "utf8")
  );
  const version = manifest.version;
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fsu-pkg-test-"));

  try {
    // Success fixture.
    const okDir = path.join(tmpRoot, "ok");
    fs.mkdirSync(path.join(okDir, "src"), { recursive: true });
    fs.mkdirSync(path.join(okDir, "src", "platform"), { recursive: true });
    fs.mkdirSync(path.join(okDir, "vendor"), { recursive: true });
    fs.writeFileSync(
      path.join(okDir, "manifest.json"),
      JSON.stringify({ version }, null, 2)
    );
    for (const file of [
      "src/background.js",
      "src/background-gecko.js",
      "src/platform/background-core.js",
      "src/platform/webextension-api.js",
      "src/content-bridge.js",
      "src/page-runtime.js"
    ]) {
      fs.writeFileSync(path.join(okDir, file), `// ${file}\n`);
    }
    fs.writeFileSync(
      path.join(okDir, "src/userscript.js"),
      `// boot\nclass ${BOOT_MARKER} {}\n`
    );
    fs.writeFileSync(path.join(okDir, "vendor/lodash.min.js"), "/* lodash */\n");
    const okZip = path.join(tmpRoot, `fsu-fut-enhancer-${version}.zip`);
    writeZipFromDir(okDir, okZip);
    const ok = verifyPackageZip(okZip);
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.files, [...ALLOWED].sort());

    // Extra file failure.
    fs.writeFileSync(path.join(okDir, "extra.js"), "nope");
    // Must use correct filename for version check.
    const extraWork = path.join(tmpRoot, `fsu-fut-enhancer-${version}.zip`);
    writeZipFromDir(okDir, extraWork);
    const extra = verifyPackageZip(extraWork);
    assert.equal(extra.ok, false);
    assert.match(extra.error, /not on allowlist|extra/);
    fs.rmSync(path.join(okDir, "extra.js"));

    // Version mismatch filename.
    const wrongName = path.join(tmpRoot, "fsu-fut-enhancer-0.0.0.zip");
    writeZipFromDir(okDir, wrongName);
    const mismatch = verifyPackageZip(wrongName);
    assert.equal(mismatch.ok, false);
    assert.match(mismatch.error, /filename must match/);

    // Corrupt ZIP.
    const corrupt = path.join(tmpRoot, `fsu-fut-enhancer-${version}.zip`);
    fs.writeFileSync(corrupt, "not-a-zip");
    const corruptResult = verifyPackageZip(corrupt);
    assert.equal(corruptResult.ok, false);
    assert.match(corruptResult.error, /corrupt|unreadable/);

    // Missing ZIP.
    const missing = verifyPackageZip(path.join(tmpRoot, "nope.zip"));
    assert.equal(missing.ok, false);
  } finally {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  }
}
