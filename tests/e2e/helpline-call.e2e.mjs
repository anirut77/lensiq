// tests/e2e/helpline-call.e2e.mjs — FIXED TEST SET, "tap-to-call help lines" (owner order 2026-11-14, Part B), locked BEFORE
// the build on branch helpline-b (base ea509e0). Phone = touch emulation at 360 / 375 / 414 px; computer = 1280 px, no touch.
// 1) Every visible help-line button (shared component .lq-call-btn) on every page that shows help numbers: tel: link = the
//    component's number, at least 44 px tall and wide, inside the screen, and not covered (elementFromPoint at its centre
//    is the button itself).
// 2) The always-visible help lines (#lqHelpTop / #lqHelpEnd) and the crisis card are never collapsed or hidden: no closed
//    <details>, no [hidden] / display:none / visibility:hidden / zero size on them or any ancestor (A5 exception).
// 3) Crisis state (dream hard net) and calm state (tab flag): the 1323 button is still visible and tappable; the card keeps
//    every help line as a button.
// 4) Rendered wording: 1323 button + second line in TH / EN / ZH without the forbidden words; EN / ZH without Thai.
// RE-LOCK 2026-11-15 (2) (owner decision 54 option ข 2026-11-15: rule is at most once per page in normal state, 1669 only in crisis
//    card): the fortune pages' top row holds only the 1323 button.
// RE-LOCK 2026-11-15 (fortune-live, owner order 2026-11-15 item 3; placement pre-approved by the owner): on the fortune pages
//    the help line is ONE small tap-to-call button row near the top (#lqHelpTop: "อยากมีคนรับฟัง 1323" and "เจ็บป่วยฉุกเฉิน
//    1669", class .lq-call-mini); #lqHelpEnd is gone. Every button keeps the tel / 44 px / on-screen / not-covered checks; the
//    mini button's label is inside the button (no separate label row, no second line); on a computer its number is the large
//    selectable text. The crisis card, calm state and full components (medicine, nutrition, terms) are checked as before.
// 5) Computer: the number is also shown as large text that can be selected (user-select not none, >= 24 px).
// RE-LOCK 2026-11-14 (owner addition after testing on a phone, relayed by the coordinator): every help line is ONE compact
//    row at 360 / 375 / 414 px: the short label's start, the number and the call button share one row (same top band:
//    the label's first line and the button overlap vertically) with the button to the RIGHT of the label, never below it;
//    the second line wraps under the label, never under the button. Wording check reads label + call button.
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGES = ["fortune", "cat-fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui",
  "dream", "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report", "medicine", "nutrition", "terms", "counselling"];
// RE-LOCK 2026-11-16 (owner decision 2026-11-16 crisis one-number rules): counselling.html (every service, full components) joins the help pages; the crisis card holds the 1323
// button only (the other numbers are on counselling.html, one link away).
const FORTUNE = PAGES.slice(0, 19);
const TELS = { 1323: "1323", 1669: "1669", 191: "191", 1300: "1300", samaritans: "021136789" };
const FORBIDDEN = {
  th: ["ผู้ป่วย", "โรค", "จิตเวช", "อาการ", "ภาวะ", "ปัญหาสุขภาพจิต"],
  en: ["patient", "disease", "illness", "psychiatric", "symptom", "disorder", "mental health problem"],
  zh: ["患者", "病", "精神科", "症状", "障碍", "心理疾病"],
};
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };

const phone = async (page, w) => {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
};

/** in the page: is e shown, with no hidden / collapsed ancestor? */
const SHOWN = `(e => { if (!e || !e.isConnected) return "missing";
  for (let x = e; x && x.nodeType === 1; x = x.parentElement) {
    if (x.hidden) return "hidden attribute on " + x.tagName + "#" + x.id;
    const s = getComputedStyle(x);
    if (s.display === "none") return "display:none on " + x.tagName + "#" + x.id + "." + x.className;
    if (s.visibility === "hidden" || s.visibility === "collapse") return "visibility on " + x.tagName + "#" + x.id;
    if (x !== e && x.tagName === "DETAILS" && !x.open && !(x.firstElementChild && x.firstElementChild.tagName === "SUMMARY" && x.firstElementChild.contains(e)))
      return "inside a closed <details>";
    if (x.getAttribute("aria-hidden") === "true") return "aria-hidden on " + x.tagName;
  }
  const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return "zero size";
  return ""; })`;

