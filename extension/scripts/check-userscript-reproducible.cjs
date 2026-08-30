"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const userscript = path.join(root, "src", "userscript.js");
const before = fs.readFileSync(userscript);

execFileSync(process.execPath, [path.join(__dirname, "build-userscript.cjs")], {
  cwd: root,
  stdio: "inherit"
});

const after = fs.readFileSync(userscript);
if (!before.equals(after)) {
  console.error("Generated userscript is not reproducible: a second build changed src/userscript.js");
  process.exit(1);
}
console.log("Generated userscript reproducibility OK");
