import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const built = await build({
  stdin: {
    contents: `
      import { mountGuardian } from "./src/guardian/index.js";
      globalThis.__mountGuardianForSmoke = mountGuardian;
    `,
    resolveDir: root,
    loader: "js"
  },
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  loader: { ".css": "text" },
  define: { __FSU_DISTRIBUTED__: "true" }
});

const browser = await chromium.launch({
  channel: process.env.FSU_PLAYWRIGHT_CHANNEL || "chromium",
  headless: process.env.FSU_BROWSER_HEADLESS !== "0"
});

try {
  const page = await browser.newPage();
  await page.route("https://guardian.test/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html><html><head></head><body><main>Guardian smoke</main></body></html>"
    })
  );
  await page.goto("https://guardian.test/smoke", { waitUntil: "domcontentloaded" });
  await page.addScriptTag({ content: built.outputFiles[0].text });
  const publicKeys = await page.evaluate(() => {
    window.__guardianMutations = 0;
    window.__mountGuardianForSmoke({
      window,
      document,
      sessionNonce: "browser-smoke",
      mutations: {
        MARKET_BUY: () => {
          window.__guardianMutations++;
          return true;
        }
      }
    });
    return Object.keys(window.__guardian).sort();
  });
  assert.deepEqual(publicKeys, ["getRegisteredKinds", "isRegistered", "requestGuarded"]);

  // A page-world synthetic click is untrusted and must not approve.
  await page.evaluate(() => {
    window.__guardianPromise = window.__guardian.requestGuarded("MARKET_BUY", { defId: 1 });
    window.__guardianPromise.catch((error) => {
      window.__guardianError = error && error.message;
    });
  });
  await page.waitForFunction(() => document.querySelector(".guardian-btn-danger") || window.__guardianError);
  assert.equal(await page.evaluate(() => window.__guardianError), undefined);
  await page.evaluate(() => document.querySelector(".guardian-btn-danger").click());
  await page.waitForTimeout(50);
  assert.equal(await page.evaluate(() => window.__guardianMutations), 0);

  // A Playwright click is a real browser input event and approves exactly once.
  await page.locator(".guardian-btn-danger").click();
  await page.evaluate(() => window.__guardianPromise);
  assert.equal(await page.evaluate(() => window.__guardianMutations), 1);
  assert.equal(await page.locator(".guardian-overlay").count(), 0);

  // Two real clicks at the same coordinates still execute only once because
  // the first click consumes the decision and removes the dialog.
  await page.evaluate(() => {
    window.__guardianPromise = window.__guardian.requestGuarded("MARKET_BUY", { defId: 2 });
  });
  const accept = page.locator(".guardian-btn-danger");
  await accept.waitFor();
  const box = await accept.boundingBox();
  assert.ok(box);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.evaluate(() => window.__guardianPromise);
  assert.equal(await page.evaluate(() => window.__guardianMutations), 2);

  // Reject and Escape are terminal zero-mutation outcomes with clean overlays.
  await page.evaluate(() => {
    window.__guardianPromise = window.__guardian.requestGuarded("MARKET_BUY", { defId: 3 }).catch((e) => e.message);
  });
  await page.locator(".guardian-btn:not(.guardian-btn-danger)").waitFor();
  await page.locator(".guardian-btn:not(.guardian-btn-danger)").click();
  assert.equal(await page.evaluate(() => window.__guardianPromise), "GUARDIAN_DISMISSED");
  assert.equal(await page.evaluate(() => window.__guardianMutations), 2);

  await page.evaluate(() => {
    window.__guardianPromise = window.__guardian.requestGuarded("MARKET_BUY", { defId: 4 }).catch((e) => e.message);
  });
  await page.locator(".guardian-btn-danger").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.evaluate(() => window.__guardianPromise), "GUARDIAN_DISMISSED");
  assert.equal(await page.evaluate(() => window.__guardianMutations), 2);
  assert.equal(await page.locator(".guardian-overlay").count(), 0);

  console.log("Guardian browser smoke passed: synthetic blocked, trusted click once, double-click once, reject/escape zero");
} finally {
  await browser.close();
}
