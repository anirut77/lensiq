// tests/e2e/fortune-crisis-session.e2e.mjs — FIXED TEST SET, crisis fix 4 (incident 2026-11-12: straight mode switched OFF after
// the fresh independent crisis review). Locked BEFORE the product change (sha256 in ~/LENSIQ-field/evals/fortune-honest/locked.sha256).
// Straight mode is forced ON here by an init script (the shipped flag stays false) with an adult who chose it, i.e. the worst case.
// (a) calm() sees typed crisis text on every fortune page whatever the script order (horoscope, numbers, tarot, palm, faceread
//     and fengshui load fortune-straight.js before fortune-crisis.js).
// (b) once the support card has been shown, every fortune page in the same tab is calm: no straight reading, no visible
//     data-lq-remedy block, no paid / merit offer, and the help line visible. One sessionStorage boolean, no timestamp, no text.
//     A new tab is not affected. Storage blocked: the page-level behaviour stays, no script error.
// (c) soft step → "Just the reading": a gentle reading only for the rest of the session, no remedies, and the help line IN THE
//     VIEWPORT next to the reading (the 1323 link fully inside the visible area), not merely in the DOM.
// (d) the 12 inputs the fresh review missed (dev data; the fresh set is spent) reach the support card on tarot and dream;
//     the control "อยากตายเพราะหัวเราะ ตลกมาก" does not show the card.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FLAG_ON = `Object.defineProperty(window, "LENSIQ_FORTUNE_STRAIGHT", { configurable: true, get: () => true, set: () => {} });`;
const ADULT = `try { localStorage.setItem("lq-fortune-straight", JSON.stringify({ adult: true, straight: true })); } catch (e) {}`;
const NO_STORAGE = `Object.defineProperty(window, "sessionStorage", { configurable: true, get() { throw new DOMException("blocked", "SecurityError"); } });`;
const FORTUNE = ["horoscope", "numbers", "tarot", "palm", "faceread", "fengshui", "dream", "zodiac", "iching", "bazi", "taksa", "lek7", "astro", "lifegraph", "report"];
const setVal = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;

/** what the user can see; sc = the reading's section */
const SNAP = sc => `(() => {
  const vis = e => { if (!e || e.closest("[hidden]")) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false;
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const full = e => { if (!vis(e)) return false; const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; };
  const box = document.querySelector(${S(sc)}) || document.body;
  const secs = [...box.querySelectorAll(".fa-section")].filter(vis);
  const straight = secs.filter(s => { const h = s.closest("[data-fa-mode]"); return h && h.getAttribute("data-fa-mode") === "straight"; }).length;
  const tel = [...box.querySelectorAll(".lq-helpline .lq-helpline-tel")].concat([...document.querySelectorAll(".fa-support .fa-tel")]).filter(a => /1323/.test(a.textContent));
  return { sections: secs.length, straight, support: [...document.querySelectorAll(".fa-support")].some(vis), soft: [...document.querySelectorAll(".fa-soft")].some(vis),
    remedies: [...document.querySelectorAll("[data-lq-remedy]")].filter(vis).map(e => e.id || e.className || e.tagName),
    paid: [...document.querySelectorAll("[data-lq-upsell], [data-lq-paid], [data-lq-merit]")].filter(vis).length,
    helpOnPage: tel.some(vis), helpInView: tel.some(full) };
})()`;
const READY = sc => `(() => { const b = document.querySelector(${S(sc)}); if (!b) return false; const v = e => !e.closest("[hidden]") && e.getBoundingClientRect().height > 0;
  return [...document.querySelectorAll(".fa-support, .fa-soft")].some(v) || ([...b.querySelectorAll(".fa-section")].filter(v).length >= 2
    && ![...b.querySelectorAll(".fa-section")].some(s => /กำลังเรียบเรียง/.test(s.textContent))); })()`;
