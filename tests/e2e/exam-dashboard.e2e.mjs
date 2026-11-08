// tests/e2e/exam-dashboard.e2e.mjs — exam-dashboard.html in demo mode (no camera): triage queue, actions need the
// invigilator's name (and a note for Note / Escalate), on-site tally -> precision table, accommodation profile on the seat
// map, room mute, CSV in time order, printable committee report, file import, state survives a reload, clear;
// 0% Thai in 中文/English with a populated board, phone layout at 320 / 360 / 390 px.
import { assert, privacyScan } from "./cdp.mjs";
import { exceptions, noThai, phoneAudit, sleep } from "./exam-kit.mjs";

const card = (re, sel) => `(() => { const c = [...document.querySelectorAll("#queue .alert")].find(x => ${re}.test(x.querySelector(".why").textContent)); c.querySelector("${sel}").click(); return true; })()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("exam-dashboard: demo events, actions, tally, accommodation, mute, CSV, report, import, reload, clear", async () => {
      const page = await browser.newPage(null, { initScripts: ["try { localStorage.setItem('lq-lang', 'th'); } catch (e) {}"] });
      await page.goto(`${base}/exam-dashboard.html`);
      await page.waitFor("window.__LQ_EXAM_DB && window.LQI18N", 8000);
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith("lq-exam")) localStorage.removeItem(k); });
      await page.reload();
      await page.waitFor("window.__LQ_EXAM_DB", 8000);
      await noThai(page, "dashboard empty");
      await phoneAudit(page, "dashboard empty");

      await page.evaluate(() => document.querySelector("#demoBtn").click());
      await page.waitFor("__LQ_EXAM_DB.room === 'DEMO' && document.querySelectorAll('#queue .alert').length === 5", 4000);
      const order = await page.evaluate(() => [...document.querySelectorAll("#queue .alert")].map(c => c.className));
      assert(/lvl-check/.test(order[0]) && order.slice(1).every(c => /lvl-watch/.test(c)), "Check first: " + order);
      assert(await page.evaluate(() => document.querySelectorAll("#queue .spark").length >= 4), "sparklines");

      // no name -> refused
      await page.evaluate(card("/โทรศัพท์/", "[data-act=going]"));
      assert(await page.evaluate(() => __LQ_EXAM_DB.board.alerts.every(a => !a.acts.length) && document.querySelector("#engine").classList.contains("warn")), "action without a name refused");
      await page.evaluate(() => { document.querySelector("#who").value = "อ.สมศรี"; });
      await page.evaluate(card("/โทรศัพท์/", "[data-act=going]"));
      await page.evaluate(card("/เอนตัว/", "[data-act=noissue]"));
      await page.evaluate(card("/ทางเดิน/", "[data-act=escalate]"));
      assert(await page.evaluate(() => !__LQ_EXAM_DB.board.alerts.some(a => a.status === "escalated")), "escalate needs a note");
      await page.evaluate(() => { const c = [...document.querySelectorAll("#queue .alert")].find(x => /ทางเดิน/.test(x.textContent)); c.querySelector(".note-in").value = "ผู้คุมสอบอีกท่าน"; c.querySelector("[data-act=escalate]").click(); });
      const st = await page.evaluate(() => Object.fromEntries(__LQ_EXAM_DB.board.alerts.map(a => [a.sig, a.status])));
      assert(st.phone === "going" && st.lean === "closed" && st.aisle === "escalated", "statuses " + JSON.stringify(st));
      assert(await page.evaluate(() => document.querySelectorAll("#queue .alert").length === 3), "closed + escalated leave the queue");

      // tally: right on the phone (queue), wrong on the lean (log table)
      await page.evaluate(card("/โทรศัพท์/", "[data-v='1']"));
      await page.evaluate(() => { const id = __LQ_EXAM_DB.board.alerts.find(a => a.sig === "lean").id; document.querySelector(`#logBody [data-lid='${id}'][data-v='0']`).click(); });
      const prec = await page.evaluate(() => document.querySelector("#precBody").innerText);
      assert(/100%/.test(prec) && /0%/.test(prec) && /50%/.test(prec), "precision table: " + prec);

      // accommodation + mute
      await page.evaluate(() => { document.querySelector("#accSeat").value = "5"; document.querySelector("#accBreaks").checked = true; document.querySelector("#accForm").requestSubmit(); });
      assert(await page.evaluate(() => /พักได้บ่อยขึ้น/.test(document.querySelector("#accList").textContent) && !!document.querySelector("#seatMap .seat.acc")), "accommodation listed and outlined");
      await page.evaluate(() => document.querySelector("#muteBtn").click());
      assert(await page.evaluate(() => document.querySelector("#muteState").textContent.length > 3), "mute state shown");

      // CSV (captured) in time order, then the printable report
      await page.evaluate(() => { window.__dl = []; HTMLAnchorElement.prototype.click = function () { window.__dl.push({ name: this.download, href: this.href }); }; window.print = () => { window.__printed = true; }; });
      await page.evaluate(() => document.querySelector("#csvBtn").click());
      const csv = await page.evaluate(async () => (await fetch(window.__dl[0].href)).text());
      const lines = csv.replace(/^﻿/, "").split("\r\n");
      assert(/^เวลา,ห้อง,ที่นั่ง,เหตุผล/.test(lines[0]) && lines.length >= 9, "CSV header + rows: " + lines.slice(0, 2).join(" / "));
      assert(lines.some(l => /อ\.สมศรี/.test(l) && /ส่งต่อคณะกรรมการ/.test(l)), "CSV has who checked + outcome");
      const times = await page.evaluate(() => __LQ_EXAM_DB.board.rows().map(r => r.t));
      assert(times.every((t, i) => !i || t >= times[i - 1]), "rows in time order");
      await page.evaluate(() => document.querySelector("#printBtn").click());
      const rep = await page.evaluate(() => ({ printed: window.__printed, rows: document.querySelectorAll("#report tbody tr").length, text: document.querySelector("#report").innerText }));
      assert(rep.printed && rep.rows >= 8 && /คณะกรรมการ/.test(rep.text) && /ไม่ใช่หลักฐานการทุจริต/.test(rep.text), "report " + JSON.stringify({ ...rep, text: rep.text.slice(0, 80) }));

      // import a node's event file (no network)
      await page.evaluate(() => {
        const msgs = [{ v: 1, type: "ev", room: "DEMO", node: "filenode01", src: "lab", seat: "11", sig: "screens", lvl: "watch", t: Date.now() - 1000 },
          { v: 1, type: "ev", room: "DEMO", node: "filenode01", src: "lab", seat: "11", sig: "screens", lvl: "watch", t: Date.now(), frame: "data:image/png;base64,AA" }];
        const dt = new DataTransfer(); dt.items.add(new File([JSON.stringify({ format: "lensiq-exam", v: 1, msgs })], "ev.json", { type: "application/json" }));
        const inp = document.querySelector("#importFile"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
      });
      // the room is still muted: the imported Watch goes to the log as "muted", not to the queue; the image-carrying message is rejected
      await page.waitFor("/1/.test(document.querySelector('#importMsg').textContent) && __LQ_EXAM_DB.board.log.some(e => e.seat === '11' && e.kind === 'muted')", 3000);
      assert(await page.evaluate(() => __LQ_EXAM_DB.board.log.filter(e => e.seat === "11").length === 1), "one of two imported messages accepted");

      await noThai(page, "dashboard populated");
      await phoneAudit(page, "dashboard populated");
      // reload keeps the board (localStorage, no images)
      const n = await page.evaluate(() => __LQ_EXAM_DB.board.alerts.length);
      await page.reload();
      await page.waitFor("window.__LQ_EXAM_DB && __LQ_EXAM_DB.board", 8000);
      assert(await page.evaluate(k => __LQ_EXAM_DB.board.alerts.length === k && __LQ_EXAM_DB.board.alerts.some(a => a.status === "escalated"), n), "state survives a reload");
      await privacyScan(page);
      await page.evaluate(() => { window.confirm = () => true; document.querySelector("#clearBtn").click(); });
      assert(await page.evaluate(() => __LQ_EXAM_DB.board.alerts.length === 0), "cleared");
      await sleep(100);
      assert(!exceptions(page).length, "exceptions: " + JSON.stringify(exceptions(page).slice(0, 2)));
      await page.close();
    });
  } finally { await browser.close(); }
}
