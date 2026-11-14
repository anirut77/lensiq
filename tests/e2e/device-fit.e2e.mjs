// tests/e2e/device-fit.e2e.mjs — "best used on" (owner order 2026-11-14). One headless Chrome, isolated contexts.
//   phone = 390 x 844, mobile, touch emulation on (the module detects a phone by viewport size + touch, not the UA).
//   1. a computer page on a phone shows the notice (TH / EN / ZH), it does not cover or block the page, it does not start
//      the camera or load a model;
//   2. "continue anyway" dismisses it; the choice is remembered on this device (reload: no notice); the page stays usable;
//   3. "send this link to myself" uses navigator.share, else the clipboard, else shows the link to copy by hand, and none
//      of the three makes a network request;
//   4. a tablet page on a phone shows the tablet wording;
//   5. no notice on phone / any pages on a phone, and none on a computer page at desktop width or in a narrow desktop
//      window without touch;
//   6. the device value is shown in the menu, the category page and the solutions catalogue.
// FIXED TEST written and locked (~/LENSIQ-field/evals/device-fit/locked.sha256) before the module existed.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PHONE = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
const NOTE = ".lq-fit-note";

// counts camera starts; records what the page would share / copy (stubs installed per case)
const CAM_SPY = `(() => {
  window.__gum = 0;
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) { const o = md.getUserMedia.bind(md); md.getUserMedia = c => { window.__gum++; return o(c); }; }
})();`;
const SHARE_STUB = `Object.defineProperty(navigator, "share", { configurable: true, value: d => { (window.__shared = window.__shared || []).push(d); return Promise.resolve(); } });`;
const NO_SHARE = `Object.defineProperty(navigator, "share", { configurable: true, value: undefined });`;
const CLIP_STUB = `Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: t => { window.__copied = t; return Promise.resolve(); } } });`;
const NO_CLIP = `Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined }); document.execCommand = () => false;`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  /** a fresh isolated tab with the given viewport (+ touch) and init scripts, then navigate */
  async function open(file, { metrics = PHONE, touch = true, init = [], query = "nosw" } = {}) {
    const page = await browser.newPage(null, { isolated: true, initScripts: [CAM_SPY, ...init] });
    await page.send("Emulation.setDeviceMetricsOverride", metrics);
    if (touch) await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.goto(`${base}/${file}?${query}`);
    return page;
  }
  const noteInfo = page => page.evaluate(sel => {
    const n = document.querySelector(sel);
    if (!n || n.hidden || !n.offsetHeight) return null;
    const cs = getComputedStyle(n);
    const btns = [...n.querySelectorAll("button")].map(b => { const r = b.getBoundingClientRect(); return { act: b.dataset.fitAct, text: b.textContent.trim(), w: r.width, h: r.height }; });
    return { text: n.textContent.replace(/\s+/g, " ").trim(), position: cs.position, btns, lang: n.getAttribute("lang"),
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
  }, NOTE);
  const errorsOf = page => page.consoleErrors.filter(e => e.kind === "exception" || e.kind === "console");
  const noErr = (page, what) => assert(!errorsOf(page).length, what + " console errors: " + JSON.stringify(errorsOf(page).slice(0, 3)));
  const click = (page, act) => page.evaluate((sel, a) => { document.querySelector(`${sel} [data-fit-act="${a}"]`).click(); }, NOTE, act);

  try {
    await check("phone: a computer page shows the notice (TH), not fixed over the page, 44 px buttons, no camera, no model", async () => {
      const page = await open("exam-dashboard.html");
      await page.waitFor(`!!document.querySelector("${NOTE}")`, 8000);
      await sleep(500);
      const n = await noteInfo(page);
      assert(n, "notice not visible");
      assert(/คอมพิวเตอร์/.test(n.text), "Thai computer wording: " + n.text);
      assert(n.position !== "fixed" && n.position !== "absolute" && n.position !== "sticky", "the notice must not overlay the page: " + n.position);
      assert(n.btns.map(b => b.act).sort().join() === "continue,send", "two buttons: " + JSON.stringify(n.btns));
      assert(n.btns.every(b => b.w >= 44 && b.h >= 44), "44 px targets: " + JSON.stringify(n.btns));
      assert(n.sw <= n.cw, `no horizontal overflow (${n.sw} > ${n.cw})`);
      // never blocks: the page's own controls are still on top where they are drawn
      const top = await page.evaluate(sel => {
        const t = document.querySelector(".nav-toggle"); const r = t.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { onToggle: !!hit && t.contains(hit), inNote: !!hit && !!hit.closest(sel) };
      }, NOTE);
      assert(top.onToggle && !top.inNote, "menu button reachable while the notice shows: " + JSON.stringify(top));
      const r = await page.evaluate(() => ({ gum: window.__gum,
        models: performance.getEntriesByType("resource").map(e => e.name).filter(u => /vendor\/models|\.onnx|\.tflite|\.task(\?|$)/.test(u)) }));
      assert(r.gum === 0, "camera started " + r.gum + " time(s)");
      assert(!r.models.length, "models loaded: " + r.models.join(", "));
      noErr(page, "exam-dashboard");
      await page.close();
    });

    await check("phone: 'continue anyway' dismisses it, remembered on this device; the page stays usable", async () => {
      const page = await open("exam-dashboard.html");
      await page.waitFor(`!!document.querySelector("${NOTE}")`, 8000);
      await click(page, "continue");
      await sleep(300);
      assert(!(await noteInfo(page)), "notice still visible after continue");
      const stored = await page.evaluate(() => {
        const o = {};
        for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/fit/.test(k)) o[k] = localStorage.getItem(k); }
        return o;
      });
      assert(Object.keys(stored).length === 1 && Object.values(stored)[0] === "1", "one remembered flag: " + JSON.stringify(stored));
      // usable: the drawer opens and closes
      const menu = await page.evaluate(async () => {
        const t = document.querySelector(".nav-toggle"); t.click(); await new Promise(r => setTimeout(r, 150));
        const open = document.getElementById("siteNav").classList.contains("menu-open"); t.click();
        return open;
      });
      assert(menu, "menu does not open after dismissing");
      await page.reload();
      await sleep(1500);
      assert(!(await noteInfo(page)), "notice shown again after reload (not remembered)");
      noErr(page, "exam-dashboard after continue");
      await page.close();
    });

    await check("send this link to myself: share sheet, else clipboard, else the link by hand; no network request in any case", async () => {
      const cases = [
        { name: "share", init: [SHARE_STUB], want: "shared" },
        { name: "clipboard", init: [NO_SHARE, CLIP_STUB], want: "copied" },
        { name: "by hand", init: [NO_SHARE, NO_CLIP], want: "manual" }
      ];
      for (const c of cases) {
        const page = await open("exam-dashboard.html", { init: c.init });
        await page.waitFor(`!!document.querySelector("${NOTE}")`, 8000);
        await sleep(1500); // let the page finish its own loading
        const before = page.requests.length;
        await click(page, "send");
        const state = await page.waitFor(`(() => { const m = document.querySelector("${NOTE} .lq-fit-msg"); return m && m.dataset.state && m.offsetHeight ? m.dataset.state : false; })()`, 4000);
        await sleep(1000);
        const after = page.requests.slice(before);
        assert(state === c.want, `${c.name}: state ${state}, want ${c.want}`);
        assert(!after.length, `${c.name}: network request(s) after send: ` + after.map(r => r.method + " " + r.url).join(", "));
        const got = await page.evaluate(sel => ({ url: location.href, shared: window.__shared || [], copied: window.__copied || null,
          field: (document.querySelector(sel + " .lq-fit-link") || {}).value || null }), NOTE);
        if (c.want === "shared") assert(got.shared.length === 1 && got.shared[0].url === got.url, "shared " + JSON.stringify(got));
        if (c.want === "copied") assert(got.copied === got.url, "copied " + JSON.stringify(got));
        if (c.want === "manual") assert(got.field === got.url, "link to copy by hand " + JSON.stringify(got));
        assert(await noteInfo(page), c.name + ": the notice stays until the user continues");
        noErr(page, c.name);
        await page.close();
      }
    });

    await check("English and Chinese wording; no Thai left in the notice", async () => {
      for (const [lang, re] of [["en", /best on a computer/i], ["zh", /电脑/]]) {
        const page = await open("exam-dashboard.html", { query: "nosw&lang=" + lang });
        await page.waitFor(`!!document.querySelector("${NOTE}")`, 8000);
        await sleep(800);
        const n = await noteInfo(page);
        assert(n && re.test(n.text), lang + ": " + (n && n.text));
        assert(!/[฀-๿]/.test(n.text), lang + ": Thai left: " + n.text);
        assert(n.lang === lang, lang + ": lang attribute " + n.lang);
        noErr(page, lang);
        await page.close();
      }
    });

    await check("phone: a tablet page (crowd) shows the tablet wording and does not start the camera", async () => {
      const page = await open("crowd.html");
      await page.waitFor(`!!document.querySelector("${NOTE}")`, 8000);
      await sleep(500);
      const n = await noteInfo(page);
      assert(n && /แท็บเล็ต/.test(n.text), "tablet wording: " + (n && n.text));
      assert((await page.evaluate(() => window.__gum)) === 0, "camera started by the notice");
      noErr(page, "crowd");
      await page.close();
    });

    await check("no notice on phone / any pages on a phone", async () => {
      for (const f of ["tarot.html", "medicine.html", "attendance.html", "index.html"]) {
        const page = await open(f);
        await sleep(2000);
        const has = await page.evaluate(sel => !!document.querySelector(sel), NOTE);
        assert(!has, f + " shows the notice");
        await page.close();
      }
    });

    await check("no notice on a computer page at desktop width (touch or not) or in a narrow desktop window without touch", async () => {
      const variants = [
        { metrics: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, touch: false },
        { metrics: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, touch: true },
        { metrics: { width: 390, height: 844, deviceScaleFactor: 1, mobile: false }, touch: false }
      ];
      for (const v of variants) {
        const page = await open("exam-dashboard.html", v);
        await sleep(2000);
        const has = await page.evaluate(sel => !!document.querySelector(sel), NOTE);
        assert(!has, "notice shown at " + JSON.stringify(v));
        noErr(page, "desktop");
        await page.close();
      }
    });

    await check("the device value is shown in the menu, the category page and the solutions catalogue", async () => {
      const desk = { metrics: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false }, touch: false };
      let page = await open("index.html", desk);
      const menu = await page.waitFor(() => {
        const a = document.querySelector('#siteNav .mega-links a[href="exam-dashboard.html"] .lq-fit-tag');
        const b = document.querySelector('#siteNav .mega-links a[href="crowd.html"] .lq-fit-tag');
        return a && b ? { a: a.dataset.fit + ":" + a.textContent, b: b.dataset.fit + ":" + b.textContent } : false;
      }, 8000);
      assert(/^computer:.*คอมพิวเตอร์/.test(menu.a) && /^tablet:.*แท็บเล็ต/.test(menu.b), "menu " + JSON.stringify(menu));
      await page.close();
      page = await open("cat-education.html", { ...desk, query: "nosw&lang=en" });
      const cat = await page.waitFor(() => {
        const el = document.querySelector('.cat-tool[data-page="exam-lab"] [data-fit]');
        return el && window.LQI18N && LQI18N.lang === "en" && /computer/i.test(el.textContent) ? el.dataset.fit + ":" + el.textContent.trim() : false;
      }, 8000);
      assert(/^computer:/.test(cat), "category page " + cat);
      await page.close();
      page = await open("solutions.html", desk);
      const sol = await page.waitFor(() => {
        const go = document.querySelector('.sl-card a.sl-go[href="exam.html"]');
        const card = go && go.closest(".sl-card");
        const el = card && card.querySelector(".lq-fit-tag");
        return el ? el.dataset.fit + ":" + el.textContent.trim() : false;
      }, 8000);
      assert(/^computer:/.test(sol), "solutions card for exam.html (overview: shows its working pages' value) " + sol);
      noErr(page, "solutions");
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