async function settle(page, sc) { await page.waitFor(READY(sc), 25000); await sleep(1500); return page.evaluate(SNAP(sc)); }
const clickGo = () => { const b = [...document.querySelectorAll('.fa-soft [data-soft="go"]')].find(x => x.getBoundingClientRect().height > 0); b.click(); };
const clickTalk = () => { const b = [...document.querySelectorAll('.fa-soft [data-soft="talk"]')].find(x => x.getBoundingClientRect().height > 0); b.click(); };
async function tarotPick(page) {
  await page.waitFor(() => !document.getElementById("trPick").hidden, 10000);
  await page.evaluate(() => document.getElementById("trAuto").click()); await sleep(900);
  await page.evaluate(() => document.getElementById("trReveal").click());
}
/** how each page is asked for a reading */
const RUN = {
  tarot: { url: "tarot.html", sc: "#trResult", async ask(page, t) {
    await page.evaluate(q => { document.getElementById("trQuestion").value = q; document.getElementById("trStart").click(); }, t); await sleep(400);
  } },
  dream: { url: "dream.html", sc: "#drResult", async ask(page, t) {
    await page.evaluate(setVal("drText", t)); await sleep(300);
    await page.evaluate(() => { if (!document.querySelector("#drSel .dr-x")) { const p = document.querySelector(".dr-pop"); if (p) p.click(); }
      const m = document.querySelector('input[name="drMood"]'); if (m) m.click(); const x = document.querySelector('input[name="drTime"]'); if (x) x.click();
      document.getElementById("drForm").requestSubmit(); });
  } },
  horoscope: { url: "horoscope.html", sc: "#hsResult", async ask(page, t) {
    await page.evaluate(setVal("hsName", t)); await page.evaluate(setVal("hsDay", "15")); await page.evaluate(setVal("hsMonth", "8")); await page.evaluate(setVal("hsYear", "1990"));
    await page.evaluate(() => document.getElementById("hsGo").click());
  } },
  numbers: { url: "numbers.html", sc: "#nmResult", async ask(page, t) {
    await page.evaluate(setVal("nmName", t)); await page.evaluate(() => { document.getElementById("nmPhone").value = "0823456789"; document.getElementById("nmGo").click(); });
  } },
  zodiac: { url: "zodiac.html", sc: "#zdResult", async ask(page) {
    await page.evaluate(() => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); });
  } },
};
/** ask for a reading; a tarot reading also needs the cards picked */
async function read(page, name, text, { go = false } = {}) {
  const P = RUN[name];
  await page.goto(`${process.env.__LQ_BASE}/${P.url}`); await sleep(300);
  await P.ask(page, text);
  if (go) {
    await page.waitFor(() => [...document.querySelectorAll(".fa-soft")].some(e => e.getBoundingClientRect().height > 0), 15000);
    await page.evaluate(clickGo); await sleep(300);
  }
  if (name === "tarot" && !(await page.evaluate(() => [...document.querySelectorAll(".fa-support, .fa-soft")].some(e => e.getBoundingClientRect().height > 0)))) await tarotPick(page);
  return settle(page, P.sc);
}
const calmReading = (s, where) => {
  assert(!s.support && !s.soft, where + ": a reading was expected " + S(s));
  assert(s.sections >= 2, where + ": no reading " + S(s));
  assert(s.straight === 0, where + ": straight reading in the calm state " + S(s));
  assert(s.remedies.length === 0, where + ": remedy blocks visible " + S(s.remedies));
  assert(s.paid === 0, where + ": paid / merit offer visible");
  assert(s.helpOnPage, where + ": no help line with the reading");
};
const sessionDump = () => { const o = {}; for (let i = 0; i < sessionStorage.length; i++) { const k = sessionStorage.key(i); o[k] = sessionStorage.getItem(k); } return o; };