/** in the page: facts for every visible call button (each scrolled to the centre first) */
const BUTTONS = `(async () => { const out = [];
  for (const a of document.querySelectorAll("a.lq-call-btn")) {
    if (!a.getClientRects().length || getComputedStyle(a).visibility === "hidden") continue;
    a.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" }); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, hit = document.elementFromPoint(cx, cy);
    const c = a.closest("[data-lq-call]"), lab = c && c.querySelector(".lq-call-t"), sub = c && c.querySelector(".lq-call-sub");
    let first = null;
    if (lab && lab.firstChild) { const rg = document.createRange(); rg.setStart(lab.firstChild, 0); rg.setEnd(lab.firstChild, 1); first = rg.getClientRects()[0] || null; }
    const lr = lab ? lab.getBoundingClientRect() : null, sr = sub && sub.getClientRects().length ? sub.getBoundingClientRect() : null;
    // re-lock 2026-11-15 (fortune-live item 3): the top help button (.lq-call-mini) is ONE button whose text is the label and the
    // number, so there is no separate label to line up; every other check applies to it unchanged
    const row = a.closest(".lq-call-mini") ? (/\\S/.test(a.textContent.replace(/[\\d\\s]/g, "")) ? "" : "mini button has no label text") : !first || !lr ? "no label" : !(first.top < r.bottom && r.top < first.bottom) ? "label and button not on one row " + JSON.stringify([first.top, first.bottom, r.top, r.bottom])
      : r.left < lr.right - 1 ? "button not to the right of the label" : sr && sr.left < r.right && sr.right > r.left && sr.top >= r.top ? "second line under the button" : "";
    out.push({ href: a.getAttribute("href"), id: c ? c.getAttribute("data-lq-call") : null, text: a.textContent.replace(/\\s+/g, " ").trim(), row,
      w: r.width, h: r.height, left: r.left, right: r.right, vw: innerWidth, hitSelf: hit === a,
      hit: hit ? hit.tagName + (hit.id ? "#" + hit.id : "") + "." + String(hit.className && hit.className.baseVal != null ? hit.className.baseVal : hit.className).slice(0, 60) : null });
  }
  return out; })()`;

