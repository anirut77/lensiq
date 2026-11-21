// tests/e2e/compat-v2.e2e.mjs — FIXED TEST SET, Compatibility v2 (owner night order A6, 2026-11-20; spec: the owner's eight points
// of 2026-11-17). Written and locked (~/LENSIQ-field/evals/compat-v2/, evals-locks/compat-v2.sha256) BEFORE compat-v2.js exists.
// Headless Chrome, phone width. Unit half and the scope of this slice: tests/unit/compat-v2.test.js.
//   O1 switch OFF (the live and customer builds): for 3 fixed synthetic pairs (couple 14/2/1990 + 3/8/1992, business 9/5/1985 +
//      21/11/1988, family 1/1/1970 + 30/6/2001; nicknames Ann / Ben) in TH / EN / ZH at 390 px, the sha256 of #cpResult's HTML equals
//      the value recorded from origin/main 653029d3 before any change (byte-identical page), and compat-v2.js is never requested.
//   O2 switch ON (window.LENSIQ_COMPAT_V2 = true before the page scripts): the couple pair in TH / EN / ZH shows the overall harmony
//      view, 7 level rows each with its label text, an icon and a colour (never colour alone), the not-a-verdict line, 7 category
//      cards each opening with a sentence and a source line; detail (reason + what to do) only for 2 cards; no score figure in the
//      result text; nothing marked data-lq-paid; at 360 / 390 / 430 px no horizontal scroll and no text below 12 px in the result.
//   O3 switch ON, crisis v3: a crisis phrase typed for real into the first nickname (consent ticked, dates valid) in TH / EN / ZH:
//      the crisis state is set, no card, the v2 reading is shown in the free tier, nothing marked paid, exactly one closing line
//      with tel:1323 only, at the end of the result; no echo of the phrase. Phrases: the first 12 of MUST60 in
//      tests/unit/fortune-crisis-net-3.test.js (read at run time) plus อยากตายจริงๆ, I want to die tonight, 我不想活了.
//   O4 switch ON, group of 3: the v1 group page (map, roles) as before; no v2 view.
//   O5 switch ON, language switch after a reading redraws the v2 view in the new language.
// RE-LOCK 1 (2026-11-21, independent review of a73a8136, finding F6; ~/LENSIQ-field/evals/compat-v2/relock1/): O6 added, nothing
//   else changed. O6 switch ON with a v2 renderer that throws (window.LQCompatV2 replaced before the page loads): the page falls
//   back to the v1 reading (wheel), the result box is not empty, and with a crisis phrase typed into the nickname exactly one
//   closing line with tel:1323 only ends the result (TH / EN / ZH); the error goes to the console only (no message on the page).
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const CASES = [["couple", [14, 2, 1990], [3, 8, 1992]], ["business", [9, 5, 1985], [21, 11, 1988]], ["family", [1, 1, 1970], [30, 6, 2001]]];
// recorded from origin/main 653029d3 (unchanged compat files), 390 px, before any v2 code; stable over two runs
const GOLDEN = {
  "th:couple": "022f23887722008ca5fa7d5d7c0b2ded0f128414db767c6d740193e3d0972d03",
  "th:business": "98510ac6fb3ab36ae8b6e6afe243f6c4b572b4012326a18ef822f62e9862127d",
  "th:family": "d47d96da704ea1934edd3be5a50bd4acb66e8efa1c0769f25270573a634dc99d",
  "en:couple": "1e4013f0e4b80871982ea31f8b9d3984ae0ef7b52b9a5d52dd429deb483d0f5c",
  "en:business": "c35089d51ed9aeb9d82fbe6d5078e15fa0388ce93714e66734e0af77f8f68939",
  "en:family": "07b9f0c027090e1df2d42526b2409fd44a6ff0596e31ae2b1bf29c38a80d9872",
  "zh:couple": "37ae79ae7e742d78a820a83acc7e7a6ec0b272520feecaa8686176c9f2443c46",
  "zh:business": "6ed37bd6b058c3970907f33b4408a884ec444bab41f8675fe4f9fb53b4ced7cc",
  "zh:family": "df03e11369b1f146aae59ba60cb65b620d730d7fcfba5138fde1a1136c11de72",
};
const LABELS = { th: ["เสริมกัน", "ไปด้วยกันได้", "ต้องใส่ใจ"], en: ["Supports each other", "Goes along well enough", "Needs some care"], zh: ["相互助力", "可以同行", "需要留心"] };
const NOT_VERDICT = { th: "ระดับนี้บอกว่าเรื่องไหนควรใส่ใจ ไม่ใช่คำตัดสินความสัมพันธ์", en: "These levels show where to put care; they are not a verdict on the relationship.", zh: "这些等级只说明哪里需要用心，并不是对关系的评判。" };

