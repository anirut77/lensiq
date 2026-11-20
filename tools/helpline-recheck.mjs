#!/usr/bin/env node
// tools/helpline-recheck.mjs — daily re-check of the help-line numbers and hours on each agency's own page (owner order
// 2026-11-14, Part B). For every source in tools/helpline-sources.json it fetches the official page, turns it into plain
// text (scripts, styles and tags removed, entities decoded, whitespace collapsed) and checks that every quoted phrase
// (number + hours, as recorded in docs/CRISIS-RESOURCES.md) is still there. It writes nothing, needs no secrets and is not
// part of the CI gate.
// Owner decision 197 ค (2026-11-21): the GitHub runner often cannot reach the 1669 / 1300 pages, and a fetch failure was
// reported like a changed number. Now:
//   - each page is fetched up to 3 times (back-off 5 s, then 10 s);
//   - three outcomes are reported apart: "ok"; "CHANGED" (the page was read and the number, or the sentence around it, is
//     no longer what we show); "could not fetch" (the page was not read, so nothing is known about the number);
//   - when a phrase is missing, the sentence around the number on the page is read and printed, so the owner sees whether
//     the number itself is gone ("no longer on the page") or only the hours / wording around it changed;
//   - exit 1 (the scheduled workflow fails and GitHub alerts the owner) only for CHANGED. "could not fetch" is a
//     ::warning:: annotation on a passing run: never silent, never counted as a number change.
//   node tools/helpline-recheck.mjs            check every source (network)
//   node tools/helpline-recheck.mjs --selftest check the text extraction and the classification only (no network)
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** the sources file @returns {{tel: string, url: string, phrases: string[]}[]} */
export function loadSources() { return JSON.parse(readFileSync(join(here, "helpline-sources.json"), "utf8")).SOURCES; }

/** page HTML -> plain text with single spaces @param {string} html */
export function pageText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/[\s ​]+/g, " ").normalize("NFC");
}
/** @param {string} s */
const norm = s => String(s).replace(/[\s ​]+/g, " ").normalize("NFC").trim();
/** @param {string} s */
const squash = s => norm(s).replace(/ /g, "");

/** the help-line number in any common spelling (digit groups joined by a dash, a space, a dot or nothing), never inside a longer number
 * @param {string} digits */
export function numberPattern(digits) {
  const d = String(digits).replace(/\D/g, "");
  return new RegExp("(?<![0-9])" + d.split("").join("[\\s.\\-]?") + "(?![0-9])", "g");
}

/** the sentence around each place the pattern matches: from just after the previous sentence end (. ! ? | • ·) to the
 * next one, at most 100 characters each way (cut at a space so no word is split). At most 3 sentences, each once.
 * A full stop between two digits (08.30) or right after a Thai abbreviation letter (โทร. / น.) is not a sentence end.
 * @param {string} text plain text (pageText) @param {RegExp} re a global pattern */
export function sentencesAround(text, re) {
  /** @type {string[]} */
  const out = [];
  const isEnd = (/** @type {number} */ i) => {
    const c = text[i];
    if (!/[.!?|•·]/.test(c)) return false;
    if (c === "." && /[0-9]/.test(text[i - 1] || "") && /[0-9]/.test(text[i + 1] || "")) return false;
    if (c === "." && /[฀-๿]/.test(text[i - 1] || "") && text[i + 1] === " " && /[0-9]/.test(text[i + 2] || "")) return false;
    return true;
  };
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0, end = at + m[0].length;
    let a = at, b = end;
    const lo = Math.max(0, at - 100), hi = Math.min(text.length, end + 100);
    while (a > lo && !isEnd(a - 1)) a--;
    while (b < hi && !isEnd(b)) b++;
    if (b < text.length && isEnd(b)) b++;
    if (a === lo && lo > 0) { const s = text.indexOf(" ", a); if (s >= 0 && s < at) a = s + 1; }
    if (b === hi && hi < text.length) { const s = text.lastIndexOf(" ", b); if (s > end) b = s; }
    const s = text.slice(a, b).trim();
    if (s && !out.includes(s)) out.push(s);
    if (out.length >= 3) break;
  }
  return out;
}

/** classify one phrase on a page that WAS read.
 * "ok": the phrase is there (also when only the spaces differ, "ตลอด24" / "ตลอด 24": noted).
 * "changed", reason "number": the help-line number is nowhere on the page; reason "wording": the number is still on the page
 * but the quoted sentence is not (hours or wording changed). Either way the sentences around the number are returned.
 * A phrase without the help-line number (the 1323 agency's "free, 24 hours" line) is anchored on its own longest number.
 * @param {string} text @param {{tel: string}} src @param {string} phrase */
export function classifyPhrase(text, src, phrase) {
  const t = norm(text), p = norm(phrase);
  if (t.includes(p)) return { status: "ok", phrase };
  if (squash(t).includes(squash(p))) return { status: "ok", phrase, note: "spacing differs on the page" };
  const tel = String(src.tel).replace(/\D/g, "");
  const inPhrase = numberPattern(tel).test(p), onPage = numberPattern(tel).test(t);
  if (inPhrase || onPage) {
    return { status: "changed", phrase, reason: onPage ? "wording" : "number", context: onPage ? sentencesAround(t, numberPattern(tel)) : [] };
  }
  const nums = (p.match(/[0-9]+/g) || []).sort((x, y) => y.length - x.length);
  return { status: "changed", phrase, reason: "wording", context: nums.length ? sentencesAround(t, numberPattern(nums[0])) : [] };
}

const pause = (/** @type {number} */ ms) => new Promise(res => setTimeout(res, ms));

