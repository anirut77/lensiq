// @ts-check
// backend/src/line-config.js — the ONE format check of the two LINE notification secrets (owner order 2026-11-15, "LINE
// lead notification is never silent"). Used by the Worker (leads.js: notifyLine, the admin status line) and by
// `npm run secrets:setup` (tools/secrets-setup.mjs) at entry. Spaces and line breaks around a value are trimmed first, so
// a pasted trailing newline is never a failure. The answer is a short reason code; the value itself is never returned,
// logged or stored.
//   LINE_CHANNEL_ACCESS_TOKEN  missing | whitespace (inside) | too_short (< 20 characters)
//   LEAD_NOTIFY_LINE_TO        missing | starts_with_at (the "@..." OA id was pasted) | whitespace | wrong_length (not 33) |
//                              not_u32hex (not "U" + 32 lowercase hex)

export const LINE_SECRETS = Object.freeze(["LINE_CHANNEL_ACCESS_TOKEN", "LEAD_NOTIFY_LINE_TO"]);
export const LINE_TO_RE = /^U[0-9a-f]{32}$/; // the owner's LINE user ID (LINE Developers console: Basic settings)
export const LINE_TOKEN_MIN = 20;

/** Trimmed text of a secret value (spaces, tabs and line breaks around it removed). @param {unknown} v */
export const trimSecret = v => String(v == null ? "" : v).trim();

/** Reason code for a LINE secret value, "" when it is usable (or the name is not a LINE secret).
 *  @param {string} name @param {unknown} raw @returns {string} */
export function lineSecretProblem(name, raw) {
  const v = trimSecret(raw);
  if (name === "LINE_CHANNEL_ACCESS_TOKEN") {
    if (!v) return "missing";
    if (/\s/.test(v)) return "whitespace";
    if (v.length < LINE_TOKEN_MIN) return "too_short";
    return "";
  }
  if (name === "LEAD_NOTIFY_LINE_TO") {
    if (!v) return "missing";
    if (v.startsWith("@")) return "starts_with_at";
    if (/\s/.test(v)) return "whitespace";
    if (v.length !== 33) return "wrong_length";
    if (!LINE_TO_RE.test(v)) return "not_u32hex";
    return "";
  }
  return "";
}

/** Live check of the Worker's two LINE secrets: names + reason codes only. @param {any} env
 *  @returns {{secret: string, reason: string}[]} */
export function lineConfigProblems(env) {
  /** @type {{secret: string, reason: string}[]} */
  const out = [];
  for (const secret of LINE_SECRETS) {
    const reason = lineSecretProblem(secret, env && env[secret]);
    if (reason) out.push({ secret, reason });
  }
  return out;
}

/** Plain English for the setup tool (the admin page has its own TH / EN / ZH texts). Never quotes the value. */
export const LINE_REASON_TEXT = Object.freeze({
  missing: "it is empty",
  whitespace: "there is a space or line break inside it (copy it again without spaces)",
  too_short: `it is too short: a channel access token has at least ${LINE_TOKEN_MIN} characters (LINE Developers console -> Messaging API -> Channel access token)`,
  starts_with_at: 'it starts with "@": that is the LINE Official Account ID, not your user ID. Use "Your user ID" from LINE Developers console -> Basic settings',
  wrong_length: "it must be exactly 33 characters: U followed by 32 characters (0-9, a-f)",
  not_u32hex: "it must be U followed by 32 characters 0-9 and a-f in lowercase (LINE Developers console -> Basic settings -> Your user ID)"
});
