"use strict";

const fs = require("fs");
const path = require("path");
const { createZipFromDirectory } = require("./lib/zip-utils.cjs");

const root = path.resolve(__dirname, "..");
const isGecko = process.argv.includes("--gecko");
const manifestSource = isGecko ? "manifest.gecko.json" : "manifest.json";
const manifest = JSON.parse(fs.readFileSync(path.join(root, manifestSource), "utf8"));
const version = manifest.version;
const distDir = path.join(root, "dist");
const stageDir = path.join(distDir, "stage");
const zipName = isGecko
  ? `fsu-fut-enhancer-gecko-${version}.zip`
  : `fsu-fut-enhancer-${version}.zip`;
const zipPath = path.join(distDir, zipName);

const runtimeFiles = [
  "src/background.js",
  "src/background-gecko.js",
  "src/content-bridge.js",
  "src/page-runtime.js",
  "src/userscript.js"
];

function copyFile(relativePath) {
  const src = path.join(root, relativePath);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required file: ${relativePath}`);
  }

  const dest = path.join(stageDir, relativePath);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDirectory(relativePath) {
  const src = path.join(root, relativePath);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing required directory: ${relativePath}`);
  }

  const dest = path.join(stageDir, relativePath);
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const entryRelative = path.join(relativePath, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(entryRelative);
      continue;
    }
    copyFile(entryRelative);
  }
}

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(stageDir, { recursive: true });

// Stage the selected manifest as manifest.json so the browser loader finds it.
fs.copyFileSync(path.join(root, manifestSource), path.join(stageDir, "manifest.json"));
for (const file of runtimeFiles) {
  if (fs.existsSync(path.join(root, file))) {
    copyFile(file);
  }
}
copyDirectory("vendor");
copyDirectory("src/platform");

createZipFromDirectory(stageDir, zipPath);
fs.rmSync(stageDir, { recursive: true, force: true });

console.log(`Packaged ${zipPath} (${isGecko ? "gecko" : "chrome"} manifest)`);
