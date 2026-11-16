// tests/e2e/fortune-share-print-webkit.e2e.mjs — FIXED TEST SET, owner order 2026-11-16 items 1-2 ("fortune share & print"), on
// an iPhone profile at 375 px (Playwright WebKit = the iOS Safari engine).
// Written and locked BEFORE the build (~/LENSIQ-field/evals/fortune-share-print/, sha256 in evals-locks/fortune-share-print.sha256).
// Chrome half: tests/e2e/fortune-share-print.e2e.mjs; pure half: tests/unit/fortune-share-print.test.js.
// Pages without a camera step (horoscope, iching, numbers, tarot, planner, report), TH; horoscope also EN / ZH:
//   W1  a visible share button and print button with the result
//   W2  share without a working share sheet: the dialog offers LINE, Facebook and "save image", toggles off, a preview
//   W3  zero network requests (any origin) while the card is made and LINE / Facebook / save image are used
//   W4  print media (page.emulateMedia): only the print view, no nav / buttons / menus / help bar, groups expanded,
//       disclaimer printed, every colour swatch labelled
//   W5  crisis state: no share or print button, share() / print() refuse
import { webkit, devices } from "playwright";
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const PHONE = { ...devices["iPhone 13"], viewport: { width: 375, height: 812 }, serviceWorkers: "block" };
const LINE = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
// init scripts are not subject to the page CSP; evaluate callbacks never use eval / new Function (the CSP forbids it)
const STUBS = `(() => {
  window.__sp = { opened: [], saved: [], printed: 0 };
  window.__spVis = e => { if (!e || !e.isConnected) return false; for (let a = e; a; a = a.parentElement) { if (a.hidden) return false; const c = getComputedStyle(a);
    if (c.display === "none" || c.visibility === "hidden" || c.opacity === "0") return false; } const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  try { delete Navigator.prototype.share; delete Navigator.prototype.canShare; } catch (e) {}
  try { Object.defineProperty(navigator, "share", { value: undefined, configurable: true }); Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true }); } catch (e) {}
  window.open = (u) => { window.__sp.opened.push(String(u)); return null; };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__sp.saved.push({ name: this.download, href: String(this.href).slice(0, 5) }); return; } return click.call(this); };
  window.print = () => { window.__sp.printed++; };
})();`;

const nSec = n => document.querySelectorAll(".fa-section").length >= n && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section");
const PAGES = {
  horoscope: async page => {
    await page.evaluate(() => { for (const [id, v] of [["hsDay", "15"], ["hsMonth", "8"], ["hsYear", "1990"]]) { const e = document.getElementById(id); e.value = v;
      e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } });
    await page.evaluate(() => document.getElementById("hsGo").click()); await page.waitForFunction(nSec, 3, { timeout: 20000, polling: 100 });
  },
  iching: async page => { await page.evaluate(() => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await page.waitForFunction(nSec, 3, { timeout: 20000, polling: 100 }); },
  numbers: async page => { await page.fill("#nmPhone", "0812345678"); await page.click("#nmGo"); await page.waitForFunction(nSec, 2, { timeout: 15000, polling: 100 }); },
  tarot: async page => {
    await page.evaluate(() => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); });
    await sleep(600); await page.evaluate(() => document.getElementById("trAuto").click()); await sleep(900); await page.evaluate(() => document.getElementById("trReveal").click());
    await page.waitForFunction(nSec, 3, { timeout: 25000, polling: 100 });
  },
  planner: async page => { await page.evaluate(() => document.getElementById("plGo").click()); await page.waitForFunction(() => !document.getElementById("plResult").hidden && document.querySelectorAll("#plList li").length > 0, null, { timeout: 10000, polling: 100 }); },
  report: async page => {
    await page.waitForFunction(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, null, { timeout: 8000, polling: 100 });
    await page.evaluate(() => { document.querySelector('[data-rp-type="report_basic"]').click(); document.getElementById("rpAYear").value = "2533"; document.getElementById("rpGo").click(); });
    await page.waitForFunction(() => document.querySelectorAll("#rpOut .rp-part").length >= 3, null, { timeout: 10000, polling: 100 });
  },
};


