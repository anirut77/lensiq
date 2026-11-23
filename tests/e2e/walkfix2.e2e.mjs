// tests/e2e/walkfix2.e2e.mjs — second customer walk-through 2026-11-16 (~/LENSIQ-field/review/walkthrough-2026-11-16/DEFECTS.md),
// browser checks in Chrome (fake camera). FIXED TEST: written and locked (~/LENSIQ-field/evals/walk-fix-2/, sha256 in
// evals-locks/walk-fix-2.sha256) BEFORE the fixes on branch walk-fix-2. Static checks: tests/unit/walkfix2.test.js; iPhone
// (WebKit): tests/e2e/walkfix2-webkit.e2e.mjs.
//   D-01  attendance.html?mode=employee: no camera request and no face-model download on open, no camera error next to the
//         PIN form (camera refused); choosing face (the "check-in" tab) starts the camera (TH / EN / ZH)
//   D-03  help.html shows the same quote LINE OA as the home page (LENSIQ_SELLER.quote_line) in TH / EN / ZH
//   D-04  index.html?interest=exam#contact at 1366 × 768: the form heading, the delivery note and the Name field are on
//         screen and not under the sticky header (TH / ZH)
//   D-10  omr.html?demo=1: sample sheets are read and scored without a camera and nothing is stored in this browser
//   D-12 / D-13 / D2-007  every page that opens the camera has a visible camera-off control in the page language that
//         stops every track: palm, teamface, attendance, customers, driver, faceread, photobooth, exam-lab (TH / EN / ZH)
//   D-14  signage, camera refused: the message has no raw error code and the retry button is its own control (EN / ZH)
//   D2-011 photobooth and converter make no /api/tryon/status or /api/convert/status request and log no error on load
// Synthetic data and Chrome's fake camera only; no person is photographed.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const THAI = /[฀-๿]/;
const HAN = /[一-鿿]/;
const inLang = (l, t) => (l === "th" ? THAI.test(t) : !THAI.test(t) && (l === "en" ? /[a-z]/i.test(t) : HAN.test(t)));
const LANG = l => `try { localStorage.setItem("lq-lang", ${JSON.stringify(l)}); } catch (e) {} window.confirm = () => true; window.alert = () => {}; window.print = () => {};`;
// records every camera request and every track handed out (the real fake-device stream is kept)
const GUM = `(() => { window.__gum = 0; window.__tracks = []; const md = navigator.mediaDevices; if (!md || !md.getUserMedia) return;
  const real = md.getUserMedia.bind(md);
  md.getUserMedia = async c => { window.__gum++; if (window.__deny) throw new DOMException("Permission denied", "NotAllowedError");
    const s = await real(c); s.getTracks().forEach(t => window.__tracks.push(t)); return s; }; })();`;
const DENY = `window.__deny = true;`;
const desk = page => page.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
const ready = async (page, l) => {
  const L = JSON.stringify(l);
  await page.waitFor(`(window.LQI18N || ${L} === "th") && document.documentElement.lang.slice(0, 2) === ${L}`, 15000);
  await sleep(500);
};
// a visible camera-off control in each language ("เปิดกล้อง" = camera ON contains "ปิดกล้อง", so it is excluded)
const OFF = { th: "(^|[^เ])ปิดกล้อง", en: "camera off|turn off (the )?camera|stop (the )?camera|close (the )?camera", zh: "关闭摄像头|关闭相机" };

