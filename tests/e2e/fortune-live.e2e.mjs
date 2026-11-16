// tests/e2e/fortune-live.e2e.mjs — FIXED TEST SET, fortune go-live (owner order 2026-11-15, items 1–3), locked BEFORE the build
// (evals-locks/fortune-live.sha256, ~/LENSIQ-field/evals/fortune-live/). The static half is tests/unit/fortune-live.test.js.
// Phone width, every fortune page (CLAUDE.md category 6 + cat-fortune), TH / EN / ZH:
//   H1  normal state (re-lock, decision 54 ข): no help number more than once; 1323 exactly once, 1669 not at all on the page (visible tel: links and visible text, counted as
//       one place when the number is the text of its own tel: link), at page load and after a reading (dream TH / EN / ZH,
//       report TH)
//   H2  the "อยากมีคนรับฟัง" button is reachable in one tap from page load: in the first screen without scrolling, at least
//       44 × 44 px, not covered, not overlapping the header, at 320 / 375 / 430 px; a touch tap on it reaches the tel: link
//       with nothing cancelling it; its label is in the page language
//   H3  crisis state: the full help card (every number, tap-to-call) shows and the reading is replaced (dream hard net,
//       TH / EN / ZH); on every page with the reading engine, the crisis card renders with 1323 and 1669 tap-to-call
//   D1  the final disclaimer line is shown in the page language on every fortune page (report after a reading)
//   RE-LOCK 2026-11-16 (owner decision 69 ค 2026-11-16: confirmation step before calling; the control moves into the top bar,
//       branch fortune-top-compact): H2 now wants the button INSIDE the top bar (it was "clear of the header"), its page-language
//       label in the aria-label with "1323" shown (the visible text is the icon and the number), and the first touch tap opens a
//       confirmation whose tel:1323 call link is reached by one more tap with nothing cancelling it. 44 px, first screen, not
//       covered, on screen, only control in #lqHelpTop and no horizontal scroll are unchanged; H1, H3, D1 and S1 are unchanged.
//   S1  no idle technical status: faceread, palm, booth and studio show no "ready — the model loads when …" line at page
//       load; the role=status element is still there (empty or hidden)
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PAGES = ["fortune", "cat-fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui",
  "dream", "zodiac", "astro", "lifegraph", "planner", "luckycolor", "report"];
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const LABEL = { th: /อยากมีคนรับฟัง/, en: /someone to listen/i, zh: /倾听/ };
const LINE = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};

// RE-LOCK 2026-11-15 (owner decision 54 option ข 2026-11-15: rule is at most once per page in normal state, 1669 only in crisis
// card): in the normal state each help number appears at most once; 1323 (the one top button) exactly once; 1669, 191, 1300 and
// Samaritans not at all. The crisis-state checks (H3: the full card with 1669, 191, 1300) are unchanged.
const WANT_N = { 1323: 1, 1669: 0, 191: 0, 1300: 0, "021136789": 0 };

