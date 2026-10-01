import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const extensionRoot = path.resolve(testDirectory, "..");
const futUrl =
  "https://www.ea.com/ea-sports-fc/ultimate-team/web-app/browser-smoke";

function copyFile(sourceRoot, targetRoot, relativePath) {
  const targetPath = path.join(targetRoot, relativePath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(path.join(sourceRoot, relativePath), targetPath);
}

async function prepareSmokeExtension(tempRoot) {
  const smokeExtensionRoot = path.join(tempRoot, "extension");
  const runtimeFiles = [
    "manifest.json",
    "src/background.js",
    "src/platform/background-core.js",
    "src/content-bridge.js",
    "src/page-runtime.js",
    "vendor/lodash.min.js",
  ];

  for (const relativePath of runtimeFiles) {
    copyFile(extensionRoot, smokeExtensionRoot, relativePath);
  }

  await build({
    entryPoints: [
      path.join(testDirectory, "fixtures/browser/ea-shell-entry.js"),
    ],
    bundle: true,
    outfile: path.join(smokeExtensionRoot, "src/userscript.js"),
    format: "iife",
    platform: "browser",
    target: ["chrome100"],
    legalComments: "none",
  });

  return smokeExtensionRoot;
}

function assertSanitizedLifecycleDiagnostics(diagnostics) {
  const allowedKeys = ["id", "missing", "phase", "sequence", "status"];
  assert.ok(diagnostics.length >= 1);

  for (const diagnostic of diagnostics) {
    assert.deepEqual(Object.keys(diagnostic).sort(), allowedKeys);
    assert.match(diagnostic.id, /^[A-Za-z0-9_$.[\]:-]+$/);
    assert.match(diagnostic.phase, /^[A-Za-z0-9_$.[\]:-]+$/);
    assert.ok(Number.isInteger(diagnostic.sequence));
    assert.ok(Array.isArray(diagnostic.missing));
  }

  assert.doesNotMatch(
    JSON.stringify(diagnostics),
    /cookie|x-ut-sid|session[_ -]?id|account/i,
  );
}

async function waitForServiceWorker(context) {
  return (
    context.serviceWorkers()[0] ??
    context.waitForEvent("serviceworker", { timeout: 15_000 })
  );
}

async function waitForStorageValue(worker, key, expectedValue) {
  const deadline = Date.now() + 5_000;

  while (Date.now() < deadline) {
    const actualValue = await worker.evaluate(async (storageKey) => {
      const stored = await chrome.storage.local.get(storageKey);
      return stored[storageKey];
    }, key);

    if (actualValue === expectedValue) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  assert.fail(`Storage value ${key} was not persisted within 5 seconds`);
}

async function run() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "fsu-browser-smoke-"));
  const smokeExtensionRoot = await prepareSmokeExtension(tempRoot);
  const profileRoot = path.join(tempRoot, "profile");
  let context;

  try {
    context = await chromium.launchPersistentContext(profileRoot, {
      channel: process.env.FSU_PLAYWRIGHT_CHANNEL || "chromium",
      headless: process.env.FSU_BROWSER_HEADLESS !== "0",
      args: [
        `--disable-extensions-except=${smokeExtensionRoot}`,
        `--load-extension=${smokeExtensionRoot}`,
      ],
    });

    const worker = await waitForServiceWorker(context);
    assert.match(worker.url(), /^chrome-extension:\/\/[^/]+\/src\/background\.js$/);

    await worker.evaluate(async () => {
      await chrome.storage.local.set({
        packsSort: "asc",
        "browser-smoke-private": "must-not-reach-page",
      });
    });

    const page = await context.newPage();
    await page.route("https://www.ea.com/**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/html",
        body: `<!doctype html>
          <html>
            <head>
              <title>FSU smoke</title>
              <script>
                window.__FSU_EA_SHELL_CALLS__ = [];
                window.__FSU_STORE_ORIGINAL_CALLS__ = [];
                window.__FSU_STORE_PATCH_CALLS__ = [];
                window.__FSU_STORE_OPEN_ORIGINAL_CALLS__ = [];
                window.__FSU_STORE_OPEN_PATCH_CALLS__ = [];
                window.__FSU_STORE_ANIMATION_PATCH_CALLS__ = [];
                window.UTMarketSearchView = class UTMarketSearchView {
                  _generate(...args) {
                    window.__FSU_EA_SHELL_CALLS__.push(args);
                    return "ea-original";
                  }
                };
                window.UTStoreView = class UTStoreView {
                  setPacks(...args) {
                    window.__FSU_STORE_ORIGINAL_CALLS__.push(args);
                    return "ea-store";
                  }
                };
                window.UTStoreViewController = class UTStoreViewController {
                  eOpenPack(...args) {
                    window.__FSU_STORE_OPEN_ORIGINAL_CALLS__.push(args);
                    return "ea-open";
                  }
                };
                window.UTPackAnimationViewController =
                  class UTPackAnimationViewController {};
              </script>
            </head>
            <body><main>FSU smoke</main></body>
          </html>`,
      });
    });
    await page.goto(futUrl, { waitUntil: "domcontentloaded" });

    await page.waitForFunction(
      () => window.GM_info?.scriptHandler === "Chrome Extension MV3 shim",
    );
    await page.waitForFunction(() => window.__FSU_USERSCRIPT_SMOKE__ === true);
    await page.waitForFunction(
      () => window.__FSU_EA_SHELL__?.initialInstall?.status === "installed",
    );

    const lifecycleResult = await page.evaluate(() => {
      const shell = window.__FSU_EA_SHELL__;
      const initialState = shell.state();
      const firstResult = shell.invoke(false, "first", 2);
      const blockedResult = shell.invoke(true, "blocked");
      const duplicate = shell.setEnabled(true);
      const disabled = shell.setEnabled(false);
      const restoredResult = shell.invoke(false, "after-disable");
      const reinstalled = shell.setEnabled(true);
      const reinstalledResult = shell.invoke(false, "after-reinstall");
      const restoredAgain = shell.setEnabled(false);

      return {
        patchId: shell.patchId,
        initialInstall: shell.initialInstall,
        initialState,
        firstResult,
        blockedResult,
        duplicate,
        disabled,
        restoredResult,
        reinstalled,
        reinstalledResult,
        restoredAgain,
        finalState: shell.state(),
      };
    });

    assert.equal(lifecycleResult.patchId, "market.search-view-generate");
    assert.equal(lifecycleResult.initialInstall.status, "installed");
    assert.equal(lifecycleResult.initialState.installed, true);
    assert.equal(
      lifecycleResult.initialState.methodName,
      "fsuMarketSearchGenerate",
    );
    assert.equal(lifecycleResult.firstResult, undefined);
    assert.equal(lifecycleResult.blockedResult, undefined);
    assert.equal(lifecycleResult.duplicate.status, "already-installed");
    assert.equal(lifecycleResult.disabled.status, "restored");
    assert.equal(lifecycleResult.restoredResult, "ea-original");
    assert.equal(lifecycleResult.reinstalled.status, "installed");
    assert.equal(lifecycleResult.reinstalledResult, undefined);
    assert.equal(lifecycleResult.restoredAgain.status, "restored");
    assert.equal(lifecycleResult.finalState.installed, false);
    assert.equal(lifecycleResult.finalState.methodName, "_generate");
    assert.deepEqual(lifecycleResult.finalState.shellCalls, [
      ["first", 2],
      ["after-disable"],
      ["after-reinstall"],
    ]);
    assertSanitizedLifecycleDiagnostics(
      lifecycleResult.finalState.diagnostics,
    );

    const injectionPayload = `<img src=x onerror="window.__pwned=1">`;
    const htmlSafetyResult = await page.evaluate((payload) => {
      const htmlSafety = window.__FSU_EA_SHELL__.htmlSafety;
      return {
        rendered: htmlSafety.renderText(payload),
        rejected: htmlSafety.rejectsPlainMarkup(payload),
        pwned: window.__pwned === 1
      };
    }, injectionPayload);
    assert.deepEqual(htmlSafetyResult.rendered, {
      childElementCount: 0,
      textContent: injectionPayload
    });
    assert.equal(htmlSafetyResult.rejected, true);
    assert.equal(htmlSafetyResult.pwned, false);

    const storeLifecycleResult = await page.evaluate(() => {
      const store = window.__FSU_EA_SHELL__.store;
      const initialState = store.state();
      const patchedResult = store.invoke("catalog");
      const duplicate = store.setEnabled(true);
      const disabled = store.setEnabled(false);
      const restoredResult = store.invoke("original");
      const reinstalled = store.setEnabled(true);
      const reinstalledResult = store.invoke("catalog-again");
      const restoredAgain = store.setEnabled(false);
      return {
        patchId: store.patchId,
        initialInstall: store.initialInstall,
        initialState,
        patchedResult,
        duplicate,
        disabled,
        restoredResult,
        reinstalled,
        reinstalledResult,
        restoredAgain,
        finalState: store.state(),
      };
    });
    assert.equal(storeLifecycleResult.patchId, "store.pack-list");
    assert.equal(storeLifecycleResult.initialInstall.status, "installed");
    assert.equal(storeLifecycleResult.initialState.installed, true);
    assert.equal(
      storeLifecycleResult.initialState.methodName,
      "fsuStorePackList",
    );
    assert.equal(storeLifecycleResult.patchedResult, "fsu-store");
    assert.equal(storeLifecycleResult.duplicate.status, "already-installed");
    assert.equal(storeLifecycleResult.disabled.status, "restored");
    assert.equal(storeLifecycleResult.restoredResult, "ea-store");
    assert.equal(storeLifecycleResult.reinstalled.status, "installed");
    assert.equal(storeLifecycleResult.reinstalledResult, "fsu-store");
    assert.equal(storeLifecycleResult.restoredAgain.status, "restored");
    assert.equal(storeLifecycleResult.finalState.installed, false);
    assert.equal(storeLifecycleResult.finalState.methodName, "setPacks");
    assert.deepEqual(storeLifecycleResult.finalState.originalCalls, [
      ["original"],
    ]);
    assert.deepEqual(storeLifecycleResult.finalState.patchedCalls, [
      ["catalog"],
      ["catalog-again"],
    ]);

    const storeOpenLifecycleResult = await page.evaluate(() => {
      const storeOpen = window.__FSU_EA_SHELL__.storeOpen;
      const initialState = storeOpen.state();
      const patchedResult = storeOpen.invoke("view", "open", {
        articleId: 7,
      });
      const duplicate = storeOpen.setEnabled(true);
      const disabled = storeOpen.setEnabled(false);
      const restoredResult = storeOpen.invoke("view", "open", {
        articleId: 8,
      });
      const reinstalled = storeOpen.setEnabled(true);
      const reinstalledResult = storeOpen.invoke("view", "open", {
        articleId: 9,
      });
      const restoredAgain = storeOpen.setEnabled(false);
      return {
        patchId: storeOpen.patchId,
        initialInstall: storeOpen.initialInstall,
        initialState,
        patchedResult,
        duplicate,
        disabled,
        restoredResult,
        reinstalled,
        reinstalledResult,
        restoredAgain,
        finalState: storeOpen.state(),
      };
    });
    assert.equal(
      storeOpenLifecycleResult.patchId,
      "store.pack-open-transaction",
    );
    assert.equal(storeOpenLifecycleResult.initialInstall.status, "installed");
    assert.equal(storeOpenLifecycleResult.initialState.installed, true);
    assert.equal(
      storeOpenLifecycleResult.initialState.methodName,
      "fsuStorePackOpenTransaction",
    );
    assert.equal(storeOpenLifecycleResult.patchedResult, "ea-open");
    assert.equal(
      storeOpenLifecycleResult.duplicate.status,
      "already-installed",
    );
    assert.equal(storeOpenLifecycleResult.disabled.status, "restored");
    assert.equal(storeOpenLifecycleResult.restoredResult, "ea-open");
    assert.equal(storeOpenLifecycleResult.reinstalled.status, "installed");
    assert.equal(storeOpenLifecycleResult.reinstalledResult, "ea-open");
    assert.equal(storeOpenLifecycleResult.restoredAgain.status, "restored");
    assert.equal(storeOpenLifecycleResult.finalState.installed, false);
    assert.equal(
      storeOpenLifecycleResult.finalState.methodName,
      "eOpenPack",
    );
    assert.equal(
      storeOpenLifecycleResult.finalState.originalCalls.length,
      3,
    );
    assert.equal(
      storeOpenLifecycleResult.finalState.patchedCalls.length,
      2,
    );

    const storeAnimationLifecycleResult = await page.evaluate(() => {
      const animation = window.__FSU_EA_SHELL__.storeAnimation;
      const initialState = animation.state();
      const patchedResult = animation.invoke("first");
      const duplicate = animation.setEnabled(true);
      const disabled = animation.setEnabled(false);
      const disabledState = animation.state();
      const reinstalled = animation.setEnabled(true);
      const reinstalledResult = animation.invoke("second");
      const restoredAgain = animation.setEnabled(false);
      return {
        patchId: animation.patchId,
        initialInstall: animation.initialInstall,
        initialState,
        patchedResult,
        duplicate,
        disabled,
        disabledState,
        reinstalled,
        reinstalledResult,
        restoredAgain,
        finalState: animation.state(),
      };
    });
    assert.equal(
      storeAnimationLifecycleResult.patchId,
      "store.pack-animation",
    );
    assert.equal(
      storeAnimationLifecycleResult.initialInstall.status,
      "installed",
    );
    assert.equal(storeAnimationLifecycleResult.initialState.installed, true);
    assert.equal(storeAnimationLifecycleResult.initialState.hasOwnMethod, true);
    assert.equal(
      storeAnimationLifecycleResult.initialState.methodName,
      "fsuStorePackAnimation",
    );
    assert.equal(storeAnimationLifecycleResult.patchedResult, "fsu-animation");
    assert.equal(
      storeAnimationLifecycleResult.duplicate.status,
      "already-installed",
    );
    assert.equal(storeAnimationLifecycleResult.disabled.status, "restored");
    assert.equal(storeAnimationLifecycleResult.disabledState.installed, false);
    assert.equal(storeAnimationLifecycleResult.disabledState.hasOwnMethod, false);
    assert.equal(storeAnimationLifecycleResult.reinstalled.status, "installed");
    assert.equal(
      storeAnimationLifecycleResult.reinstalledResult,
      "fsu-animation",
    );
    assert.equal(
      storeAnimationLifecycleResult.restoredAgain.status,
      "restored",
    );
    assert.equal(storeAnimationLifecycleResult.finalState.installed, false);
    assert.equal(storeAnimationLifecycleResult.finalState.hasOwnMethod, false);
    assert.deepEqual(
      storeAnimationLifecycleResult.finalState.patchedCalls,
      [["first"], ["second"]],
    );

    assert.equal(
      await page.evaluate(() => window.GM_getValue("packsSort")),
      "asc",
    );
    assert.equal(
      await page.evaluate(() => window.GM_getValue("browser-smoke-private")),
      undefined,
    );

    await page.evaluate(() => {
      window.GM_setValue("packsSort", "desc");
    });
    await waitForStorageValue(worker, "packsSort", "desc");
    await page.evaluate(() => {
      window.postMessage(
        {
          source: "fsu-extension-page",
          type: "GM_SET_VALUE",
          key: "browser-smoke-forged-storage",
          value: "written",
        },
        "*",
      );
    });
    await page.waitForTimeout(100);
    assert.equal(
      await worker.evaluate(async () => {
        const stored = await chrome.storage.local.get(
          "browser-smoke-forged-storage",
        );
        return stored["browser-smoke-forged-storage"];
      }),
      undefined,
    );

    const forgedResponse = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const requestId = "browser-smoke-forged-request";
          const timeout = window.setTimeout(() => {
            window.removeEventListener("message", onMessage);
            reject(new Error("Timed out waiting for forged request response"));
          }, 5_000);

          function onMessage(event) {
            if (
              event.source !== window ||
              event.data?.source !== "fsu-extension-content" ||
              event.data?.type !== "GM_XMLHTTP_RESPONSE" ||
              event.data?.requestId !== requestId
            ) {
              return;
            }

            window.clearTimeout(timeout);
            window.removeEventListener("message", onMessage);
            resolve(event.data);
          }

          window.addEventListener("message", onMessage);
          window.postMessage(
            {
              source: "fsu-extension-page",
              type: "GM_XMLHTTP_REQUEST",
              requestId,
              details: {
                method: "GET",
                url: "https://example.com/private",
              },
            },
            "*",
          );
        }),
    );
    assert.equal(forgedResponse.ok, false);
    assert.equal(forgedResponse.error?.name, "SecurityError");

    await worker
      .evaluate(() => {
        setTimeout(() => chrome.runtime.reload(), 0);
      })
      .catch(() => {});
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.GM_setValue("packsSort", "asc");
    });

    const invalidatedBanner = page.locator(
      "#fsu-extension-invalidated-banner",
    );
    await invalidatedBanner.waitFor({ timeout: 10_000 });
    assert.match(await invalidatedBanner.innerText(), /F5|refresh/i);

    console.log(
      "MV3 browser smoke passed: handshake, lifecycle shell, HTML safety, storage, request policy, reload invalidation",
    );
  } finally {
    await context?.close().catch(() => {});
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