function phrases() {
  const src = readFileSync(join(here, "..", "unit", "fortune-crisis-net-3.test.js"), "utf8");
  const m = /const MUST60 = (\[[\s\S]*?\n\]);/.exec(src);
  if (!m) throw new Error("MUST60 not found in tests/unit/fortune-crisis-net-3.test.js");
  return [...new Set(new Function("return " + m[1])().map(x => x[2]).slice(0, 12).concat(["อยากตายจริงๆ", "I want to die tonight", "我不想活了"]))];
}
async function open(browser, base, lang, v2, width = 390) {
  const init = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`];
  if (v2) init.push("window.LENSIQ_COMPAT_V2 = true;");
  const page = await browser.newPage(null, { isolated: true, initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 844, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/compat.html?nosw`);
  await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])} && !!window.LQCompat && !!document.getElementById("cpGo")`, 15000);
  await sleep(300);
  return page;
}
const fillPair = (rel, a, b, nicks = ["Ann", "Ben"]) => `(async () => { const c = document.getElementById("cpConsent"); if (!c.checked) c.click();
  const set = (fs, q, v) => { const e = document.querySelector('[data-cp-person="' + fs + '"] ' + q); e.value = v; e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); };
  const r = document.getElementById("cpRel"); r.value = ${S(rel)}; r.dispatchEvent(new Event("change"));
  const P = [${S(a)}, ${S(b)}], N = ${S(nicks)};
  P.forEach((p, i) => { set(i, "select[name=d]", String(p[0])); set(i, "select[name=m]", String(p[1])); set(i, "input[name=y]", String(p[2])); if (N[i] != null) set(i, "input[name=nick]", N[i]); });
  return true; })()`;
const go = sel => `(async () => { document.getElementById("cpGo").click();
  for (let k = 0; k < 150 && !document.querySelector(${S(sel)}); k++) await new Promise(r => setTimeout(r, 100));
  await new Promise(r => setTimeout(r, 400)); return !!document.querySelector(${S(sel)}); })()`;
const REQUESTED_V2 = `performance.getEntriesByType("resource").some(e => /compat-v2\\.js/.test(e.name)) || [...document.scripts].some(s => /compat-v2\\.js/.test(s.src))`;
const V2STATE = `(() => { const r = document.getElementById("cpResult"), vis = e => !!e && e.getClientRects().length > 0;
  const rows = [...r.querySelectorAll("[data-cv2-level]")].map(x => ({ label: (x.querySelector("[data-cv2-label]") || {}).textContent || "",
    icon: !!x.querySelector("svg[data-cv2-icon]"), color: getComputedStyle(x).getPropertyValue("--lv-color").trim() }));
  const cards = [...r.querySelectorAll("[data-cv2-cat]")].map(x => ({ opener: ((x.querySelector("[data-cv2-opener]") || {}).textContent || "").trim(),
    source: ((x.querySelector("[data-cv2-source]") || {}).textContent || "").trim(), detail: !!x.querySelector("[data-cv2-todo]") }));
  const text = r.innerText;
  let small = 0; r.querySelectorAll("*").forEach(e => { if (vis(e) && e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12) small++; });
  return { harmony: vis(r.querySelector("[data-cv2-harmony]")), rows, cards, notVerdict: ((r.querySelector("[data-cv2-notverdict]") || {}).textContent || "").trim(),
    paid: r.querySelectorAll("[data-lq-paid]").length, text, small, v1: !!r.querySelector("[data-compat-wheel], [data-compat-agree]"),
    hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    map: !!r.querySelector("[data-compat-map]"), roles: r.querySelectorAll("[data-compat-role]").length,
    state: document.documentElement.getAttribute("data-lq-crisis") === "1", card: [...document.querySelectorAll(".fa-support, .fa-soft")].some(vis),
    close: [...r.querySelectorAll(".lq-helpline")].filter(vis).map(c => ({ tels: [...c.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute("href")),
      atEnd: r.lastElementChild === c || r.lastElementChild.contains(c) })) }; })()`;
const SCORE = /\d+(?:\.\d+)?\s*(?:\/|จาก|of)\s*\d+|%|คะแนน|\bscor\w*|满分|得分|分数/i;
const TEXT = `(() => { const c = document.body.cloneNode(true);
  c.querySelectorAll(".fa-support, #lqHelpTop, .lq-helpline-result, script, style, input, select, textarea, option").forEach(e => e.remove());
  return c.innerText.replace(/\\s+/g, ""); })()`;
function noEcho(before, after, phrase) {
  const t = phrase.toLowerCase().replace(/\s+/g, ""), words = phrase.toLowerCase().split(/\s+/).filter(Boolean), subs = new Set([t]);
  const a = after.toLowerCase(), b = before.toLowerCase();
  if (!/[฀-๿㐀-鿿]/.test(t) && words.length >= 3) for (let i = 0; i + 3 <= words.length; i++) subs.add(words.slice(i, i + 3).join(""));
  else { const n = /[㐀-鿿]/.test(t) ? 3 : /[฀-๿]/.test(t) ? 7 : 5; for (let i = 0; i + n <= t.length; i++) subs.add(t.slice(i, i + n)); }
  return [...subs].filter(p => a.includes(p) && !b.includes(p));
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("O1 switch off: the result HTML is byte-identical to origin/main for 3 pairs x TH / EN / ZH; compat-v2.js never loaded", async () => {
      const bad = [];
      for (const lang of LANGS) for (const [rel, a, b] of CASES) {
        const page = await open(browser, base, lang, false);
        try {
          await page.evaluate(fillPair(rel, a, b));
          assert(await page.evaluate(go("#cpResult [data-compat-overview]")), "reading shown");
          const html = await page.evaluate(`document.getElementById("cpResult").innerHTML`);
          const h = createHash("sha256").update(html).digest("hex");
          if (h !== GOLDEN[lang + ":" + rel]) bad.push(`${lang}:${rel} ${h} (len ${html.length})`);
          if (await page.evaluate(REQUESTED_V2)) bad.push(`${lang}:${rel} compat-v2.js was requested with the switch off`);
        } finally { await page.close(); }
      }
      assert(bad.length === 0, bad.join("\n"));
    });

    await check("O2 switch on: harmony, 7 labelled levels with icon and colour, not-a-verdict, 7 cards, 2 with detail, no score, no paid, 360/390/430 px", async () => {
      const bad = [];
      for (const lang of LANGS) for (const width of [360, 390, 430]) {
        const page = await open(browser, base, lang, true, width);
        try {
          await page.evaluate(fillPair("couple", [14, 2, 1990], [3, 8, 1992]));
          if (!(await page.evaluate(go("#cpResult [data-cv2-harmony]")))) { bad.push(`${lang}@${width}: no v2 view`); continue; }
          const st = await page.evaluate(V2STATE), tag = `${lang}@${width}`;
          if (!st.harmony) bad.push(tag + ": harmony view not visible");
          if (st.v1) bad.push(tag + ": v1 wheel / agreement table still drawn");
          if (st.rows.length !== 7) bad.push(tag + ": level rows " + st.rows.length);
          for (const r of st.rows) if (!LABELS[lang].includes(r.label.trim()) || !r.icon || !/^#[0-9a-f]{6}$/i.test(r.color)) bad.push(tag + ": level row " + S(r));
          if (st.notVerdict !== NOT_VERDICT[lang]) bad.push(tag + ": not-a-verdict line " + S(st.notVerdict));
          if (st.cards.length !== 7 || st.cards.some(c => !c.opener || !c.source)) bad.push(tag + ": cards " + S(st.cards));
          if (st.cards.filter(c => c.detail).length !== 2) bad.push(tag + ": detail cards " + st.cards.filter(c => c.detail).length);
          if (SCORE.test(st.text)) bad.push(tag + ": score figure in the text: " + (st.text.match(SCORE) || [])[0]);
          if (st.paid) bad.push(tag + ": data-lq-paid " + st.paid);
          if (st.hscroll) bad.push(tag + ": horizontal scroll");
          if (st.small) bad.push(tag + ": text below 12 px: " + st.small);
        } finally { await page.close(); }
      }
      assert(bad.length === 0, bad.join("\n"));
    });

    await check("O3 switch on, crisis v3: reading in the free tier, nothing paid, one closing 1323 line at the end, no card, no echo", async () => {
      const list = phrases(), bad = [];
      assert(list.length >= 13, "phrases " + list.length);
      for (const [i, phrase] of list.entries()) {
        const lang = LANGS[i % 3], page = await open(browser, base, lang, true);
        try {
          await page.evaluate(fillPair("couple", [14, 2, 1990], [3, 8, 1992], [null, "Ben"]));
          const before = await page.evaluate(TEXT);
          await page.evaluate(`(() => { const e = document.getElementById("cpNick0"); e.focus(); e.value = ""; return true; })()`);
          await page.send("Input.insertText", { text: phrase });
          await sleep(150);
          await page.evaluate(go("#cpResult [data-cv2-harmony]"));
          await sleep(500);
          const st = await page.evaluate(V2STATE), after = await page.evaluate(TEXT), echo = noEcho(before, after, phrase);
          const ok = st.state && !st.card && st.harmony && st.paid === 0 && st.close.length === 1 && S(st.close[0].tels) === S(["tel:1323"]) && st.close[0].atEnd && !echo.length;
          if (!ok) bad.push(`[${lang}] ${phrase}: ${S({ state: st.state, card: st.card, harmony: st.harmony, paid: st.paid, close: st.close, echo })}`);
        } finally { await page.close(); }
      }
      assert(bad.length === 0, `${bad.length} of ${list.length}:\n` + bad.join("\n"));
    });

    await check("O4 switch on, group of 3: the v1 group page, no v2 view", async () => {
      const page = await open(browser, base, "th", true);
      try {
        await page.evaluate(`(() => { document.getElementById("cpTabGroup").click(); return true; })()`);
        await sleep(200);
        await page.evaluate(`(() => { const c = document.getElementById("cpConsent"); if (!c.checked) c.click();
          const P = [[14, 2, 1990], [3, 8, 1992], [9, 5, 1985]];
          P.forEach((p, i) => { const fs = document.querySelector('[data-cp-person="' + i + '"]');
            const set = (q, v) => { const e = fs.querySelector(q); e.value = v; e.dispatchEvent(new Event("change", { bubbles: true })); };
            set("select[name=d]", String(p[0])); set("select[name=m]", String(p[1])); set("input[name=y]", String(p[2])); });
          return true; })()`);
        assert(await page.evaluate(go("#cpResult [data-compat-map]")), "group map shown");
        const st = await page.evaluate(V2STATE);
        assert(st.map && st.roles === 3 && !st.harmony, "v1 group: " + S({ map: st.map, roles: st.roles, harmony: st.harmony }));
      } finally { await page.close(); }
    });

    await check("O5 switch on: changing the language redraws the v2 view", async () => {
      const page = await open(browser, base, "th", true);
      try {
        await page.evaluate(fillPair("couple", [14, 2, 1990], [3, 8, 1992]));
        assert(await page.evaluate(go("#cpResult [data-cv2-harmony]")), "v2 view");
        const nv = await page.evaluate(`(async () => { window.LQI18N.setLang("en");
          for (let k = 0; k < 40 && document.documentElement.lang !== "en"; k++) await new Promise(r => setTimeout(r, 100));
          await new Promise(r => setTimeout(r, 500));
          return ((document.querySelector("#cpResult [data-cv2-notverdict]") || {}).textContent || "").trim(); })()`);
        assert(nv === NOT_VERDICT.en, "redrawn in English: " + S(nv));
      } finally { await page.close(); }
    });
    await check("O6 switch on, v2 renderer throws: v1 reading shown, closing 1323 line at the end, nothing on the page about the error", async () => {
      const bad = [];
      for (const [i, lang] of LANGS.entries()) {
        const phrase = ["อยากตายจริงๆ", "I want to die tonight", "我不想活了"][i];
        const init = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`, "window.LENSIQ_COMPAT_V2 = true;",
          "window.LQCompatV2 = { render() { throw new Error('forced v2 failure (test O6)'); } };"];
        const page = await browser.newPage(null, { isolated: true, initScripts: init });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
          await page.goto(`${base}/compat.html?nosw`);
          await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])} && !!window.LQCompat && !!document.getElementById("cpGo")`, 15000);
          await sleep(300);
          await page.evaluate(fillPair("couple", [14, 2, 1990], [3, 8, 1992], [null, "Ben"]));
          await page.evaluate(`(() => { const e = document.getElementById("cpNick0"); e.focus(); e.value = ""; return true; })()`);
          await page.send("Input.insertText", { text: phrase });
          await sleep(150);
          await page.evaluate(go("#cpResult [data-compat-wheel]"));
          await sleep(500);
          const st = await page.evaluate(V2STATE);
          const msg = await page.evaluate(`(document.getElementById("cpMsg") || {}).textContent || ""`);
          const ok = st.v1 && !st.harmony && st.text.trim().length > 200 && st.close.length === 1 && S(st.close[0].tels) === S(["tel:1323"]) && st.close[0].atEnd &&
            !/forced v2 failure/.test(st.text + msg);
          if (!ok) bad.push(`[${lang}] ${S({ v1: st.v1, harmony: st.harmony, len: st.text.length, close: st.close, msg })}`);
        } finally { await page.close(); }
      }
      assert(bad.length === 0, bad.join("\n"));
    });
  } finally { await browser.close(); }
}