/** fetch a page as plain text, up to `tries` times; throws the last error with the number of attempts
 * @param {string} url
 * @param {{fetchImpl?: (url: string, init?: any) => Promise<any>, tries?: number, wait?: (ms: number) => Promise<unknown>, timeoutMs?: number}} [o] */
export async function fetchText(url, o = {}) {
  const f = o.fetchImpl || globalThis.fetch, tries = o.tries ?? 3, wait = o.wait || pause, timeoutMs = o.timeoutMs ?? 30000;
  let last;
  for (let i = 0; i < tries; i++) {
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      const r = await f(url, { headers: { "User-Agent": "Mozilla/5.0 (helpline re-check)", "Accept-Language": "th,en;q=0.8" }, redirect: "follow", signal: ac.signal });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return pageText(await r.text());
    } catch (e) {
      last = e;
    } finally { clearTimeout(timer); }
    if (i < tries - 1) await wait(5000 * (i + 1));
  }
  throw new Error(`${(last && /** @type {any} */ (last).message) || "fetch failed"} after ${tries} attempts`);
}

/** re-check every source. A page that cannot be fetched goes to `unfetched`; this never throws for one.
 * @param {{tel: string, url: string, phrases: string[]}[]} sources @param {Parameters<typeof fetchText>[1]} [o] */
export async function recheck(sources, o = {}) {
  /** @type {any[]} */
  const ok = [], changed = [], unfetched = [];
  for (const s of sources) {
    let text;
    try { text = await fetchText(s.url, o); } catch (e) { unfetched.push({ tel: s.tel, url: s.url, error: String((e && /** @type {any} */ (e).message) || e) }); continue; }
    for (const ph of s.phrases) {
      const r = classifyPhrase(text, s, ph);
      (r.status === "ok" ? ok : changed).push({ tel: s.tel, url: s.url, ...r });
    }
  }
  return { ok, changed, unfetched };
}

/** the report lines and the exit code (1 only when a page that was read changed)
 * @param {{ok: any[], changed: any[], unfetched: any[]}} r @param {number} nSources */
export function report(r, nSources) {
  const out = [];
  for (const x of r.ok) out.push(`ok   ${x.tel} ${x.url}: "${x.phrase}"${x.note ? " (" + x.note + ")" : ""}`);
  for (const x of r.changed) {
    const why = x.reason === "number" ? "the number " + x.tel + " is no longer on the page"
      : "the number is still on the page, but the quoted sentence is not (hours or wording changed)";
    out.push(`::error title=Help line CHANGED (${x.tel})::${x.url}: "${x.phrase}" not found: ${why}`);
    out.push(`CHANGED ${x.tel} ${x.url}: "${x.phrase}" not found: ${why}`);
    for (const c of x.context || []) out.push(`        sentence on the page: "${c}"`);
    if (!(x.context || []).length) out.push("        sentence on the page: (none found around the number)");
  }
  for (const x of r.unfetched) {
    out.push(`::warning title=Help line page could not be fetched (${x.tel})::${x.url}: ${x.error}. Not a number change; open the page by hand.`);
    out.push(`could not fetch ${x.tel} ${x.url}: ${x.error} (not a number change; check the page by hand)`);
  }
  out.push("");
  out.push(`Summary: ${nSources} pages; ${r.ok.length} phrases ok; ${r.changed.length} CHANGED; ${r.unfetched.length} could not fetch.`);
  if (r.changed.length) out.push("Help-line re-check FAILED: a number or its sentence changed (docs/CRISIS-RESOURCES.md, Scheduled re-check).");
  else if (r.unfetched.length) out.push("Help-line re-check: no change on the pages that were read; some pages could not be fetched (warnings above).");
  else out.push(`Help-line re-check: all ${nSources} official pages still state the numbers and hours we show.`);
  return { exitCode: r.changed.length ? 1 : 0, out };
}

/** no-network self-test of the extraction and the classification (fixed strings only); null = OK, else the problem */
export function selftest() {
  const t = pageText('<p>สายด่วน <b>1300</b>&nbsp;เปิด</p><script>x="1669"</script>');
  if (t.trim() !== "สายด่วน 1300 เปิด") return "extraction: " + JSON.stringify(t);
  const src = { tel: "1300" }, ph = "สายด่วน 1300 เปิดให้บริการตลอดเวลา 24 ชั่วโมง 7 วัน";
  /** @type {[string, string, string | undefined][]} */
  const cases = [
    ["<p>สายด่วน 1300 เปิดให้บริการตลอดเวลา 24 ชั่วโมง 7 วัน</p>", "ok", undefined],
    ["<p>สายด่วน 1300 เปิดให้บริการตลอดเวลา 24ชั่วโมง 7 วัน</p>", "ok", undefined],
    ["<p>ติดต่อ. สายด่วน 1300 เปิดให้บริการ 08:30-16:30 น. ในวันทำการ</p>", "changed", "wording"],
    ["<p>สายด่วน 1399 เปิดให้บริการตลอดเวลา 24 ชั่วโมง 7 วัน</p>", "changed", "number"]
  ];
  for (const [html, st, why] of cases) {
    const r = classifyPhrase(pageText(html), src, ph);
    if (r.status !== st || r.reason !== why) return "classification: " + html + " -> " + JSON.stringify(r);
  }
  return null;
}

async function main() {
  if (process.argv.includes("--selftest")) {
    const bad = selftest();
    if (bad) { console.error("selftest failed: " + bad); process.exit(1); }
    console.log("helpline-recheck selftest OK"); process.exit(0);
  }
  const sources = loadSources();
  const { exitCode, out } = report(await recheck(sources), sources.length);
  for (const l of out) (exitCode && /^(CHANGED|::error)/.test(l) ? console.error : console.log)(l);
  process.exit(exitCode);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
