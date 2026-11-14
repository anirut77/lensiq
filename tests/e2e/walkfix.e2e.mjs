// tests/e2e/walkfix.e2e.mjs — buyer walkthrough 2026-11-14 (~/LENSIQ-field/review/walkthrough-2026-11-14/DEFECTS.md), browser checks
// in Chrome. FIXED TEST: written and locked (~/LENSIQ-field/evals/walk-fix/, sha256 in evals-locks/walk-fix.sha256) BEFORE the
// fixes on branch walk-fix. Static checks: tests/unit/walkfix.test.js; WebKit: tests/e2e/walkfix-webkit.e2e.mjs.
//   W-017  index.html?interest=exam#contact: the form is on screen 1.5 s after load (desktop 1366 × 768) and Exam is preselected
//   W-004  attendance.html?mode=employee&demo=1: PIN / QR tab active first, h1 says PIN / QR in TH / EN / ZH, face tabs kept
//   W-026  attendance tab labels at 1366 px wrap to at most 2 lines; "ดูรายวัน" in the month table stays on one line
//   W-019  exam-dashboard.html?demo=1: no hall-mode flag (source hall or a hall signal) and no "whole room" seat
//   W-022  the seat map starts right under its heading (no tall empty gap above the seats) at 1366 px
//   W-037  at 375 px the "import file" controls stay inside the screen
//   W-021  exam-lab.html?demo=1 exam screen: the pill does not say the camera is running
//   W-008  village.html?demo=1: a sample operator is pre-filled; "use the sample image" before the PDPA step guides to the step
//          (setup in view, first box focused, message names the boxes); after the sample image the status names "อ่านป้ายตอนนี้"
// Synthetic data only; no camera (demo pages use none); every request stays on the origin.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const initFor = lang => `try { localStorage.setItem('lq-lang', '${lang}'); } catch (e) {} window.confirm = () => true; window.alert = () => {}; window.print = () => {};`;
const desk = page => page.send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
const phone = page => page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
const HALL = ["empty", "back", "early", "extra", "aisle", "lean", "neighbour"];

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const fresh = async (lang = "th") => {
    const p = await browser.newPage(null, { initScripts: [initFor(lang)], isolated: true });
    await desk(p);
    return p;
  };
  try {
    await check("W-017: index.html?interest=exam#contact — form on screen after 1.5 s, Exam preselected", async () => {
      const page = await fresh();
      try {
        await page.goto(`${base}/index.html?interest=exam&nosw#contact`);
        await sleep(1500);
        const r = await page.evaluate(() => {
          const f = document.getElementById("contact"), sel = document.getElementById("lqInterest");
          const b = (sel || f).getBoundingClientRect();
          return { top: b.top, bottom: b.bottom, h: innerHeight, v: sel ? sel.value : "" };
        });
        assert(r.v === "exam", "Exam preselected: " + r.v);
        assert(r.top >= 0 && r.bottom <= r.h, "the interest field is on screen: " + JSON.stringify(r));
      } finally { await page.close(); }
    });

    for (const lang of ["th", "en", "zh"]) {
      await check(`W-004 / W-026 [${lang}]: attendance employee demo — PIN / QR first and active, h1 PIN / QR, tabs readable`, async () => {
        const page = await fresh(lang);
        try {
          await page.goto(`${base}/attendance.html?mode=employee&demo=1&cpu&fakedet&nosw`);
          await page.waitFor("window.LQHR && window.LQI18N && document.body.classList.contains('att-emp')", 15000);
          await sleep(900);
          const r = await page.evaluate(() => {
            // amendment 4: on-screen order (left to right, top to bottom), not DOM order (attendance-hr.e2e.mjs pins the DOM order)
            const tabs = [...document.querySelectorAll(".tabs .tab")].filter(t => t.offsetParent)
              .sort((a, b) => { const p = a.getBoundingClientRect(), q = b.getBoundingClientRect(); return Math.round(p.top) - Math.round(q.top) || p.left - q.left; });
            const lines = el => { const rg = document.createRange(); rg.selectNodeContents(el); return new Set([...rg.getClientRects()].filter(x => x.width > 1).map(x => Math.round(x.top))).size; };
            const h1 = document.querySelector("h1");
            return {
              first: tabs[0] && tabs[0].dataset.t, active: (document.querySelector(".tabs .tab.active") || {}).dataset?.t,
              pinShown: !document.querySelector("#pane-pin").hidden, checkinShown: !document.querySelector("#pane-checkin").hidden,
              h1: h1.innerText, faceTabs: ["checkin", "register"].every(t => document.querySelector(`.tab[data-t="${t}"]`)),
              tabLines: tabs.map(t => [t.dataset.t, lines(t)])
            };
          });
          assert(r.first === "pin" && r.active === "pin", "PIN / QR first and active: " + JSON.stringify(r));
          assert(r.pinShown && !r.checkinShown, "PIN pane shown, face pane not: " + JSON.stringify(r));
          assert(/PIN/.test(r.h1) && /QR/.test(r.h1), "h1 names PIN / QR: " + r.h1);
          assert(r.faceTabs, "face tabs kept");
          assert(r.tabLines.every(([, n]) => n <= 2), "tab labels wrap to at most 2 lines: " + JSON.stringify(r.tabLines));
          if (lang === "th") {
            await page.evaluate(() => document.querySelector('.hr-tab[data-h="month"]').click());
            await sleep(500);
            const d = await page.evaluate(() => [...document.querySelectorAll("[data-day]")].filter(b => b.offsetParent).map(b => {
              const rg = document.createRange(); rg.selectNodeContents(b);
              return new Set([...rg.getClientRects()].filter(x => x.width > 1).map(x => Math.round(x.top))).size;
            }));
            assert(d.length >= 1 && d.every(n => n === 1), "'ดูรายวัน' on one line: " + JSON.stringify(d));
          }
        } finally { await page.close(); }
      });
    }

    await check("W-019 / W-022 / W-037: exam dashboard demo — lab flags only, seats under the heading, import controls inside 375 px", async () => {
      const page = await fresh();
      try {
        await page.goto(`${base}/exam-dashboard.html?demo=1&nosw`);
        await page.waitFor("window.__LQ_EXAM_DB && __LQ_EXAM_DB.board && __LQ_EXAM_DB.board.alerts.length > 0 && document.querySelectorAll('#seatMap .seat').length > 0", 10000);
        await sleep(600);
        const r = await page.evaluate(H => {
          const a = __LQ_EXAM_DB.board.alerts;
          const hall = a.filter(x => x.src === "hall" || H.includes(x.sig) || !x.seat);
          const hd = document.querySelector("#mapH").getBoundingClientRect(), s = document.querySelector("#seatMap .seat").getBoundingClientRect();
          return { n: a.length, hall: hall.map(x => x.sig + "@" + (x.seat || "-")), gap: s.top - hd.bottom, text: document.body.innerText };
        }, HALL);
        assert(r.n >= 10, "sample flags present: " + r.n);
        assert(!r.hall.length, "no hall-mode flag in the lab demo: " + r.hall.join(", "));
        assert(!/เอนตัวเข้าเขตที่นั่งข้างเคียง|มีคนยืนในทางเดิน/.test(r.text), "no hall wording on the page");
        assert(r.gap < 120, "seats start under the heading (gap " + Math.round(r.gap) + " px)");
        await phone(page);
        await sleep(500);
        const m = await page.evaluate(() => {
          const d = document.querySelector("#importFile").closest("details"); d.open = true;
          return new Promise(res => setTimeout(() => {
            const els = [d.querySelector("summary"), ...d.querySelectorAll("label, input, p")];
            res({ right: Math.max(...els.map(e => e.getBoundingClientRect().right)), w: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth });
          }, 300));
        });
        assert(m.right <= m.w + 0.5 && m.sw <= m.w, "import controls inside the screen: " + JSON.stringify(m));
      } finally { await page.close(); }
    });

    for (const lang of ["th", "en", "zh"]) {
      await check(`W-021 [${lang}]: exam-lab demo exam screen does not say the camera is running`, async () => {
        const page = await fresh(lang);
        try {
          await page.goto(`${base}/exam-lab.html?demo=1&nosw`);
          await page.waitFor("window.__LQ_EXAM_LAB && window.LQI18N", 10000);
          await page.evaluate(() => {
            if (!document.querySelector("#room").value) document.querySelector("#room").value = "DEMO";
            if (!document.querySelector("#seat").value) document.querySelector("#seat").value = "3";
            const c = document.querySelector("#consent"); if (!c.checked) c.click();
            document.querySelector("#toCam").click();
          });
          await page.waitFor(`window.__LQ_EXAM_LAB.phase === "exam"`, 10000);
          await sleep(600);
          const t = await page.evaluate(() => { const m = document.querySelector("#monitor"); return { shown: !m.hidden, text: m.innerText }; });
          assert(t.shown, "the indicator is still shown");
          assert(!/ทำงานอยู่|is on|is running|运行中/.test(t.text), "does not say the camera is running: " + t.text);
          assert(/สาธิต|[Dd]emo|演示/.test(t.text), "says it is the demo: " + t.text);
        } finally { await page.close(); }
      });
    }

    await check("W-008: village demo — operator pre-filled, the sample button guides to the PDPA step, then names 'อ่านป้ายตอนนี้'", async () => {
      const page = await fresh();
      try {
        await page.goto(`${base}/village.html?demo=1&cpu&fakedet&nosw`);
        await page.waitFor(`document.querySelector("#gkAck1") && document.querySelector("#gkDemoBtn")`, 10000);
        await sleep(400);
        const op = await page.evaluate(() => document.querySelector("#gkOp").value);
        assert(op.trim().length > 2 && /ตัวอย่าง/.test(op), "sample operator pre-filled: " + op);
        await page.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); document.querySelector("#gkDemoBtn").click(); });
        await sleep(900);
        const g = await page.evaluate(() => {
          const s = document.querySelector("#gkAck1").getBoundingClientRect();
          const st = [...document.querySelectorAll("[role=status], .gk-status, #gkStatus")].map(e => e.innerText).join(" | ");
          return { inView: s.top >= 0 && s.bottom <= innerHeight, focus: document.activeElement && document.activeElement.id, st };
        });
        assert(g.inView, "PDPA step scrolled into view: " + JSON.stringify(g));
        assert(g.focus === "gkAck1", "first box focused: " + g.focus);
        assert(/ติ๊ก/.test(g.st) && /เริ่มใช้งาน/.test(g.st), "message names the boxes and the start button: " + g.st);
        await page.evaluate(() => { for (const id of ["gkAck1", "gkAck2"]) { const c = document.getElementById(id); if (!c.checked) c.click(); } document.querySelector("#gkAckBtn").click(); });
        await sleep(300);
        await page.evaluate(() => document.querySelector("#gkDemoBtn").click());
        await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
        await sleep(300);
        const st2 = await page.evaluate(() => [...document.querySelectorAll("[role=status], .gk-status, #gkStatus")].map(e => e.innerText).join(" | "));
        assert(/อ่านป้ายตอนนี้/.test(st2), "after the sample image the status names the read button: " + st2);
        const out = page.requests.filter(q => { try { return new URL(q.url).origin !== new URL(base).origin && !q.url.startsWith("data:") && !q.url.startsWith("blob:"); } catch { return false; } });
        assert(!out.length, "requests left the origin: " + out.map(q => q.url).slice(0, 3).join(", "));
      } finally { await page.close(); }
    });
  } finally {
    await browser.close();
  }
}
