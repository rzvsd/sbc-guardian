// Minimal JSON Schema 2020-12 subset validator for Guardian shared contracts.
// Supports: type, enum, const, required, properties, additionalProperties:false,
// items, and local $ref (file-relative). Enough to gate golden fixtures in JS.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = join(HERE, "schemas");
const FIXTURE_DIR = join(HERE, "fixtures");

const schemaCache = new Map();

/**
 * @param {string} name
 * @returns {any}
 */
export function loadSchema(name) {
  if (schemaCache.has(name)) {
    return schemaCache.get(name);
  }
  const text = readFileSync(join(SCHEMA_DIR, name), "utf8");
  const schema = JSON.parse(text);
  schemaCache.set(name, schema);
  return schema;
}

/**
 * @param {string} name
 * @returns {any}
 */
export function loadFixture(name) {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), "utf8"));
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

/**
 * @param {unknown} value
 * @param {string} type
 * @returns {boolean}
 */
function matchesType(value, type) {
  const t = typeOf(value);
  if (type === "integer") {
    return t === "number" && Number.isInteger(value);
  }
  if (type === "number") {
    return t === "number";
  }
  return t === type;
}

/**
 * @param {unknown} value
 * @param {any} schema
 * @param {string} path
 * @param {string[]} errors
 */
function check(value, schema, path, errors) {
  if (!schema || typeof schema !== "object") {
    return;
  }
  if (schema.$ref) {
    const base = String(schema.$ref).split("/").pop();
    check(value, loadSchema(base), path, errors);
    return;
  }
  if (schema.type) {
    const expected = Array.isArray(schema.type) ? schema.type : [schema.type];
    const ok = expected.some((t) => matchesType(value, t));
    if (!ok) {
      errors.push(path + ": expected type " + schema.type + " got " + typeOf(value));
    }
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(path + ": value not in enum");
  }
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(path + ": const mismatch");
  }
  const t = typeOf(value);
  if (t === "number" && (schema.minimum !== undefined || schema.maximum !== undefined)) {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(path + ": below minimum " + schema.minimum);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(path + ": above maximum " + schema.maximum);
    }
  }
  if (t === "string") {
    const s = /** @type {string} */ (value);
    if (schema.minLength !== undefined && s.length < schema.minLength) {
      errors.push(path + ": shorter than minLength " + schema.minLength);
    }
    if (schema.maxLength !== undefined && s.length > schema.maxLength) {
      errors.push(path + ": longer than maxLength " + schema.maxLength);
    }
    if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(s)) {
      errors.push(path + ": does not match pattern " + schema.pattern);
    }
  }
  if (schema.properties && t === "object") {
    const obj = /** @type {Record<string, unknown>} */ (value);
    if (schema.required) {
      for (const req of schema.required) {
        if (!(req in obj)) {
          errors.push(path + "." + req + ": required");
        }
      }
    }
    if (schema.minProperties !== undefined && Object.keys(obj).length < schema.minProperties) {
      errors.push(path + ": fewer than minProperties " + schema.minProperties);
    }
    if (schema.maxProperties !== undefined && Object.keys(obj).length > schema.maxProperties) {
      errors.push(path + ": more than maxProperties " + schema.maxProperties);
    }
    for (const [key, sub] of Object.entries(schema.properties)) {
      if (key in obj) {
        check(obj[key], sub, path + "." + key, errors);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in schema.properties)) {
          errors.push(path + "." + key + ": additional not allowed");
        }
      }
    }
  }
  if (schema.items && Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(path + ": fewer than minItems " + schema.minItems);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(path + ": more than maxItems " + schema.maxItems);
    }
    value.forEach((item, i) => check(item, schema.items, path + "[" + i + "]", errors));
  }
}

/**
 * @param {unknown} value
 * @param {any} schema
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(value, schema) {
  const errors = [];
  check(value, schema, "", errors);
  return { valid: errors.length === 0, errors };
}

export const CONTRACT_INDEX = [
  { schema: "action-preview.json", fixture: "action-preview.json" },
  { schema: "action-decision.json", fixture: "action-decision.json" },
  { schema: "action-result.json", fixture: "action-result.json" },
  { schema: "traditional-solve-request.json", fixture: "traditional-solve-request.json" },
  { schema: "traditional-solve-request.json", fixture: "traditional-solve-request-fc27.json" },
  { schema: "traditional-solve-response.json", fixture: "traditional-solve-response.json" },
  { schema: "streamlined-solve-request.json", fixture: "streamlined-solve-request.json" },
  { schema: "streamlined-solve-response.json", fixture: "streamlined-solve-response.json" },
  { schema: "sbc-challenge.json", fixture: "sbc-challenge.json" },
  { schema: "native-message-envelope.json", fixture: "native-message-hello.json" }
];