export default async function ({ base, launch, check }) {
  process.env.__LQ_BASE = base;
  const browser = await launch();
  try {
    await check("(a) calm() sees typed crisis text on every fortune page, whatever the script order", async () => {
      const page = await browser.newPage(null);
      try {
        const bad = [];
        for (const p of FORTUNE) {
          await page.goto(`${base}/${p}.html`); await sleep(150);
          const r = await page.evaluate(t => {
            const FS = window.LQFortuneStraight;
            if (!FS || typeof FS.calm !== "function") return { err: "no LQFortuneStraight.calm" };
            let f = document.querySelector('textarea, input:not([type]), input[type="text"], input[type="search"]');
            if (!f) { f = document.createElement("textarea"); f.id = "lqTestField"; document.body.appendChild(f); }
            f.value = "Somchai"; const plain = FS.calm();
            f.value = t; const crisis = FS.calm();
            f.value = ""; return { plain, crisis };
          }, "อยากตายจริงๆ ไม่ไหวแล้ว");
          if (r.err || r.plain !== false || r.crisis !== true) bad.push(p + " " + S(r));
        }
        assert(!bad.length, "calm() wrong on: " + bad.join(" · "));
      } finally { await page.close(); }
    });

    await check("(b) support card → every fortune page in the same tab is calm; one sessionStorage boolean; a new tab is not affected", async () => {
      const page = await browser.newPage(null, { initScripts: [FLAG_ON, ADULT] });
      try {
        await page.goto(`${base}/tarot.html`);
        const before = await page.evaluate(sessionDump);
        let s = await read(page, "tarot", "อยากตายจริงๆ ไม่ไหวแล้ว");
        assert(s.support && s.helpOnPage, "tarot: support card " + S(s));
        const after = await page.evaluate(sessionDump);
        const added = Object.keys(after).filter(k => !(k in before));
        assert(added.length === 1, "exactly one new sessionStorage entry: " + S(after));
        const v = after[added[0]];
        assert(/^(?:1|true)$/.test(v) && !/\d{4,}/.test(added[0]), "boolean only, no timestamp: " + S([added[0], v]));
        assert(!/อยาก|ตาย|ไหว/.test(added[0] + v), "typed text stored");
        for (const p of ["zodiac", "horoscope", "numbers", "dream", "tarot"]) {
          s = await read(page, p, p === "dream" ? "ช้าง" : p === "tarot" ? "งานใหม่จะดีไหม" : "Somchai");
          calmReading(s, p + " after the card");
        }
        assert(!page.consoleErrors.some(e => e.kind === "exception"), "script errors: " + S(page.consoleErrors).slice(0, 300));
      } finally { await page.close(); }
      // the soft step's "I'd like to talk to someone" path also counts as the support card
      const p2 = await browser.newPage(null, { initScripts: [FLAG_ON, ADULT] });
      try {
        await p2.goto(`${base}/tarot.html`);
        await RUN.tarot.ask(p2, "I can't do this anymore");
        await p2.waitFor(() => [...document.querySelectorAll(".fa-soft")].some(e => e.getBoundingClientRect().height > 0), 10000);
        await p2.evaluate(clickTalk);
        await p2.waitFor(() => !!document.querySelector(".fa-support"), 5000);
        calmReading(await read(p2, "zodiac", ""), "zodiac after 'talk'");
      } finally { await p2.close(); }
      // a new tab: its own sessionStorage, straight reading as chosen
      const p3 = await browser.newPage(null, { initScripts: [FLAG_ON, ADULT] });
      try {
        const s = await read(p3, "zodiac", "");
        assert(s.straight > 0, "a new tab keeps the user's straight choice " + S(s));
      } finally { await p3.close(); }
    });

    await check("(b) storage blocked: the support card and the page-level crisis state still work, no script error", async () => {
      const page = await browser.newPage(null, { initScripts: [FLAG_ON, ADULT, NO_STORAGE] });
      try {
        const s = await read(page, "tarot", "อยากตายจริงๆ ไม่ไหวแล้ว");
        assert(s.support && s.helpOnPage, "tarot: support card " + S(s));
        const r = await page.evaluate(() => ({ active: window.FortuneAI.crisis.active(), calm: window.LQFortuneStraight.calm(), allow: window.FortuneAI.crisis.allow("straight") }));
        assert(r.active && r.calm && !r.allow, "page-level crisis state " + S(r));
        assert(!page.consoleErrors.some(e => e.kind === "exception"), "script errors: " + S(page.consoleErrors).slice(0, 300));
      } finally { await page.close(); }
    });

    await check("(c) soft step → 'Just the reading': gentle only for the session, no remedies, help line in the viewport next to the reading", async () => {
      for (const [w, h] of [[360, 780], [1280, 800]]) {
        const page = await browser.newPage(null, { initScripts: [FLAG_ON, ADULT] });
        try {
          await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: w < 600 });
          const soft = { tarot: "I can't do this anymore", horoscope: "เหนื่อยจนทนไม่ไหวแล้ว", numbers: "เหนื่อยจนทนไม่ไหวแล้ว", dream: "เหนื่อยจนทนไม่ไหวแล้ว เห็นช้าง" };
          for (const p of ["tarot", "horoscope", "numbers", "dream"]) {
            const s = await read(page, p, soft[p], { go: true });
            calmReading(s, w + "px " + p + " after 'Just the reading'");
            assert(s.helpInView, w + "px " + p + ": help line not in the viewport next to the reading");
          }
          for (const p of ["zodiac", "horoscope"]) {
            const s = await read(page, p, p === "horoscope" ? "Somchai" : "");
            calmReading(s, w + "px " + p + " later in the session");
            assert(s.helpInView, w + "px " + p + " later: help line not in the viewport");
          }
        } finally { await page.close(); }
      }
    });

    await check("(d) the 12 missed inputs show the support card on tarot and dream; the laughing control does not", async () => {
      const MISSES = ["ฉันจะกินยาให้หมดขวดเลย", "อยู่ไปก็เป็นภาระคนอื่น ไปให้พ้นดีกว่า", "เขียนจดหมายลาไว้แล้ว", "อยากหลับไปตลอดกาล", "พรุ่งนี้จะไม่มีฉันแล้ว ลาก่อน",
        "i want to kil myself", "sucide is the only way", "生无可恋", "想紫砂", "一直在傷害自己", "ดูดแก๊สตายในรถ", "I want to ตาย"];
      const bad = [];
      for (const t of MISSES.concat(["อยากตายเพราะหัวเราะ ตลกมาก"])) {
        for (const p of ["tarot", "dream"]) {
          const page = await browser.newPage(null, { initScripts: [FLAG_ON, ADULT] });
          try {
            await page.goto(`${base}/${RUN[p].url}`); await sleep(300);
            await RUN[p].ask(page, t);
            await page.waitFor(() => [...document.querySelectorAll(".fa-support, .fa-soft")].some(e => e.getBoundingClientRect().height > 0)
              || document.querySelectorAll(".fa-section").length >= 2 || (document.getElementById("trPick") && !document.getElementById("trPick").hidden), 15000).catch(() => {});
            await sleep(300);
            const s = await page.evaluate(SNAP(RUN[p].sc));
            const control = t.startsWith("อยากตายเพราะหัวเราะ");
            if (control ? s.support : !s.support) bad.push(p + ": " + t + " " + S({ support: s.support, soft: s.soft }));
          } finally { await page.close(); }
        }
      }
      assert(!bad.length, bad.length + " wrong: " + bad.join(" · "));
    });
  } finally {
    await browser.close();
  }
}