const phone = async (page, w, h = 800) => {
  await page.send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 2, mobile: true });
  await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
};
const open = (browser, lang) => browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`] });
const langReady = lang => `document.documentElement.lang === ${S(HTML_LANG[lang])}`;

/** in the page: places where n shows — visible tel:n links, plus visible text nodes with n that are not inside such a link */
const PLACES = n => `(() => {
  const vis = e => { if (!e || !e.isConnected) return false;
    if (e.checkVisibility && !e.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return false;
    for (let x = e; x && x.nodeType === 1; x = x.parentElement) { if (x.tagName === "DETAILS" && !x.open && x !== e && !(x.firstElementChild && x.firstElementChild.contains(e))) return false; }
    const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const re = new RegExp("(?<!\\\\d)" + ${S(n)} + "(?!\\\\d)");
  const links = [...document.querySelectorAll('a[href^="tel:"]')].filter(a => a.getAttribute("href").replace(/\\D/g, "") === ${S(n)} && vis(a));
  const out = links.map(a => "link:" + (a.closest("[id]") ? a.closest("[id]").id : "") + ":" + a.innerText.replace(/\\s+/g, " ").trim());
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const p = t.parentElement;
    if (!p || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE)$/.test(p.tagName) || !re.test(t.nodeValue)) continue;
    if (links.some(a => a.contains(p))) continue;
    if (vis(p)) out.push("text:" + (p.closest("[id]") ? p.closest("[id]").id : "") + ":" + t.nodeValue.replace(/\\s+/g, " ").trim().slice(0, 60));
  }
  return out; })()`;

/** in the page: facts about the 1323 help button at load (no scrolling) */
const BUTTON = `(() => {
  const a = [...document.querySelectorAll('a[href="tel:1323"]')].find(x => x.getClientRects().length);
  if (!a) return null;
  const r = a.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, hit = document.elementFromPoint(cx, cy);
  const nav = document.getElementById("siteNav") || document.querySelector("header");
  const n = nav ? nav.getBoundingClientRect() : null;
  const overlapNav = !!n && n.height > 0 && r.left < n.right && n.left < r.right && r.top < n.bottom && n.top < r.bottom;
  return { w: r.width, h: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right, vw: innerWidth, vh: innerHeight, scrollY,
    covered: !(hit && (hit === a || a.contains(hit))), hit: hit ? hit.tagName + "." + hit.className : null, overlapNav,
    topCtl: (() => { const t = document.getElementById("lqHelpTop"); return t ? [...t.querySelectorAll("a[href], button, [role=button]")].filter(x => x.getClientRects().length).map(x => x.getAttribute("href") || x.tagName) : null; })(),
    text: a.innerText.replace(/\\s+/g, " ").trim(), aria: a.getAttribute("aria-label") || "", sw: document.documentElement.scrollWidth }; })()`;

/** every fortune page loads; returns once the page language is applied */
async function load(page, base, p, lang) {
  await page.goto(`${base}/${p}.html?nosw`);
  await page.waitFor(`${langReady(lang)} && !!document.querySelector('a[href="tel:1323"]')`, 10000);
  await sleep(400); // dictionaries and late scripts settle
}

/** dream: a normal reading */
async function dreamReading(page) {
  await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่างูตัวใหญ่ไล่ตาม แล้วฟันหลุด"; t.dispatchEvent(new Event("input")); });
  await page.waitFor(() => document.querySelectorAll("#drSel .dr-x").length >= 1, 4000);
  await page.evaluate(() => {
    document.querySelector('input[name="drMood"][value="happy"]').click(); document.querySelector('input[name="drTime"][value="dawn"]').click(); document.getElementById("drGo").click();
  });
  await page.waitFor(() => { const b = document.getElementById("drRd-body"); return !!b && b.querySelectorAll(".fa-section").length >= 3; }, 10000);
  await sleep(500);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("H1: normal state, every fortune page at 375 px, TH / EN / ZH: each help number at most once; 1323 exactly once, 1669 none", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, lang);
        try {
          await phone(page, 375);
          for (const p of PAGES) {
            try { await load(page, base, p, lang); } catch (e) { bad.push(`${p} ${lang}: did not load in ${lang} with a 1323 link`); continue; }
            for (const [n, want] of Object.entries(WANT_N)) {
              const places = await page.evaluate(PLACES(n));
              if (places.length !== want) bad.push(`${p} ${lang}: ${n} shows ${places.length} times (want ${want}) ${S(places)}`);
            }
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 60).join("\n"));
    });

    await check("H1: after a reading (dream TH / EN / ZH, report TH): still 1323 once, 1669 none", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, lang);
        try {
          await phone(page, 375);
          await load(page, base, "dream", lang);
          await dreamReading(page);
          for (const [n, want] of Object.entries(WANT_N)) {
            const places = await page.evaluate(PLACES(n));
            if (places.length !== want) bad.push(`dream ${lang}: ${n} shows ${places.length} times (want ${want}) after the reading ${S(places)}`);
          }
        } catch (e) { bad.push(`dream ${lang}: ${e.message}`); } finally { await page.close(); }
      }
      const page = await browser.newPage(null, { isolated: true });
      try {
        await phone(page, 375);
        await page.goto(`${base}/report.html?nosw`);
        await page.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
        await page.evaluate(() => {
          document.getElementById("rpName").value = "สมชาย"; document.querySelector('[data-rp-type="report_basic"]').click();
          document.getElementById("rpAYear").value = "2533"; document.getElementById("rpGo").click();
        });
        await page.waitFor(() => document.querySelectorAll("#rpOut .rp-part").length >= 3, 10000);
        await sleep(400);
        for (const [n, want] of Object.entries(WANT_N)) {
          const places = await page.evaluate(PLACES(n));
          if (places.length !== want) bad.push(`report th: ${n} shows ${places.length} times (want ${want}) after the report ${S(places)}`);
        }
        const line = await page.evaluate(`[...document.querySelectorAll(".lq-disc-line")].some(e => e.getClientRects().length && e.textContent.trim() === ${S(LINE.th)})`);
        if (!line) bad.push("report th: the final disclaimer line is not shown");
      } catch (e) { bad.push(`report: ${e.message}`); } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });

    await check("H2 + D1: the help button is in the first screen, ≥ 44 px, not covered, in the top bar (re-lock 2026-11-16), label in the page language (320 / 375 / 430 px); the final line shows", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, lang);
        try {
          for (const p of PAGES) {
            await phone(page, 375);
            try { await load(page, base, p, lang); } catch (e) { bad.push(`${p} ${lang}: did not load`); continue; }
            if (p !== "report") {
              const line = await page.evaluate(`[...document.querySelectorAll('[data-i18n="fortune.disc.line"], .lq-disc-line')].some(e => e.getClientRects().length && e.textContent.replace(/\\s+/g, " ").trim() === ${S(LINE[lang])})`);
              if (!line) bad.push(`${p} ${lang}: the final disclaimer line is not shown in ${lang}`);
            }
            for (const w of [320, 375, 430]) {
              await phone(page, w, 740); await page.evaluate("window.scrollTo(0, 0)"); await sleep(200);
              const b = await page.evaluate(BUTTON);
              if (!b) { bad.push(`${p} ${lang} ${w}: no visible 1323 button`); continue; }
              const tag = `${p} ${lang} ${w}`;
              if (b.w < 44 || b.h < 44) bad.push(`${tag}: button ${b.w.toFixed(1)}×${b.h.toFixed(1)} px`);
              if (b.top < 0 || b.bottom > b.vh) bad.push(`${tag}: button not in the first screen (top ${b.top.toFixed(0)}, screen ${b.vh})`);
              if (b.left < -0.5 || b.right > b.vw + 0.5) bad.push(`${tag}: button off the side of the screen`);
              if (S(b.topCtl) !== S(["tel:1323"])) bad.push(`${tag}: the top help row must hold only the 1323 button (decision 54 ข): ${S(b.topCtl)}`);
              if (b.covered) bad.push(`${tag}: button covered by ${b.hit}`);
              // re-lock 2026-11-16 (decision 69 ค): the button is in the top bar, so it must overlap the header (was: must not)
              if (!b.overlapNav) bad.push(`${tag}: button is not in the top bar`);
              if (b.sw > b.vw + 1) bad.push(`${tag}: page wider than the screen (${b.sw} > ${b.vw})`);
              // re-lock 2026-11-16 (decision 69 ค): the label is the aria-label; the button shows the icon and 1323
              if (!LABEL[lang].test(b.aria) || !/1323/.test(b.text)) bad.push(`${tag}: label not in ${lang}: ${S({ text: b.text, aria: b.aria })}`);
              if (lang !== "th" && /[฀-๿]/.test(b.text + b.aria)) bad.push(`${tag}: Thai letters in the ${lang} button: ${b.text}`);
            }
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.slice(0, 60).join("\n"));
    });

    // RE-LOCK 2026-11-16 (owner decision 69 ค 2026-11-16: confirmation step before calling): was "one touch tap reaches the
    // tel:1323 link"; now the first tap opens a confirmation (no call), and one more tap on its tel:1323 link calls, uncancelled
    await check("H2: from page load, one touch tap on the button opens the confirmation, one more tap on its tel:1323 link calls and nothing cancels it (every page, TH, 375 px)", async () => {
      const bad = [];
      const page = await open(browser, "th");
      const touch = async pt => { await page.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
        await page.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await sleep(300); };
      try {
        await phone(page, 375);
        for (const p of PAGES) {
          try { await load(page, base, p, "th"); } catch (e) { bad.push(`${p}: did not load`); continue; }
          await page.evaluate("window.scrollTo(0, 0)");
          const b = await page.evaluate(BUTTON);
          if (!b) { bad.push(`${p}: no button`); continue; }
          await touch({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });
          const d = await page.evaluate(`(() => { const d = [...document.querySelectorAll("dialog, [role=dialog]")].find(x => x.getClientRects().length && (x.tagName !== "DIALOG" || x.open));
            const a = d && [...d.querySelectorAll('a[href="tel:1323"]')].find(x => x.getClientRects().length); if (!a) return null; const r = a.getBoundingClientRect();
            return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; })()`);
          if (!d) { bad.push(`${p}: the first tap opened no confirmation with a tel:1323 link`); continue; }
          if (d.w < 44 || d.h < 44) bad.push(`${p}: confirmation call link ${d.w}×${d.h}`);
          await page.evaluate(`window.__tap = null;
            window.addEventListener("click", e => { const a = e.target && e.target.closest && e.target.closest("a[href]");
              window.__tap = { href: a ? a.getAttribute("href") : null, prevented: e.defaultPrevented }; e.preventDefault(); }, { once: true });`);
          await touch({ x: d.x, y: d.y });
          const t = await page.evaluate("window.__tap");
          if (!t || t.href !== "tel:1323" || t.prevented) bad.push(`${p}: second tap result ${S(t)}`);
        }
      } finally { await page.close(); }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });

    await check("H3: crisis state (dream hard net, TH / EN / ZH): the full help card shows and the reading is replaced", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, lang);
        try {
          await phone(page, 375);
          await load(page, base, "dream", lang);
          await page.evaluate(() => { const t = document.getElementById("drText"); t.value = "ฝันว่าฆ่าตัวตาย อยากตายจริงๆ"; t.dispatchEvent(new Event("input")); });
          await page.waitFor(() => !!document.querySelector(".fa-support"), 5000);
          await page.evaluate(() => document.getElementById("drForm").requestSubmit());
          await sleep(1200);
          const r = await page.evaluate(`(() => { const cards = [...document.querySelectorAll(".fa-support")].filter(e => e.getClientRects().length);
            const c = cards[0]; const tels = c ? [...c.querySelectorAll('a[href^="tel:"]')].map(a => { const q = a.getBoundingClientRect(); return { h: a.getAttribute("href"), w: q.width, ht: q.height }; }) : [];
            return { crisis: document.documentElement.getAttribute("data-lq-crisis"), cards: cards.length, tels,
              sections: [...document.querySelectorAll(".fa-section")].filter(e => e.getClientRects().length).length }; })()`);
          if (r.crisis !== "1") bad.push(`${lang}: page not in the crisis state ${S(r)}`);
          if (!r.cards) bad.push(`${lang}: no help card ${S(r)}`);
          if (r.sections) bad.push(`${lang}: a reading is shown next to the card ${S(r)}`);
          for (const n of ["tel:1323", "tel:1669", "tel:191", "tel:1300"]) {
            const t = r.tels.find(x => x.h === n);
            if (!t) bad.push(`${lang}: card has no ${n} ${S(r.tels)}`); else if (t.w < 44 || t.ht < 44) bad.push(`${lang}: card ${n} is ${t.w}×${t.ht}`);
          }
        } catch (e) { bad.push(`${lang}: ${e.message}`); } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });

    await check("H3: on every page with the reading engine, the crisis card renders with 1323 and 1669 tap-to-call and sets the crisis state (TH / EN / ZH)", async () => {
      const bad = [];
      for (const lang of LANGS) {
        const page = await open(browser, lang);
        try {
          await phone(page, 375);
          for (const p of PAGES) {
            try { await load(page, base, p, lang); } catch (e) { bad.push(`${p} ${lang}: did not load`); continue; }
            const has = await page.evaluate("!!(window.FortuneAI && window.FortuneAI.crisis && window.FortuneAI.crisis.render)");
            if (!has) continue;
            const r = await page.evaluate(`(() => { const d = document.createElement("div"); (document.querySelector("main") || document.body).appendChild(d);
              window.FortuneAI.crisis.render(d, window.FortuneAI.crisis.result({ lang: ${S(lang)} }));
              const c = d.querySelector(".fa-support"); const tels = c ? [...c.querySelectorAll('a[href^="tel:"]')].filter(a => a.getClientRects().length).map(a => a.getAttribute("href")) : [];
              return { card: !!c && c.getClientRects().length > 0, tels, crisis: document.documentElement.getAttribute("data-lq-crisis") }; })()`);
            if (!r.card || r.crisis !== "1" || !r.tels.includes("tel:1323") || !r.tels.includes("tel:1669")) bad.push(`${p} ${lang}: ${S(r)}`);
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });

    await check("S1: no idle technical status at page load (faceread, palm, booth, studio; TH / EN / ZH); the role=status element is still there", async () => {
      const bad = [];
      const IDS = { faceread: "frEngine", palm: "plEngine", booth: "engine", studio: "stReady" };
      for (const lang of LANGS) {
        const page = await open(browser, lang);
        try {
          await phone(page, 375);
          for (const [p, id] of Object.entries(IDS)) {
            await page.goto(`${base}/${p}.html?nosw`);
            try { await page.waitFor(`${langReady(lang)} && !!document.getElementById(${S(id)})`, 10000); } catch (e) { bad.push(`${p} ${lang}: did not load`); continue; }
            await sleep(2000);
            const r = await page.evaluate(`(() => { const e = document.getElementById(${S(id)}); const shown = !!e && e.getClientRects().length > 0 && getComputedStyle(e).visibility !== "hidden";
              return { role: e && e.getAttribute("role"), shown, text: e ? e.innerText.replace(/\\s+/g, " ").trim() : null }; })()`);
            if (r.role !== "status") bad.push(`${p} ${lang}: #${id} lost role=status ${S(r)}`);
            if (r.shown && r.text) bad.push(`${p} ${lang}: idle status shown: ${r.text}`);
          }
        } finally { await page.close(); }
      }
      assert(!bad.length, bad.length + " problem(s):\n" + bad.join("\n"));
    });
  } finally {
    await browser.close();
  }
}
