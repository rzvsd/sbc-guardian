/**
 * Guardian i18n. Canonical strings live in en.json / ro.json (loaded at runtime
 * via chrome.runtime.getURL). translate() is pure so it can be unit-tested.
 */

/**
 * @param {string|undefined} template
 * @param {Record<string, unknown>|undefined} vars
 * @returns {string}
 */
export function interpolate(template, vars) {
  if (template == null) {
    return "";
  }
  if (!vars) {
    return template;
  }
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : ""
  );
}

/**
 * @param {Record<string,string>} messages
 * @param {string} key
 * @param {Record<string, unknown>|undefined} vars
 * @returns {string}
 */
export function translate(messages, key, vars) {
  const tmpl = messages && Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key;
  return interpolate(tmpl, vars);
}

/**
 * @returns {string}
 */
export function getDefaultLocale() {
  if (typeof chrome !== "undefined" && chrome.i18n && typeof chrome.i18n.getUILanguage === "function") {
    return chrome.i18n.getUILanguage().slice(0, 2).toLowerCase();
  }
  return "en";
}

/**
 * @param {string} [locale]
 * @returns {Promise<Record<string,string>>}
 */
export async function loadGuardianMessages(locale) {
  const loc = locale || getDefaultLocale();
  const file = loc === "ro" ? "ro.json" : "en.json";
  const url =
    typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL("src/guardian/i18n/" + file)
      : "src/guardian/i18n/" + file;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error("i18n load failed: " + file);
  }
  return res.json();
}

/**
 * @param {Record<string,string>} messages
 * @returns {(key:string, vars?:Record<string, unknown>) => string}
 */
export function createTranslator(messages) {
  return (key, vars) => translate(messages, key, vars);
}