/** pages that open a camera, and how a user starts it (auto = the page opens it on load) */
const CAM_PAGES = [
  { page: "palm.html", start: "#plStartCam" },
  { page: "faceread.html", start: "#frStartCam" },
  { page: "teamface.html", start: "#tfCamBtn" },
  { page: "attendance.html?mode=training", start: null },
  { page: "customers.html", start: null },
  { page: "driver.html", start: null },
  { page: "photobooth.html", start: null },
  { page: "exam-lab.html", start: "exam" }
];

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const open = async (url, lang, extra = []) => {
    const p = await browser.newPage(null, { initScripts: [LANG(lang), GUM, ...extra], isolated: true, timeout: 30000 });
    await desk(p);
    await p.goto(url);
    return p;
  };
  try {
    // ---------- D-01 ----------
    for (const l of LANGS) {
      await check(`D-01 [${l}] attendance PIN / QR: no camera or face models on open, no camera error; face tab starts the camera`, async () => {
        const page = await open(`${base}/attendance.html?mode=employee&cpu&nosw`, l, [DENY]);
        try {
          await ready(page, l);
          await page.waitFor(`!!window.LQHR`, 15000);
          await sleep(3000);
          const r = await page.evaluate(() => {
            const vis = e => !!e && !e.closest("[hidden]") && !e.classList.contains("hide") && e.getClientRects().length > 0;
            const cm = document.getElementById("camMsg"), bn = document.getElementById("banner");
            return {
              gum: window.__gum,
              models: performance.getEntriesByType("resource").map(e => e.name).filter(n => /vendor\/models\//.test(n)),
              pinActive: document.getElementById("tabPin").classList.contains("active"),
              camMsg: vis(cm) ? cm.textContent.trim() : "", bannerErr: !!bn && /\berr\b/.test(bn.className) && vis(bn) ? bn.textContent.trim() : ""
            };
          });
          assert(r.pinActive, "PIN / QR tab is the default");
          assert(r.gum === 0, `camera requested ${r.gum} time(s) on open in PIN / QR mode`);
          assert(!r.models.length, "face models downloaded on open: " + r.models.slice(0, 3).join(", "));
          assert(!/ไม่พร้อม|ไม่ได้รับอนุญาต|not ready|permission|未就绪|权限|NotAllowed/i.test(r.camMsg), "camera error shown: " + r.camMsg);
          assert(!r.bannerErr, "error banner shown: " + r.bannerErr);
          await page.evaluate(() => /** @type {HTMLElement} */ (document.querySelector('.tab[data-t="checkin"]')).click());
          await page.waitFor(`window.__gum > 0`, 8000).catch(() => {});
          assert(await page.evaluate(() => window.__gum) > 0, "choosing face check-in did not start the camera");
        } finally { await page.close(); }
      });
    }

    // ---------- D-03 ----------
    for (const l of LANGS) {
      await check(`D-03 [${l}] help.html support section shows the quote LINE OA`, async () => {
        const page = await open(`${base}/help.html?nosw`, l);
        try {
          await ready(page, l);
          const r = await page.evaluate(lang => {
            const id = lang === "th" ? "h-support" : lang + "-h-support";
            const sec = document.getElementById(id), want = String((window.LENSIQ_SELLER || {}).quote_line || "").trim();
            const links = sec ? [...sec.querySelectorAll("a[href*='line.me']")].filter(a => a.getClientRects().length) : [];
            return { want: want ? (want[0] === "@" ? want : "@" + want) : "", got: links.map(a => a.textContent.trim()), visible: !!sec && sec.getClientRects().length > 0 };
          }, l);
          assert(r.want, "LENSIQ_SELLER.quote_line is set");
          assert(r.visible, "support section visible in " + l);
          assert(r.got.includes(r.want), `support section LINE ${JSON.stringify(r.got)} != ${r.want}`);
        } finally { await page.close(); }
      });
    }

    // ---------- D-04 (desktop) ----------
    for (const l of ["th", "zh"]) {
      await check(`D-04 [${l}] index.html?interest=exam#contact at 1366 × 768: heading, note and Name field on screen`, async () => {
        const page = await open(`${base}/index.html?interest=exam&nosw#contact`, l);
        try {
          await sleep(2500);
          const r = await page.evaluate(() => {
            const nav = document.getElementById("siteNav"), nb = nav ? nav.getBoundingClientRect().bottom : 0;
            const box = id => { const e = document.getElementById(id); if (!e || !e.getClientRects().length) return null; const b = e.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom) }; };
            return { nav: Math.round(nb), h: innerHeight, title: box("ct-title"), note: box("leadNote") || box("leadNotice"), name: box("lqName"), v: document.getElementById("lqInterest").value };
          });
          assert(r.v === "exam", "Exam preselected");
          for (const k of ["title", "note", "name"]) {
            const b = r[k];
            assert(b && b.top >= r.nav - 1 && b.bottom <= r.h, `${k} not fully on screen below the header: ${JSON.stringify(r)}`);
          }
        } finally { await page.close(); }
      });
    }

    // ---------- D-10 ----------
    await check("D-10 omr.html?demo=1: sample sheets scored without a camera; nothing stored", async () => {
      const page = await open(`${base}/omr.html?demo=1&nosw`, "th");
      try {
        await page.waitFor(`document.querySelectorAll("#resBody tr").length >= 3`, 20000).catch(() => {});
        const r = await page.evaluate(() => ({
          rows: [...document.querySelectorAll("#resBody tr")].map(tr => tr.textContent.trim()),
          gum: window.__gum, stored: Object.keys(localStorage).filter(k => /omr/i.test(k))
        }));
        assert(r.rows.length >= 3, "sample results: " + r.rows.length);
        assert(r.rows.every(t => /\d+\/\d+/.test(t)), "each sample sheet has a score: " + r.rows.join(" | "));
        assert(r.gum === 0, "demo opened the camera");
        assert(!r.stored.length, "demo stored data in this browser: " + r.stored);
      } finally { await page.close(); }
    });

    // ---------- D-12 / D-13 / D2-007 ----------
    for (const cp of CAM_PAGES) {
      for (const l of LANGS) {
        await check(`camera off [${l}] ${cp.page}: a visible control stops every track`, async () => {
          const page = await open(`${base}/${cp.page}${cp.page.includes("?") ? "&" : "?"}cpu&fakedet&nosw`, l);
          try {
            await ready(page, l);
            if (cp.start === "exam") {
              await page.evaluate(() => {
                /** @type {HTMLInputElement} */ (document.getElementById("room")).value = "R1";
                /** @type {HTMLInputElement} */ (document.getElementById("seat")).value = "3";
                /** @type {HTMLInputElement} */ (document.getElementById("consent")).checked = true;
                /** @type {HTMLFormElement} */ (document.getElementById("noticeForm")).requestSubmit();
              });
            } else if (cp.start) {
              await page.waitFor(`!!document.querySelector(${JSON.stringify(cp.start)})`, 10000);
              await page.evaluate(sel => /** @type {HTMLElement} */ (document.querySelector(sel)).click(), cp.start);
            }
            await page.waitFor(`window.__tracks.some(t => t.readyState === "live")`, 20000).catch(() => {});
            assert(await page.evaluate(() => window.__tracks.some(t => t.readyState === "live")), "the camera did not start");
            await sleep(1500);
            const found = await page.evaluate(re => {
              const rx = new RegExp(re, "i");
              const vis = e => e.getClientRects().length > 0 && !e.closest("[hidden]") && getComputedStyle(e).visibility !== "hidden" && !e.disabled;
              const b = [...document.querySelectorAll("button, [role=button]")].find(e => vis(e) && rx.test((e.textContent || "").trim() || e.getAttribute("aria-label") || ""));
              if (!b) return { ok: false, all: [...document.querySelectorAll("button")].filter(vis).map(e => e.textContent.trim()).slice(0, 25) };
              b.setAttribute("data-wf2-off", "1");
              return { ok: true, text: b.textContent.trim() };
            }, OFF[l]);
            assert(found.ok, `no visible camera-off control in ${l}; buttons: ${JSON.stringify(found.all)}`);
            await page.evaluate(() => /** @type {HTMLElement} */ (document.querySelector("[data-wf2-off]")).click());
            await page.waitFor(`window.__tracks.every(t => t.readyState === "ended")`, 5000).catch(() => {});
            await sleep(1500);
            const left = await page.evaluate(() => window.__tracks.filter(t => t.readyState === "live").length);
            assert(left === 0, `${left} camera track(s) still live after "${found.text}"`);
          } finally { await page.close(); }
        });
      }
    }

    // ---------- D-14 ----------
    for (const l of ["en", "zh"]) {
      await check(`D-14 [${l}] signage, camera refused: plain message, retry is its own button`, async () => {
        const page = await open(`${base}/signage.html?cpu&nosw`, l, [DENY]);
        try {
          await ready(page, l);
          await page.evaluate(() => /** @type {HTMLElement} */ (document.getElementById("startFace")).click());
          await page.waitFor(`/\\berr\\b/.test(document.getElementById("engine").className)`, 15000).catch(() => {});
          await sleep(900);
          const r = await page.evaluate(() => {
            const e = document.getElementById("engine"), btn = e.querySelector("button");
            const own = [...e.childNodes].filter(n => n !== btn).map(n => n.textContent).join("").trim();
            return { err: /\berr\b/.test(e.className), own, btn: btn ? btn.textContent.trim() : "" };
          });
          assert(r.err, "no error shown");
          assert(!/NotAllowedError|Permission denied|\(\w+Error/.test(r.own), "raw error code in the message: " + r.own);
          assert(inLang(l, r.own), `message not in ${l}: ${r.own}`);
          assert(r.btn && inLang(l, r.btn), "retry button in " + l + ": " + r.btn);
        } finally { await page.close(); }
      });
    }

    // ---------- D2-011 ----------
    for (const p of ["photobooth.html", "converter.html"]) {
      await check(`D2-011 ${p}: no server status request and no console error on load`, async () => {
        const page = await open(`${base}/${p}?cpu&fakedet&nosw`, "th");
        try {
          await sleep(4000);
          const asked = page.requests.map(q => q.url).filter(u => /\/api\/(tryon|convert)\/status/.test(u));
          assert(!asked.length, "status requested: " + asked.join(", "));
          const errs = page.consoleErrors.filter(e => /404|Failed to load resource/.test(e.text || ""));
          assert(!errs.length, "console errors: " + errs.map(e => e.text).join(" | "));
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
