// tests/e2e/exam-dashboard-demo.e2e.mjs — Exam dashboard in sales demo mode (`exam-dashboard.html?demo=1`), "Sellable pack" stream C
// (docs/sales/README.md OP-15: "an Exam dashboard with a pre-filled sample tally"). FIXED TEST: written before the feature;
// sha256 locked in ~/LENSIQ-field/evals/sellable-c/locked.sha256.
//   1. with ?demo=1 the dashboard opens already joined to room DEMO (12 seats), with no camera and no clicks needed:
//      - the banner #lqSampleBar and the demo panel [data-lq-demo] (says: the tally is made-up sample data, NOT a measured accuracy);
//      - a pre-filled on-site tally: phone 3 right / 1 wrong, noface 2 / 3, multiface 1 / 2, fsexit 2 / 0, object 0 / 1 (all 8 / 15,
//        53 %), with the 95 % interval shown; 3 flags still open in the queue with no verdict; two sample accommodations
//        (seats 4 and 9), the sample invigilator name, a log in time order;
//      - pressing "flag was right / wrong" on an open flag changes the table; "Reload the sample data" restores it;
//   2. sample data only: real room, real board and real invigilator name already on the device are never shown and the real
//      localStorage is byte-identical afterwards; no request leaves the origin; no camera; no image or video; the CSV is
//      named SAMPLE-… and starts with the SAMPLE line;
//   3. no emotion / lie / deception / cheating wording; the tally shows sample numbers and never the words "accuracy of LENSIQ";
//   4. TH / EN / ZH: opened in each language, 0 Thai letters in EN and ZH (names included); phone 320 / 360 / 390 px;
//   5. without ?demo=1 the page is as before: no banner, no panel, empty tally, the room is not joined.
import { assert } from "./cdp.mjs";
import { noThai, phoneAudit, sleep } from "./exam-kit.mjs";

const BAR = { th: "โหมดสาธิต: ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลจริง", en: "Demo mode: sample data, not real data", zh: "演示模式：示例数据，并非真实数据" };
const FORBIDDEN = /อารมณ์|สีหน้า|โกหก|หลอกลวง|ทุจริต|emotion|expression|deception|\blie\b|\blying\b|cheat|情绪|表情|谎|欺骗|作弊/i;
// amendment 2 (2026-11-14, buyer walkthrough W-019, branch walk-fix): the lab demo shows lab signals only, so the one reviewed
// hall-mode flag (lean 0 / 1) became a lab "object" flag 0 / 1; every count, percentage and total is unchanged (8 / 15, 53 %).
const EXPECT = { fsexit: [2, 0], multiface: [1, 2], noface: [2, 3], object: [0, 1], phone: [3, 1] }; // keys sorted

const initFor = lang => `
  try { localStorage.setItem('lq-lang', '${lang}'); } catch (e) {}
  window.confirm = () => true; window.print = () => {}; window.alert = () => {};
  window.__gum = 0;
  if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
    const g = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = c => { window.__gum++; return g(c); };
  }
  window.__dl = []; window.__dlBlobs = {};
  (function () {
    const o = URL.createObjectURL.bind(URL);
    URL.createObjectURL = b => { const u = o(b); window.__dlBlobs[u] = b; return u; };
    const c = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl.push({ name: this.download, href: this.href }); return; } return c.call(this); };
  })();
`;

