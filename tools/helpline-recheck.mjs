#!/usr/bin/env node
// tools/helpline-recheck.mjs — daily re-check of the help-line numbers and hours on each agency's own page (owner order
// 2026-11-14, Part B). For every source in tools/helpline-sources.json it fetches the official page, turns it into plain
// text (scripts, styles and tags removed, entities decoded, whitespace collapsed) and checks that every quoted phrase
// (number + hours, as recorded in docs/CRISIS-RESOURCES.md) is still there. Exit 1 lists every page that changed or could
// not be fetched, so the scheduled workflow (.github/workflows/helpline-recheck.yml) fails and GitHub alerts the owner.
// It writes nothing, needs no secrets and is not part of the CI gate.
//   node tools/helpline-recheck.mjs            check every source (network)
//   node tools/helpline-recheck.mjs --selftest check the text extraction only (no network)
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const { SOURCES } = JSON.parse(readFileSync(join(here, "helpline-sources.json"), "utf8"));
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** page HTML -> plain text with single spaces @param {string} html */
export function pageText(html) {
  return String(html)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&([a-z]+);/gi, (m, n) => ENT[n.toLowerCase()] ?? m)
    .replace(/[\s ​]+/g, " ").normalize("NFC");
}
const norm = s => String(s).replace(/[\s ​]+/g, " ").normalize("NFC").trim();

async function fetchText(url) {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      const ac = new AbortController(), t = setTimeout(() => ac.abort(), 30000);
      const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (helpline re-check)", "Accept-Language": "th,en;q=0.8" }, redirect: "follow", signal: ac.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error("HTTP " + r.status);
      return pageText(await r.text());
    } catch (e) { last = e; await new Promise(res => setTimeout(res, 5000 * (i + 1))); }
  }
  throw last;
}

if (process.argv.includes("--selftest")) {
  const t = pageText('<p>สายด่วน <b>1300</b>&nbsp;เปิด</p><script>x="1669"</script>');
  if (t.trim() !== "สายด่วน 1300 เปิด") { console.error("selftest failed: " + JSON.stringify(t)); process.exit(1); }
  console.log("helpline-recheck selftest OK"); process.exit(0);
}

const problems = [];
for (const s of SOURCES) {
  let text;
  try { text = await fetchText(s.url); } catch (e) { problems.push(`${s.tel} ${s.url}: could not fetch (${e && e.message}) — check the page by hand`); continue; }
  for (const ph of s.phrases) {
    if (!text.includes(norm(ph))) problems.push(`${s.tel} ${s.url}: the phrase "${ph}" is no longer on the page — re-check the number and hours`);
    else console.log(`ok   ${s.tel} ${s.url}: "${ph}"`);
  }
}
if (problems.length) {
  console.error("\nHelp-line re-check FAILED (docs/CRISIS-RESOURCES.md, Scheduled re-check):\n- " + problems.join("\n- "));
  process.exit(1);
}
console.log(`\nHelp-line re-check: all ${SOURCES.length} official pages still state the numbers and hours we show.`);
