"use strict";

const esbuild = require("esbuild");
const path = require("path");

const root = path.resolve(__dirname, "..");
const entry = path.join(root, "src", "fsu", "index.js");
const outfile = path.join(root, "src", "userscript.js");
const manifest = require(path.join(root, "manifest.json"));

const buildOptions = {
  entryPoints: [entry],
  bundle: true,
  outfile,
  format: "iife",
  platform: "browser",
  target: ["chrome100"],
  legalComments: "none",
  charset: "utf8",
  loader: { ".css": "text" },
  // Marks the shipped bundle as distributed: the legacy (pre-Guardian) fallback
  // path becomes dead code and cannot be enabled by anyone.
  define: { __FSU_DISTRIBUTED__: "true" },
  banner: {
    js: `// FSU EAFC FUT Web Enhancer — bundled Chrome extension userscript (v${manifest.version})`
  }
};

const watch = process.argv.includes("--watch");

if (watch) {
  esbuild
    .context(buildOptions)
    .then((ctx) => ctx.watch())
    .then(() => {
      console.log(`Watching ${entry}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} else {
  esbuild
    .build(buildOptions)
    .then(() => {
      console.log(`Built ${outfile}`);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