async function open(page, url) {
  await page.goto(url);
  await page.waitFor("window.__LQ_EXAM_DB && window.LQI18N", 10000);
}
const table = page => page.evaluate(() => {
  const pr = __LQ_EXAM_DB.board.precision();
  return { bySig: Object.fromEntries(Object.entries(pr.bySig).sort((a, b) => a[0].localeCompare(b[0])).map(([k, b]) => [k, [b.right, b.wrong]])), all: [pr.all.x, pr.all.n], text: document.querySelector("#precBody").innerText };
});

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("exam-dashboard ?demo=1: opens joined to DEMO with a pre-filled sample tally, accommodations and queue; nothing real shown or written", async () => {
      const page = await browser.newPage(null, { initScripts: [initFor("th")], isolated: true });
      try {
        // real data on the device before the demo
        await page.goto(`${base}/requirements.txt`);
        await page.evaluate(() => {
          localStorage.clear();
          localStorage.setItem("lq-exam-db", JSON.stringify({ room: "REALROOM", who: "REALNAME-ONE", seats: "1-5" }));
          localStorage.setItem("lq-exam-board-REALROOM", JSON.stringify({ v: 1, room: "REALROOM", seq: 1, alerts: [{ id: "a1", t: 1700000000000, seat: "2", sig: "phone", lvl: "check", kind: "alert", n: 1, last: 1700000000000, status: "open", acts: [], verdict: "right" }], log: [], muteUntil: 0, suppressed: 0, profiles: {}, seats: ["2"], clips: {} }));
          localStorage.setItem("lq-lang", "th");
        });
        const snap = () => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return JSON.stringify(Object.keys(o).sort().map(k => [k, o[k]])); });
        const before = await snap();
        page.requests.length = 0;

        await open(page, `${base}/exam-dashboard.html?demo=1`);
        await page.waitFor(`document.querySelector("#lqSampleBar") && document.querySelector("#lqSampleBar").innerText.trim().length > 0 && document.querySelector("[data-lq-demo]")`, 10000);
        const r0 = await page.evaluate(() => ({
          bar: document.querySelector("#lqSampleBar").innerText.replace(/\s+/g, " ").trim(), panel: document.querySelector("[data-lq-demo]").innerText,
          room: __LQ_EXAM_DB.room, roomInput: document.querySelector("#room").value, who: document.querySelector("#who").value, seats: document.querySelector("#seatRange").value,
          seatCount: document.querySelectorAll("#seatMap .seat").length, body: document.body.innerText,
          queue: document.querySelectorAll("#queue .alert").length, openNoVerdict: __LQ_EXAM_DB.board.queue(Date.now()).filter(a => !a.verdict).length,
          acc: [...document.querySelectorAll("#accList li:not(.empty) b")].map(b => b.textContent.trim()), accOutlined: document.querySelectorAll("#seatMap .seat.acc").length,
          times: __LQ_EXAM_DB.board.rows().map(r => r.t), alerts: __LQ_EXAM_DB.board.alerts.length,
          names: [...new Set(__LQ_EXAM_DB.board.alerts.flatMap(a => a.acts.map(x => x.who)))]
        }));
        assert(r0.bar.includes(BAR.th), "banner: " + r0.bar);
        assert(/เฉพาะหน้านี้/.test(r0.panel), "the demo panel says it covers this page only: " + r0.panel.slice(0, 160));
        assert(/จำลอง|สมมติ|ตัวอย่าง/.test(r0.panel) && /ไม่ใช่ความแม่นยำ/.test(r0.panel), "the panel says the tally is made-up and not a measured accuracy: " + r0.panel.slice(0, 400));
        assert(r0.room === "DEMO" && r0.roomInput === "DEMO", "joined to DEMO without a click: " + r0.room);
        assert(r0.seats === "1-12" && r0.seatCount === 12, "12 seats on the map: " + r0.seatCount);
        assert(!/REALROOM|REALNAME/.test(r0.body + r0.who + r0.roomInput), "real room / name must not be shown");
        assert(r0.who.length > 3 && /ตัวอย่าง/.test(r0.who), "the invigilator name is a sample name: " + r0.who);
        assert(r0.names.length >= 1 && r0.names.every(n => /ตัวอย่าง/.test(n)), "actions are by a sample invigilator: " + r0.names);
        assert(r0.alerts === 18, "18 sample flags: " + r0.alerts);
        assert(r0.queue === 3 && r0.openNoVerdict === 3, `3 open flags, none marked: ${r0.queue}/${r0.openNoVerdict}`);
        assert(JSON.stringify(r0.acc) === JSON.stringify(["ที่นั่ง 4", "ที่นั่ง 9"]) && r0.accOutlined === 2, "two sample accommodations: " + JSON.stringify(r0.acc));
        assert(r0.times.every((t, i) => !i || t >= r0.times[i - 1]), "log rows in time order");

        // the pre-filled tally
        const t0 = await table(page);
        assert(JSON.stringify(t0.bySig) === JSON.stringify(EXPECT), "tally per signal " + JSON.stringify(t0.bySig));
        assert(t0.all[0] === 8 && t0.all[1] === 15, "tally total 8 / 15: " + t0.all);
        for (const p of ["75%", "40%", "33%", "100%", "0%", "53%"]) assert(t0.text.includes(p), `tally shows ${p}: ${t0.text}`);
        assert(/\(\d+%–\d+%\)/.test(t0.text), "the 95% interval is shown: " + t0.text);

        // press "wrong" on an open flag -> the table moves; reload sample data -> back
        await page.evaluate(() => { const c = document.querySelector("#queue .alert"); c.querySelector("[data-v='0']").click(); });
        const t1 = await table(page);
        assert(t1.all[1] === 16 && t1.all[0] === 8, "one more wrong counted: " + t1.all);
        await page.evaluate(() => document.querySelector("#lqDemoReset").click());
        await page.waitFor("window.__LQ_EXAM_DB && __LQ_EXAM_DB.board && __LQ_EXAM_DB.board.alerts.length === 18", 10000);
        const t2 = await table(page);
        assert(JSON.stringify(t2.bySig) === JSON.stringify(EXPECT) && t2.all[1] === 15, "reload restores the sample tally " + JSON.stringify(t2.bySig));

        // the dashboard's own buttons still work on sample data (needs the sample name already filled in)
        await page.evaluate(() => { const c = document.querySelector("#queue .alert"); c.querySelector("[data-act=going]").click(); });
        assert(await page.evaluate(() => __LQ_EXAM_DB.board.alerts.some(a => a.status === "going")), "an action works with the sample invigilator name");

        // export: SAMPLE name, SAMPLE first line
        await page.evaluate(() => document.querySelector("#csvBtn").click());
        const dl = await page.evaluate(async () => { const d = window.__dl[window.__dl.length - 1]; const b = d && window.__dlBlobs[d.href]; return d ? { name: d.name, text: b ? await b.text() : null } : null; });
        assert(dl && /^SAMPLE-/i.test(dl.name) && dl.text, "CSV named SAMPLE-: " + (dl && dl.name));
        const first = dl.text.replace(/^﻿/, "").split(/\r?\n/)[0];
        assert(/SAMPLE/.test(first) && /ตัวอย่าง/.test(first), "first CSV line says SAMPLE / ตัวอย่าง: " + first.slice(0, 120));

        // privacy: no camera, no image, nothing leaves the origin, no forbidden wording
        const pv = await page.evaluate(() => ({ gum: window.__gum, media: document.querySelectorAll("img, video, canvas[data-cam]").length, text: [...document.querySelectorAll("#lqSampleBar,[data-lq-demo],#queue,#logBody,#precBody,#summary")].map(e => e.innerText).join("\n") }));
        assert(pv.gum === 0 && pv.media === 0, "no camera, no image: " + JSON.stringify({ gum: pv.gum, media: pv.media }));
        const bad = FORBIDDEN.exec(pv.text);
        assert(!bad, "forbidden wording: " + (bad && pv.text.slice(Math.max(0, bad.index - 40), bad.index + 40)));
        const origin = new URL(base).origin;
        const out = page.requests.filter(r => !/^(data|blob|about):/.test(r.url) && (() => { try { return new URL(r.url).origin !== origin; } catch { return true; } })());
        assert(!out.length, "requests left the origin: " + out.map(r => r.url).slice(0, 4).join(", "));
        assert(!page.requests.some(r => { try { return new URL(r.url).pathname.startsWith("/api/"); } catch { return false; } }), "no /api/ request");
        const ex = page.consoleErrors.filter(e => e.kind === "exception");
        assert(!ex.length, "exceptions: " + JSON.stringify(ex.slice(0, 2)));

        // real data untouched (the demo wrote only to its in-memory store)
        await page.goto(`${base}/requirements.txt`);
        const after = await snap();
        assert(before === after, "real localStorage changed by the demo\n before " + before.slice(0, 400) + "\n after  " + after.slice(0, 400));
      } finally { await page.close(); }
    });

    for (const lang of ["en", "zh"]) {
      await check(`exam-dashboard ?demo=1 opened in ${lang}: banner, panel, flags, tally and sample names with 0 Thai letters`, async () => {
        const page = await browser.newPage(null, { initScripts: [initFor(lang)], isolated: true });
        try {
          await open(page, `${base}/exam-dashboard.html?demo=1&lang=${lang}`);
          await page.waitFor(`document.querySelector("#lqSampleBar") && document.querySelector("#lqSampleBar").innerText.includes(${JSON.stringify(BAR[lang])}) && __LQ_EXAM_DB.board && __LQ_EXAM_DB.board.alerts.length === 18`, 10000);
          await sleep(500);
          const c = await page.evaluate(() => LQI18N.coverage(document.body, { top: 8, all: true }));
          assert(c.thai === 0, `${lang}: ${c.thai} Thai letters — ${(c.top || []).map(x => x.path + " «" + x.text + "»").join(" | ")}`);
          const who = await page.evaluate(() => document.querySelector("#who").value + " | " + [...new Set(__LQ_EXAM_DB.board.alerts.flatMap(a => a.acts.map(x => x.who)))].join(","));
          assert(!/[฀-๿]/.test(who), `${lang}: sample names contain Thai: ${who}`);
          const t = await table(page);
          assert(JSON.stringify(t.bySig) === JSON.stringify(EXPECT), `${lang}: same tally ` + JSON.stringify(t.bySig));
          await page.evaluate(() => document.querySelector("#csvBtn").click());
          const first = await page.evaluate(async () => { const d = window.__dl[window.__dl.length - 1]; const b = d && window.__dlBlobs[d.href]; return b ? (await b.text()).replace(/^﻿/, "").split(/\r?\n/)[0] : ""; });
          assert(/SAMPLE/.test(first), `${lang}: CSV first line: ${first.slice(0, 100)}`);
        } finally { await page.close(); }
      });
    }

    await check("exam-dashboard ?demo=1: phone layout 320 / 360 / 390 px with the sample board", async () => {
      const page = await browser.newPage(null, { initScripts: [initFor("th")], isolated: true });
      try {
        await open(page, `${base}/exam-dashboard.html?demo=1`);
        await page.waitFor("document.querySelector('[data-lq-demo]') && __LQ_EXAM_DB.board && __LQ_EXAM_DB.board.alerts.length === 18", 10000);
        await phoneAudit(page, "dashboard demo");
        await noThai(page, "dashboard demo switch", ["en", "zh"]);
      } finally { await page.close(); }
    });

    await check("exam-dashboard without ?demo=1: no banner, no panel, empty tally, room not joined", async () => {
      const page = await browser.newPage(null, { initScripts: [initFor("th")], isolated: true });
      try {
        await open(page, `${base}/exam-dashboard.html`);
        await sleep(600);
        const r = await page.evaluate(() => ({
          bar: !!document.querySelector("#lqSampleBar"), panel: !!document.querySelector("[data-lq-demo]"), on: !!(window.LQDemo && window.LQDemo.on),
          board: !!__LQ_EXAM_DB.board, ls: localStorage instanceof Storage, prec: document.querySelector("#precBody").innerText
        }));
        assert(!r.bar && !r.panel && !r.on && !r.board && r.ls, "plain dashboard is untouched " + JSON.stringify(r));
        assert(!/%/.test(r.prec), "tally has no numbers before a room is joined: " + r.prec);
      } finally { await page.close(); }
    });
  } finally { await browser.close(); }
}