async function open(browser, base, p, lang) {
  const ctx = await browser.newContext(PHONE);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e && e.message || e).slice(0, 200)));
  const requests = [];
  page.on("request", r => requests.push(r.url()));
  await page.addInitScript(`try { localStorage.setItem("lq-lang", ${JSON.stringify(lang)}); } catch (e) {}`);
  await page.addInitScript(STUBS);
  await page.goto(`${base}/${p}.html?nosw`, { waitUntil: "load", timeout: 60000 });
  await sleep(800);
  return { ctx, page, errors, requests };
}
const buttons = page => page.evaluate(() => { const vis = window.__spVis;
  return { api: !!window.LQShare, share: [...document.querySelectorAll('[data-lq-sp="share"]')].filter(vis).length, print: [...document.querySelectorAll('[data-lq-sp="print"]')].filter(vis).length };
});
const clickVisible = (page, sel) => page.evaluate(s => { const b = [...document.querySelectorAll(s)].find(window.__spVis); if (!b) return false; b.click(); return true; }, sel);

export default async function ({ base, check }) {
  const browser = await webkit.launch();
  try {
    const runs = Object.keys(PAGES).map(p => [p, "th"]).concat([["horoscope", "en"], ["horoscope", "zh"]]);
    for (const [p, lang] of runs) {
      const tag = `[${p}/${lang}] iPhone 375`;
      let o = null, err = null;
      try { o = await open(browser, base, p, lang); await PAGES[p](o.page); await sleep(600); } catch (e) { err = e; }
      const need = () => { if (err) throw new Error("no result: " + err.message); };
      try {
        await check(`W1 ${tag}: a visible share button and print button with the result`, async () => {
          need();
          const b = await buttons(o.page);
          assert(b.api && b.share >= 1 && b.print >= 1, JSON.stringify(b));
        });
        await check(`W2+W3 ${tag}: no share sheet → LINE, Facebook, save image; toggles off; zero network requests`, async () => {
          need();
          await o.page.evaluate(() => window.LQShare.ready());
          const n0 = o.requests.length;
          assert(await clickVisible(o.page, '[data-lq-sp="share"]'), "no share button");
          await o.page.waitForFunction(() => !!(window.LQShare.last && document.getElementById("lqSpPreview") && /^blob:|^data:/.test(document.getElementById("lqSpPreview").src)), null, { timeout: 15000, polling: 100 });
          const d = await o.page.evaluate(() => { const vis = window.__spVis; const q = s => document.querySelector("#lqShareDlg " + s);
            const t = id => { const e = document.getElementById(id); return e ? { vis: vis(e), on: e.checked } : null; };
            return { native: !!q('[data-lq-sp-act="native"]') && vis(q('[data-lq-sp-act="native"]')), line: vis(q('[data-lq-sp-act="line"]')), fb: vis(q('[data-lq-sp-act="fb"]')),
              save: vis(q('[data-lq-sp-act="save"]')), birth: t("lqSpBirth"), photo: t("lqSpPhoto"), last: { photo: window.LQShare.last.photo, birth: window.LQShare.last.birth } };
          });
          assert(!d.native && d.line && d.fb && d.save, "fallback buttons " + JSON.stringify(d));
          assert(d.last.photo === false && d.last.birth === false && (!d.birth || !d.birth.on) && (!d.photo || !d.photo.vis), "defaults " + JSON.stringify(d));
          for (const k of ["line", "fb", "save"]) { await o.page.click(`#lqShareDlg [data-lq-sp-act="${k}"]`); await sleep(400); }
          await sleep(800);
          const r = await o.page.evaluate(() => window.__sp);
          const net = o.requests.slice(n0).filter(u => /^(https?|wss?):/i.test(u));
          assert(!net.length, net.length + " request(s): " + net.slice(0, 5).join(", "));
          assert(r.opened.some(u => u.startsWith("https://line.me/R/share?text=") && !/data:|blob:/.test(u)), "LINE " + JSON.stringify(r.opened));
          assert(r.opened.some(u => u.startsWith("https://www.facebook.com/sharer/sharer.php?u=")), "Facebook " + JSON.stringify(r.opened));
          assert(r.saved.length === 1 && /\.(png|jpe?g)$/.test(r.saved[0].name), "save image " + JSON.stringify(r.saved));
          await o.page.click('#lqShareDlg [data-lq-sp-act="close"]');
        });
        await check(`W4 ${tag}: print media shows only the print view: no chrome, groups expanded, disclaimer, swatches labelled`, async () => {
          need();
          assert(await clickVisible(o.page, '[data-lq-sp="print"]'), "no print button");
          await sleep(300);
          assert((await o.page.evaluate(() => window.__sp.printed)) === 1, "print dialog not opened");
          await o.page.emulateMedia({ media: "print" });
          await sleep(300);
          const r = await o.page.evaluate(line => { const vis = window.__spVis; const bad = [];
            const pv = document.getElementById("lqPrint"); if (!pv || !vis(pv)) return ["no visible print view #lqPrint"];
            for (const s of ["#siteNav", ".lq-helpbar", "button", "nav", "select", "input", ".lq-toc", "[data-lq-sp-bar]"]) { const n = [...document.querySelectorAll(s)].filter(vis).length; if (n) bad.push("printed " + s + " x" + n); }
            const others = [...document.body.children].filter(e => e !== pv && vis(e)); if (others.length) bad.push("more than the print view: " + others.map(e => e.tagName + "#" + e.id).slice(0, 3).join(","));
            const hid = [...pv.querySelectorAll(".lq-more-body")].filter(e => !vis(e)).length; if (hid) bad.push(hid + " group(s) not expanded");
            const norm = s => s.replace(/\s+/g, " ").trim(); if (!norm(pv.innerText).includes(norm(line))) bad.push("disclaimer not printed");
            const sw = [...pv.querySelectorAll("*")].filter(e => { if (!vis(e) || e.closest("svg") || (e.textContent || "").trim()) return false; const b = e.getBoundingClientRect(); if (b.width > 64 || b.height > 64) return false;
              const st = e.getAttribute("style") || ""; return /background|--c\s*:|--sw\s*:/.test(st) || /(^|[\s_-])(sw|swatch|chip|dot)([\s_-]|$)/.test(typeof e.className === "string" ? e.className : ""); });
            const lab = e => { const t = n => (n && (n.nodeType === 3 ? n.textContent : n.innerText) || "").trim(); const pt = e.parentElement ? t(e.parentElement) : ""; if (pt && pt.length <= 80) return true;
              return [e.previousSibling, e.nextSibling].some(n => { const s = t(n); return s.length > 0 && s.length <= 80; }); };
            const unl = sw.filter(e => !lab(e)); if (unl.length) bad.push(unl.length + " swatch(es) without a label");
            return bad;
          }, LINE[lang]);
          assert(!r.length, r.join("\n"));
          await o.page.emulateMedia({ media: "screen" });
          await o.page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
        });
        await check(`W5 ${tag}: crisis state: no share or print button, both refuse`, async () => {
          need();
          await o.page.evaluate(() => { window.__sp.printed = 0; window.LQFortuneCrisis.setActive(document); });
          await sleep(300);
          const b = await buttons(o.page);
          assert(!b.share && !b.print, JSON.stringify(b));
          const r = await o.page.evaluate(async () => ({ s: await window.LQShare.share(), p: window.LQShare.print(), n: window.__sp.printed }));
          assert(r.s === false && r.p === false && r.n === 0, JSON.stringify(r));
        });
      } finally { if (o) await o.ctx.close(); }
    }
  } finally { await browser.close(); }
}
