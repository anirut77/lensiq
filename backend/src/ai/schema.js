// @ts-check
// backend/src/ai/schema.js — small JSON-Schema validator for the subset the gateway's output schemas use:
//   type (string or array: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null"; nullable = a type
//   array with "null"), properties, required, additionalProperties (false = no extra keys), enum, items, maxLength.
// Every model result is validated here, in the gateway — never trusted from an adapter or a provider's JSON mode.
// Error messages carry the JSON path and the rule only, never the value (a value may be user text).

const KNOWN = new Set(["type", "properties", "required", "additionalProperties", "enum", "items", "maxLength", "description", "title"]);
const TYPES = new Set(["object", "array", "string", "number", "integer", "boolean", "null"]);

/** Throws when a schema uses a keyword this validator does not implement (so nothing is silently unchecked).
 * @param {any} schema @param {string} [path] */
export function assertSupportedSchema(schema, path = "$") {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error(`schema at ${path} must be an object`);
  for (const k of Object.keys(schema)) if (!KNOWN.has(k)) throw new Error(`unsupported schema keyword "${k}" at ${path}`);
  const types = schema.type == null ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  for (const t of types) if (!TYPES.has(t)) throw new Error(`unsupported type "${t}" at ${path}`);
  if (schema.additionalProperties != null && typeof schema.additionalProperties !== "boolean") throw new Error(`unsupported additionalProperties schema at ${path}`);
  if (schema.properties) for (const [k, s] of Object.entries(schema.properties)) assertSupportedSchema(s, `${path}.${k}`);
  if (schema.items) assertSupportedSchema(schema.items, `${path}[]`);
}

/** @param {any} v @returns {string} */
function typeOf(v) {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  if (typeof v === "number") return Number.isInteger(v) ? "integer" : "number";
  return typeof v;
}

/**
 * @param {any} schema @param {any} value @param {string} [path]
 * @returns {string[]} errors (empty = valid); at most 20
 */
export function validateJson(schema, value, path = "$") {
  /** @type {string[]} */
  const errs = [];
  const walk = (s, v, p) => {
    if (errs.length >= 20) return;
    if (s.type != null) {
      const allowed = Array.isArray(s.type) ? s.type : [s.type];
      const t = typeOf(v);
      if (!allowed.includes(t) && !(t === "integer" && allowed.includes("number"))) { errs.push(`${p}: expected ${allowed.join("|")}`); return; }
    }
    if (s.enum && !s.enum.some(e => e === v)) { errs.push(`${p}: not in enum`); return; }
    if (typeof v === "string" && s.maxLength != null && [...v].length > s.maxLength) errs.push(`${p}: longer than ${s.maxLength}`);
    if (Array.isArray(v) && s.items) v.forEach((x, i) => walk(s.items, x, `${p}[${i}]`));
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const props = s.properties || {};
      for (const r of s.required || []) if (!Object.prototype.hasOwnProperty.call(v, r)) errs.push(`${p}: missing ${r}`);
      for (const [k, x] of Object.entries(v)) {
        if (Object.prototype.hasOwnProperty.call(props, k)) walk(props[k], x, `${p}.${k}`);
        else if (s.additionalProperties === false) errs.push(`${p}: extra key not allowed`);
      }
    }
  };
  walk(schema, value, path);
  return errs;
}
