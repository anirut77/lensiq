// tests/e2e/gate-parking.e2e.mjs — LENSIQ Gate · parking.html with Chrome's fake camera / the synthetic demo plate and the
// ?fakedet plate seam (window.__LQ_FAKE_PLATE). Checks: PDPA acknowledgement gates the camera, read -> guard confirm,
// entry / exit pairing, fee rules, shop e-stamp code (single use), PromptPay QR with the exact amount (EMVCo payload +
// CRC verified), receipt, lost ticket, end-of-shift reconciliation, correction audit chain, accuracy check (tick / edit),
// retention purge, privacy (no images in localStorage, no third-party requests), 中文 / English, phone 320 / 360 / 390.
import { assert, privacyScan } from "./cdp.mjs";
import { coverage, phone } from "./gate.e2e.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hardErrors = (page, base) => page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)));
const INIT = "window.confirm=()=>true;window.print=()=>{};window.prompt=()=>'test';window.__plate={text:'1กข 2345',conf:0.95,province:'bangkok'};window.__LQ_FAKE_PLATE=()=>window.__plate;";

async function ack(page) {
  await page.waitFor(`document.querySelector("#gkAck1")`, 8000);
  await page.evaluate(() => { document.querySelector("#gkOp").value = "สมชาย"; document.querySelector("#gkAck1").click(); document.querySelector("#gkAck2").click(); document.querySelector("#gkAckBtn").click(); });
}
async function read(page, text, province = "bangkok", conf = 0.95) {
  await page.evaluate((t, p, c) => { window.__plate = { text: t, conf: c, province: p }; }, text, province, conf);
  await page.evaluate(() => document.querySelector("#gkReadBtn").click());
  await page.waitFor(`document.querySelector("#gkPlate").value !== "" && window.__LQ_PK.kit.lane.read && !window.__LQ_PK.kit.lane.busy`, 8000);
}
const act = (page, id) => page.evaluate(id => document.querySelector(`[data-act="${id}"]`).click(), id);

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("parking: PDPA gate, fake camera, read -> confirm entry, exit fee + e-stamp + PromptPay QR, receipt, lost ticket, shift", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/parking.html?cpu&fakedet`);
      // camera stays off until the operator acknowledges the PDPA notice
      await page.evaluate(() => document.querySelector("#gkDemoBtn").click());
      assert(await page.evaluate(() => /PDPA/.test(document.querySelector("#gkStatus").textContent) && document.querySelector("#gkReadBtn").disabled), "PDPA acknowledgement required first");
      await ack(page);
      assert(await page.evaluate(() => document.querySelector("#pkSetup").hidden), "setup hidden after acknowledgement");
      // real camera path (Chrome fake device)
      await page.evaluate(() => document.querySelector("#gkCamBtn").click());
      await page.waitFor(`document.querySelector("#gkVideo").videoWidth > 0`, 15000);
      // settings: fee rules, PromptPay, a shop
      await page.evaluate(() => {
        document.querySelector("#t-set").click();
        const f = k => document.querySelector(`[data-fee="${k}"]`);
        f("freeMin").value = "15"; f("unitMin").value = "60"; f("rate").value = "20"; f("dailyCap").value = "200"; f("lostFee").value = "200";
        document.querySelector("#pkPpId").value = "081-234-5678"; document.querySelector("#pkSiteName").value = "ลานทดสอบ";
        document.querySelector("#pkSetSave").click();
        document.querySelector("#pkSpId").value = "A1"; document.querySelector("#pkSpName").value = "ร้านกาแฟ"; document.querySelector("#pkSpMin").value = "60";
        document.querySelector("#pkSpAdd").click();
        document.querySelector("[data-codes]").click();
      });
      const codes = await page.evaluate(() => window.__LQ_PK.codes);
      assert(codes && codes.length === 20 && /^A1-/.test(codes[0]), "20 shop codes " + codes);
      await page.evaluate(() => { document.querySelector("#t-shift").click(); document.querySelector("#pkFloat").value = "500"; document.querySelector("#pkShiftOpen").click(); document.querySelector("#t-lane").click(); });

      await read(page, "1กข 2345");
      const r1 = await page.evaluate(() => ({ v: document.querySelector("#gkPlate").value, p: document.querySelector("#gkProv").value, st: document.querySelector("#gkStatus").textContent, sugg: document.querySelector("#gkSugg").innerHTML }));
      assert(r1.v === "1กข 2345" && r1.p === "bangkok" && /มั่นใจ 95%/.test(r1.st) && /lang="th"/.test(r1.sugg), "suggestion shown for the guard " + JSON.stringify(r1));
      await act(page, "in");
      const inside = await page.evaluate(() => window.LQGateRules.occupancy(window.__LQ_PK.store.list("ev")).map(e => e.key));
      assert(inside.join() === "1กข2345", "entry recorded " + inside);
      // the car parked 130 minutes
      await page.evaluate(() => { const s = window.__LQ_PK.store, e = s.list("ev")[0]; e.at = Date.now() - 130 * 60000; s.put(e); });
      await read(page, "1กข 2345");
      await act(page, "out");
      await page.waitFor(`!document.querySelector("#pkPay").hidden`, 4000);
      const f1 = await page.evaluate(() => ({ fee: window.__LQ_PK.pay.result.fee, txt: document.querySelector("#pkFee").textContent }));
      assert(f1.fee === 60 && /60/.test(f1.txt), "130 min -> 3 h x 20 = 60: " + JSON.stringify(f1));
      // a shop stamp: +60 min free -> 70 min -> 2 h = 40; the same code cannot be used twice
      await page.evaluate(c => { document.querySelector("#pkStamp").value = c; document.querySelector("#pkStampBtn").click(); }, codes[0]);
      assert(await page.evaluate(() => window.__LQ_PK.pay.result.fee === 40), "stamp applied");
      await page.evaluate(c => { document.querySelector("#pkStamp").value = c; document.querySelector("#pkStampBtn").click(); }, codes[0]);
      assert(await page.evaluate(() => /ถูกใช้ไปแล้ว/.test(document.querySelector("#pkStampMsg").textContent)), "single use");
      await page.evaluate(() => { document.querySelector("#pkStamp").value = "A1-2222-22"; document.querySelector("#pkStampBtn").click(); });
      assert(await page.evaluate(() => /ไม่ถูกต้อง/.test(document.querySelector("#pkStampMsg").textContent)), "forged code refused");
      // PromptPay QR with the exact amount
      await page.evaluate(() => document.querySelector('[data-pay="promptpay"]').click());
      const qr = await page.evaluate(() => { const p = window.LQPromptPay.parse(window.__LQ_PK.pay.payload), c = document.querySelector("#pkQr"); return { ok: p.ok, crc: p.crcOk, amt: p.amount, target: p.target, vis: !document.querySelector("#pkQrBox").hidden, w: c.width }; });
      assert(qr.ok && qr.crc && qr.amt === 40 && qr.target === "0066812345678" && qr.vis && qr.w > 100, "PromptPay QR " + JSON.stringify(qr));
      await page.evaluate(() => document.querySelector("#pkQrDone").click());
      const rc = await page.evaluate(() => ({ vis: !document.querySelector("#pkReceipt").hidden, txt: document.querySelector("#pkRcBody").innerText, rc: window.__LQ_PK.store.list("rc"), occ: window.LQGateRules.occupancy(window.__LQ_PK.store.list("ev")).length }));
      assert(rc.vis && rc.rc.length === 1 && rc.rc[0].amount === 40 && rc.rc[0].method === "promptpay" && rc.rc[0].stamps.length === 1 && /ลานทดสอบ/.test(rc.txt) && rc.occ === 0, "receipt " + JSON.stringify(rc).slice(0, 300));
      let printed = await page.evaluate(() => { let p = null; window.print = () => { p = [...document.querySelectorAll(".gk-print-on")].map(e => e.id); }; document.querySelector("#pkRcPrint").click(); return p; });
      assert(printed && printed.join() === "pkReceipt", "prints the receipt only " + printed);
      // lost ticket: an exit with no entry
      await read(page, "ขค 789", "chonburi");
      await act(page, "out");
      await page.waitFor(`!document.querySelector("#pkPay").hidden`, 4000);
      const lost = await page.evaluate(() => ({ fee: window.__LQ_PK.pay.result.fee, rule: window.__LQ_PK.pay.result.rule, pick: !document.querySelector("#pkPickEntry").hidden }));
      assert(lost.fee === 200 && lost.rule === "lost" && lost.pick, "lost ticket " + JSON.stringify(lost));
      await page.evaluate(() => document.querySelector('[data-pay="cash"]').click());
      // close the shift: float 500 + cash 200 = 700 expected; counted 690 -> -10
      await page.evaluate(() => { document.querySelector("#t-shift").click(); const c = document.querySelector("#pkCounted"); c.value = "690"; c.dispatchEvent(new Event("input")); });
      const rec = await page.evaluate(() => document.querySelector("#pkRecon").innerText);
      assert(/฿700/.test(rec) && /฿40/.test(rec) && /-฿10/.test(rec), "reconciliation " + rec);
      await page.evaluate(() => document.querySelector("#pkShiftClose").click());
      const sh = await page.evaluate(() => window.__LQ_PK.store.list("shift").map(s => s.rep));
      assert(sh.length === 1 && sh[0].cash === 200 && sh[0].promptpay === 40 && sh[0].diff === -10 && sh[0].stamps === 1 && sh[0].lost === 1, "shift saved " + JSON.stringify(sh));
      // correction from the log: append-only audit with a verified chain
      await page.evaluate(() => { document.querySelector("#t-log").click(); document.querySelector("[data-edit]").click(); document.querySelector("#pkEditPlate").value = "ขค 788"; document.querySelector("#pkEditWhy").value = "ป้ายสกปรก"; document.querySelector("#pkEditSave").click(); });
      const au = await page.evaluate(() => ({ n: window.__LQ_PK.kit.audit().length, ok: window.LQPlate.auditVerify(window.__LQ_PK.kit.audit()).ok, txt: document.querySelector("#pkAudit").innerText }));
      assert(au.n >= 1 && au.ok && /ไม่มีการแก้ย้อนหลัง/.test(au.txt), "audit " + JSON.stringify(au));
      // CSV export contains the corrected plate and no formula cells
      const csv = await page.evaluate(() => window.LQPlate.toCSV(window.__LQ_PK.store.list("ev"), [{ k: "key" }, { k: "by" }]));
      assert(/ขค788/.test(csv) && /สมชาย/.test(csv), "csv");
      await privacyScan(page);
      const ls = await page.evaluate(() => Object.keys(localStorage));
      assert(ls.every(k => /^lq-/.test(k)), "storage keys " + ls);
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!ext.length, "third-party requests " + ext.map(q => q.url));
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("parking: auto-read with debounce, accuracy check (✓ / edited = ✗) and retention purge", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/parking.html?cpu&fakedet`);
      await ack(page);
      await page.evaluate(() => { document.querySelector("#gkDemoBtn").click(); });
      await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
      await page.evaluate(() => { document.querySelector("#t-check").click(); document.querySelector("#gkChkStart").click(); document.querySelector("#t-lane").click(); });
      // auto-read: a plate seen on two ticks is read and offered once
      await page.evaluate(() => { window.__plate = { text: "กข 1234", conf: 0.9, province: "" }; const a = document.querySelector("#gkAuto"); a.checked = true; a.dispatchEvent(new Event("change")); });
      await page.waitFor(`document.querySelector("#gkPlate").value === "กข 1234"`, 8000);
      assert(await page.evaluate(() => !document.querySelector("#gkTick").hidden), "tick buttons shown during the check");
      // the guard corrects it (counts as ✗) and confirms the entry
      await page.evaluate(() => { const p = document.querySelector("#gkPlate"); p.value = "กข 1284"; p.dispatchEvent(new Event("input")); document.querySelector('[data-act="in"]').click(); });
      // same plate again within the debounce window is skipped
      await sleep(2200);
      const st = await page.evaluate(() => ({ v: document.querySelector("#gkPlate").value, s: document.querySelector("#gkStatus").textContent }));
      assert(st.v === "" && /ป้ายเดิม/.test(st.s), "debounced " + JSON.stringify(st));
      await page.evaluate(() => { window.__plate = { text: "ขข 55", conf: 0.92, province: "bangkok" }; });
      await page.waitFor(`document.querySelector("#gkPlate").value === "ขข 55"`, 8000);
      await page.evaluate(() => { document.querySelector('[data-tick="1"]').click(); document.querySelector('[data-act="in"]').click(); const a = document.querySelector("#gkAuto"); a.checked = false; a.dispatchEvent(new Event("change")); });
      await page.evaluate(() => { document.querySelector("#t-check").click(); document.querySelector("#gkChkStop").click(); });
      const rep = await page.evaluate(() => ({ r: window.__LQ_PK.kit.lastCheck, html: document.querySelector("#gkChkRep").innerText, hist: JSON.parse(localStorage.getItem("lq-gate-parking-sitecheck") || "[]") }));
      assert(rep.r.n === 2 && rep.r.plate.x === 1 && rep.r.plate.n === 2 && ["more", "ontrack", "fail"].includes(rep.r.verdict), "check report " + JSON.stringify(rep.r && { n: rep.r.n, p: rep.r.plate, v: rep.r.verdict }));
      assert(/ป้ายถูกทั้งป้าย/.test(rep.html) && /50\.0%/.test(rep.html) && rep.hist.length === 1, "report rendered + history " + rep.html.slice(0, 200));
      const audit = await page.evaluate(() => window.__LQ_PK.kit.audit().map(e => [e.from, e.to]));
      assert(audit.some(([f, t]) => /กข1234/.test(f) && /กข1284/.test(t)), "system read vs guard correction kept " + JSON.stringify(audit));
      // retention: an 8-day-old crop and a 100-day-old event are deleted, receipts kept
      const purged = await page.evaluate(() => { const s = window.__LQ_PK.store, d = 86400000; s.put({ id: "img-old", kind: "img", at: Date.now() - 8 * d }); s.put({ id: "ev-old", kind: "ev", dir: "in", key: "กก1", at: Date.now() - 100 * d }); s.put({ id: "rc-old", kind: "rc", at: Date.now() - 100 * d }); const n = window.__LQ_PK.kit.purge(); return { n, img: !!s.get("img-old"), ev: !!s.get("ev-old"), rc: !!s.get("rc-old") }; });
      assert(purged.n === 2 && !purged.img && !purged.ev && purged.rc, "purge " + JSON.stringify(purged));
      await privacyScan(page);
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("parking: accuracy check tallies 'taps needed' (guard drew the plate box vs the finder found it), day / night", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/parking.html?cpu&fakedet`);
      await ack(page);
      await page.evaluate(() => { document.querySelector("#gkDemoBtn").click(); });
      await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
      await page.evaluate(() => { document.querySelector("#t-check").click(); document.querySelector("#gkChkStart").click(); document.querySelector("#t-lane").click(); });
      // 1: the guard taps / draws the plate box
      await page.evaluate(() => { window.__plate = { text: "กข 1234", conf: 0.95, province: "bangkok" }; window.__LQ_PK.kit.readNow({ x: 0.3, y: 0.48, w: 0.4, h: 0.32 }); });
      await page.waitFor(`document.querySelector("#gkPlate").value === "กข 1234" && !window.__LQ_PK.kit.lane.busy`, 8000);
      assert(await page.evaluate(() => window.__LQ_PK.kit.lane.read.tapped === true), "tapped read flagged");
      await page.evaluate(() => { document.querySelector('[data-tick="1"]').click(); document.querySelector('[data-act="in"]').click(); });
      // 2: the finder found the plate (read button, no box)
      await read(page, "ขข 55");
      assert(await page.evaluate(() => window.__LQ_PK.kit.lane.read.tapped === false), "auto read not flagged");
      await page.evaluate(() => { document.querySelector('[data-tick="1"]').click(); document.querySelector('[data-act="in"]').click(); });
      // 3: the finder missed and the guard typed the plate (no system read): counted as a tap, not as an accuracy row
      await page.waitFor(`!window.__LQ_PK.kit.lane.read`, 8000);
      await page.evaluate(() => { const i = document.querySelector("#gkPlate"); i.value = "คค 77"; i.dispatchEvent(new Event("input", { bubbles: true })); });
      await page.waitFor(`!document.querySelector('#gkActions [data-act="in"]').disabled`, 8000);
      await page.evaluate(() => document.querySelector('[data-act="in"]').click());
      await page.evaluate(() => document.querySelector("#t-check").click());
      await page.waitFor(`/แตะกรอบป้าย 2 คัน/.test(document.querySelector("#gkChkLive").textContent)`, 5000).catch(() => {});
      const live = await page.evaluate(() => document.querySelector("#gkChkLive").textContent);
      assert(/แตะกรอบป้าย 2 คัน/.test(live) && /อ่านแล้ว 2 คัน/.test(live), "live tally shows taps incl. the typed plate " + live);
      await page.evaluate(() => document.querySelector("#gkChkStop").click());
      const rep = await page.evaluate(() => ({ r: window.__LQ_PK.kit.lastCheck, html: document.querySelector("#gkChkRep").innerText }));
      const t = rep.r.taps, tn = rep.r.tapsNight;
      assert(t.n + tn.n === 3 && t.x + tn.x === 2 && rep.r.n === 2 && rep.r.manual === 1, "taps over both reads + the typed plate " + JSON.stringify({ t, tn, n: rep.r.n, manual: rep.r.manual }));
      assert(/ต้องแตะกรอบป้ายเอง/.test(rep.html) && /≤ 10%/.test(rep.html), "taps row with the proposal target " + rep.html.slice(0, 400));
      await page.close();
    });

    await check("parking: 中文 and English — no Thai left outside plate data (lane, payment, every tab)", async () => {
      for (const lang of ["zh", "en"]) {
        const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
        await page.goto(`${base}/parking.html?cpu&fakedet&lang=${lang}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        let c = await coverage(page);
        assert(c.pct === 0, `${lang} setup: Thai ${c.pct}% ${JSON.stringify(c.top)}`);
        await ack(page);
        await page.evaluate(() => document.querySelector("#gkDemoBtn").click());
        await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
        await read(page, "1กข 2345");
        await act(page, "in");
        await page.evaluate(() => { const s = window.__LQ_PK.store, e = s.list("ev")[0]; e.at = Date.now() - 90 * 60000; s.put(e); });
        await read(page, "1กข 2345");
        await act(page, "out");
        await page.waitFor(`!document.querySelector("#pkPay").hidden`, 4000);
        await page.evaluate(() => document.querySelector('[data-pay="cash"]').click());
        await sleep(300);
        c = await coverage(page);
        assert(c.pct === 0, `${lang} lane + receipt: Thai ${c.pct}% ${JSON.stringify(c.top)}`);
        for (const t of ["lot", "log", "shift", "set", "check"]) {
          await page.evaluate(t => document.querySelector("#t-" + t).click(), t);
          await sleep(150);
          c = await coverage(page);
          assert(c.pct === 0, `${lang} tab ${t}: Thai ${c.pct}% ${JSON.stringify(c.top)}`);
        }
        const errs = hardErrors(page, base); assert(!errs.length, lang + " console errors " + JSON.stringify(errs.slice(0, 3)));
        await page.close();
      }
    });

    await check("parking: phone 320 / 360 / 390 px — no overflow, 44 px targets, text >= 12 px on every tab", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/parking.html?cpu&fakedet`);
      for (const r of await phone(page, null)) {
        assert(r.sw <= r.cw, `setup @${r.w} overflow ${r.sw}>${r.cw}`);
        assert(!r.bad.length, `setup @${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
        assert(!r.tiny.length, `setup @${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
      }
      await ack(page);
      for (const t of ["lane", "lot", "log", "shift", "set", "check"]) {
        await page.evaluate(t => document.querySelector("#t-" + t).click(), t);
        for (const r of await phone(page, null)) {
          assert(r.sw <= r.cw, `${t} @${r.w} overflow ${r.sw}>${r.cw}`);
          assert(!r.bad.length, `${t} @${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
          assert(!r.tiny.length, `${t} @${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
        }
      }
      await page.close();
    });
  } finally { await browser.close(); }
}
