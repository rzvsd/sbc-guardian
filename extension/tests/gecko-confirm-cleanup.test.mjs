import assert from "assert/strict";
import fs from "fs";

const source = fs.readFileSync(new URL("../src/background-gecko.js", import.meta.url), "utf8");
assert.match(source, /pendingConfirmations\.delete\(message\.requestId\)/);
console.log("gecko-confirm-cleanup: all assertions passed");