const checkButtons = (list, where, bad) => {
  for (const b of list) {
    const want = TELS[b.id];
    if (!want) { bad.push(`${where}: button outside a component ${S(b)}`); continue; }
    if (b.href !== "tel:" + want) bad.push(`${where}: ${b.id} links ${b.href}`);
    if (!b.text.replace(/\D/g, "").includes(want)) bad.push(`${where}: ${b.id} text '${b.text}' does not show ${want}`);
    if (b.h < 44 || b.w < 44) bad.push(`${where}: ${b.id} is ${b.w.toFixed(1)}×${b.h.toFixed(1)} px`);
    if (b.left < -0.5 || b.right > b.vw + 0.5) bad.push(`${where}: ${b.id} off screen ${S({ left: b.left, right: b.right, vw: b.vw })}`);
    if (!b.hitSelf) bad.push(`${where}: ${b.id} covered at its centre by ${b.hit}`);
    if (b.vw <= 414 && b.row) bad.push(`${where}: ${b.id} one-row layout: ${b.row}`);
  }
};

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("phone 360 / 375 / 414: every help-line button on every help page is a tel: link with its number, >= 44 px, on screen, not covered", async () => {
      const bad = [];
      const page = await browser.newPage(null);
      try {
        for (const w of [360, 375, 414]) {
          await phone(page, w);
          for (const p of PAGES) {
            await page.goto(`${base}/${p}.html?nosw`);
            await sleep(300);
            const list = await page.evaluate(BUTTONS);
            if (!list.length) { bad.push(`${p} ${w}: no visible help-line button`); continue; }
            checkButtons(list, `${p} ${w}`, bad);
          }
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 40).join("\n"));
    });

    await check("the always-visible help lines are never collapsed or hidden (fortune pages, 360 px): only the 1323 button in each (decision 54 ข)", async () => {
      const bad = [];
      const page = await browser.newPage(null);
      try {
        await phone(page, 360);
        for (const p of FORTUNE) {
          await page.goto(`${base}/${p}.html?nosw`);
          await sleep(300);
          if (await page.evaluate(`!!document.getElementById("lqHelpEnd")`)) bad.push(`${p}: #lqHelpEnd still on the page (one place per page)`);
          for (const id of ["lqHelpTop"]) {
            const r = await page.evaluate(`(() => { const e = document.getElementById(${S(id)}); const why = ${SHOWN}(e);
              const calls = e ? [...e.querySelectorAll("[data-lq-call]")].map(c => c.getAttribute("data-lq-call")) : [];
              const btn = e && e.querySelector('[data-lq-call="1323"] a.lq-call-btn');
              return { why, calls, btn: btn ? ${SHOWN}(btn) : "no 1323 button" }; })()`);
            if (r.why) bad.push(`${p} #${id}: ${r.why}`);
            if (S(r.calls) !== S(["1323"])) bad.push(`${p} #${id}: components ${S(r.calls)}`);
            if (r.btn) bad.push(`${p} #${id} 1323 button: ${r.btn}`);
          }
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });

    await check("crisis state (dream hard net, 360 / 375 / 414): no card; the closing line is shown, not collapsed, its 1323 a tappable button; help lines still visible (v3)", async () => {
      for (const w of [360, 375, 414]) {
        const page = await browser.newPage(null, { isolated: true });
        try {
          await phone(page, w);
          await page.goto(`${base}/dream.html?nosw`);
          // RE-LOCK 2026-11-17 (owner decision 2026-11-17 crisis v3; ledger docs/CRISIS-V3-RELOCKS.md): the reading goes on (a dream with a symbol); the closing line replaces the card: shown, not collapsed, its one
          // help line (1323) a tappable button; the top 1323 control still visible
          await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันเห็นงูใหญ่ในบ้าน อยากตายจริงๆ"; t.dispatchEvent(new Event("input")); });
          await page.waitFor(() => document.documentElement.getAttribute("data-lq-crisis") === "1" && document.querySelectorAll("#drSel .dr-x").length >= 1, 5000);
          await page.evaluate(() => { const f = document.getElementById("drForm"); if (f && f.requestSubmit) f.requestSubmit(); });
          await page.waitFor(() => !!document.querySelector(".lq-helpline-result"), 15000);
          await sleep(500);
          const r = await page.evaluate(`(() => { const cards = [...document.querySelectorAll(".lq-helpline-result")].filter(c => c.getClientRects().length);
            const c = cards[0]; return { n: cards.length, why: c ? ${SHOWN}(c) : "no closing line",
              calls: c ? [...c.querySelectorAll("[data-lq-call]")].map(x => x.getAttribute("data-lq-call")) : [],
              top: ${SHOWN}(document.getElementById("lqHelpTop")) }; })()`);
          assert(r.n === 1 && !r.why, w + ": closing line shown " + S(r));
          assert(S(r.calls) === S(["1323"]), w + ": closing line has the 1323 button only " + S(r.calls));
          assert(!r.top, w + ": help button still visible in the crisis state " + S(r));
          const list = await page.evaluate(BUTTONS), bad = [];
          checkButtons(list, "dream crisis " + w, bad);
          const card = await page.evaluate(`[...document.querySelectorAll(".lq-helpline-result a.lq-call-btn")].filter(a => a.getClientRects().length).map(a => a.getAttribute("href"))`);
          if (S(card) !== S(["tel:1323"])) bad.push(w + ": closing buttons " + S(card) + " (want tel:1323 only)");
          if (await page.evaluate(() => !!document.querySelector(".fa-support"))) bad.push(w + ": a card is shown (v3: none)");
          assert(!bad.length, bad.join("\n"));
        } finally { await page.close(); }
      }
    });

    await check("calm state (tab flag set): the 1323 button is visible and tappable on every fortune page (375 px)", async () => {
      const bad = [];
      const page = await browser.newPage(null, { isolated: true, initScripts: [`try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`] });
      try {
        await phone(page, 375);
        for (const p of FORTUNE) {
          await page.goto(`${base}/${p}.html?nosw`);
          await sleep(300);
          const calm = await page.evaluate(() => document.documentElement.getAttribute("data-lq-calm") === "1" || !!(window.LQFortuneCrisis && window.LQFortuneCrisis.calmOn()));
          if (!calm && p !== "cat-fortune") bad.push(`${p}: page not calm with the tab flag`);
          const r = await page.evaluate(`(() => { const b = document.querySelector('#lqHelpTop [data-lq-call="1323"] a.lq-call-btn'); return b ? ${SHOWN}(b) : "no 1323 button"; })()`);
          if (r) bad.push(`${p}: 1323 button ${r}`);
          const list = (await page.evaluate(BUTTONS)).filter(b => b.id === "1323");
          if (!list.length) bad.push(`${p}: no visible 1323 button in the calm state`);
          checkButtons(list, p + " calm", bad);
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });

    await check("rendered wording TH / EN / ZH: 1323 button + second line without forbidden words; EN / ZH without Thai; Thai exactly the owner's", async () => {
      for (const lang of ["th", "en", "zh"]) {
        const page = await browser.newPage(null, { isolated: true, initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
        try {
          await phone(page, 375);
          for (const p of ["dream", "medicine", "nutrition"]) {
            await page.goto(`${base}/${p}.html?nosw`);
            await page.waitFor(`document.documentElement.lang === ${S(HTML_LANG[lang])}`, 8000);
            await sleep(400);
            const r = await page.evaluate(`[...document.querySelectorAll('[data-lq-call]')].filter(c => c.getClientRects().length).map(c => ({ id: c.getAttribute("data-lq-call"),
              btn: ((c.querySelector(".lq-call-t") || {}).innerText || "") + " " + ((c.querySelector("a.lq-call-btn") || {}).innerText || ""),
              sub: (c.querySelector(".lq-call-sub") || {}).innerText || "", mini: c.classList.contains("lq-call-mini"),
              aria: (c.querySelector("a.lq-call-btn") ? c.querySelector("a.lq-call-btn").getAttribute("aria-label") || "" : "").replace(/\s+/g, " ").trim() }))`);
            if (p !== "medicine") assert(r.some(x => x.id === "1323"), `${p} ${lang}: a visible 1323 component`);
            for (const x of r) {
              const t = (x.btn + " " + x.sub).replace(/\s+/g, " ");
              assert(x.btn.trim(), `${p} ${lang} ${x.id}: button text`);
              for (const l2 of ["th", "en", "zh"]) for (const w of FORBIDDEN[l2]) {
                const hit = l2 === "en" ? new RegExp("\\b" + w.replace(/\s+/g, "\\s+"), "i").test(t) : t.includes(w);
                assert(!hit, `${p} ${lang} ${x.id}: forbidden '${w}' in '${t}'`);
              }
              if (lang !== "th") assert(!/[฀-๿]/.test(t), `${p} ${lang} ${x.id}: Thai in '${t}'`);
              if (lang === "th" && x.id === "1323" && x.mini) {
                // RE-LOCK 2026-11-16 (owner decision 69 ค 2026-11-16: the top control is a phone icon + "1323" in the top bar, confirmation
                // step before calling): it shows "1323" and its words are the aria-label (was: visible "อยากมีคนรับฟัง 1323")
                assert(x.btn.replace(/\s+/g, " ").trim() === "1323" && x.aria === "อยากมีคนรับฟัง โทร 1323", `${p}: 1323 top button '${x.btn}' (${x.aria})`);
              } else if (lang === "th" && x.id === "1323") {
                assert(x.btn.replace(/\s+/g, " ").trim() === "อยากมีคนรับฟัง โทร 1323", `${p}: 1323 button '${x.btn}'`);
                assert(x.sub.replace(/\s+/g, " ").trim() === "พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง", `${p}: 1323 second line '${x.sub}'`);
              }
            }
          }
        } finally { await page.close(); }
      }
    });

    await check("computer (1280 px, no touch): the number is large selectable text next to each visible button", async () => {
      const page = await browser.newPage(null, { isolated: true });
      const bad = [];
      try {
        await page.send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
        for (const p of ["dream", "tarot", "medicine", "nutrition", "terms"]) {
          await page.goto(`${base}/${p}.html?nosw`);
          await sleep(300);
          const r = await page.evaluate(`[...document.querySelectorAll('[data-lq-call]')].filter(c => c.getClientRects().length && c.querySelector("a.lq-call-btn").getClientRects().length).map(c => {
            const n = c.querySelector(c.classList.contains("lq-call-mini") ? ".lq-call-mini-n" : ".lq-call-num"), s = n ? getComputedStyle(n) : null, r = n ? n.getBoundingClientRect() : null;
            return { id: c.getAttribute("data-lq-call"), text: n ? n.textContent.replace(/\\s+/g, "") : null,
              shown: !!(r && r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"),
              fs: s ? parseFloat(s.fontSize) : 0, sel: s ? (s.userSelect || s.webkitUserSelect) : "none" }; })`);
          if (!r.length) bad.push(`${p}: no visible component`);
          for (const x of r) {
            if (!x.shown) bad.push(`${p} ${x.id}: large number not shown`);
            if (x.fs < 24) bad.push(`${p} ${x.id}: number ${x.fs} px`);
            if (x.sel === "none") bad.push(`${p} ${x.id}: number cannot be selected`);
            if (x.text && x.text.replace(/\D/g, "") !== TELS[x.id]) bad.push(`${p} ${x.id}: number text ${x.text}`);
          }
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.join("\n"));
    });
  } finally {
    await browser.close();
  }
}
