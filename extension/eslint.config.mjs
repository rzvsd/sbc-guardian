import js from "@eslint/js";

const eaGlobals = {
  GM_getValue: "readonly",
  GM_setValue: "readonly",
  GM_xmlhttpRequest: "readonly",
  GM_addStyle: "readonly",
  GM_openInTab: "readonly",
  GM_info: "readonly",
  unsafeWindow: "readonly",
  _: "readonly",
  repositories: "readonly",
  services: "readonly",
  isPhone: "readonly",
  enums: "readonly",
  ItemRarity: "readonly",
  ItemAttribute: "readonly",
  ItemSubAttribute: "readonly",
  ItemPile: "readonly",
  ItemState: "readonly",
  MAX_NEW_ITEMS: "writable",
  APP_YEAR_SHORT: "readonly"
};

const nodeGlobals = {
  console: "readonly",
  process: "readonly",
  module: "readonly",
  __dirname: "readonly",
  URL: "readonly",
  Response: "readonly",
  globalThis: "readonly"
};

export default [
  js.configs.recommended,
  {
    files: ["src/fsu/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: eaGlobals
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-empty": "warn",
      "no-prototype-builtins": "off",
      "no-case-declarations": "off",
      "no-async-promise-executor": "off",
      "no-fallthrough": "off",
      "no-constant-binary-expression": "off",
      "no-extra-boolean-cast": "off",
      "no-redeclare": "off",
      "no-unreachable": "off",
      "no-constant-condition": "off",
      "no-useless-escape": "off",
      "no-useless-assignment": "error"
    }
  },
  {
    files: ["tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...nodeGlobals,
        ...eaGlobals,
        assert: "readonly"
      }
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },
  {
    files: [
      "src/fsu/core/PriceRequestQueue.js",
      "src/fsu/core/PatchLifecycleRegistry.js",
      "src/fsu/core/TtlCache.js",
      "src/fsu/ea/EaRuntimeAdapter.js",
      "src/fsu/infra/JsonParsing.js",
      "src/fsu/infra/RatingPrices.js",
      "src/fsu/ui/HtmlSafety.js"
    ],
    languageOptions: {
      globals: {
        document: "readonly",
        URL: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unreachable": "error",
      "no-redeclare": "error",
      "no-constant-condition": "error"
    }
  },
  {
    files: ["src/guardian/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...nodeGlobals,
        document: "readonly",
        window: "readonly",
        self: "readonly",
        customElements: "readonly",
        AbortController: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        crypto: "readonly",
        fetch: "readonly",
        chrome: "readonly",
        browser: "readonly"
      }
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      "no-empty": "warn",
      "no-useless-assignment": "error"
    }
  },
  {
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: nodeGlobals
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },
  {
    files: ["scripts/**/*.cjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: nodeGlobals
    }
  },
  {
    files: [
      "src/background.js",
      "src/background-gecko.js",
      "src/platform/background-core.js",
      "src/platform/webextension-api.js",
      "src/content-bridge.js",
      "src/page-runtime.js"
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...nodeGlobals,
        Blob: "readonly",
        FormData: "readonly",
        URLSearchParams: "readonly",
        AbortController: "readonly",
        TextEncoder: "readonly",
        ArrayBuffer: "readonly",
        fetch: "readonly",
        chrome: "readonly",
        browser: "readonly",
        importScripts: "readonly",
        document: "readonly",
        window: "readonly",
        self: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly"
      }
    },
    rules: {
      "no-undef": "off",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }]
    }
  },
  {
    ignores: ["src/userscript.js", "vendor/**", "tests/load-background.cjs"]
  }
];
