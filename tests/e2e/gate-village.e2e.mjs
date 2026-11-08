// tests/e2e/gate-village.e2e.mjs — LENSIQ Gate · village.html with the synthetic demo plate and the ?fakedet plate seam.
// Checks: resident allow-list by house (max per house, bulk import), resident / look-alike / unknown / deny decisions shown
// to the guard (unknown + deny alerts), the guard's open button -> relay request (Shelly Gen2 GET via a test hook), manual
// open without a plate, auto-open OFF by default and — once the owner enables it — only for an exact resident plate above
// the thresholds (never visitors, look-alikes or typed plates), visitor pass (code + QR + LINE link, check by code, use
// count, expiry), overstay alert, per-house log, relay CSP refusal message, privacy, 中文 / English, phone 320 / 360 / 390.
import { assert, privacyScan } from "./cdp.mjs";
import { coverage, phone } from "./gate.e2e.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hardErrors = (page, base) => page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)) && !/Content Security Policy|connect-src/.test(e.text || ""));
const INIT = "window.confirm=()=>true;window.print=()=>{};window.__plate={text:'1กข 2345',conf:0.97,province:'bangkok'};window.__LQ_FAKE_PLATE=()=>window.__plate;" +
  "window.__relay=[];window.__LQ_RELAY_HOOK=async r=>{window.__relay.push(r);return {ok:true,how:'sent'};};";

async function ack(page) {
  await page.waitFor(`document.querySelector("#gkAck1")`, 8000);
  await page.evaluate(() => { document.querySelector("#gkOp").value = "ยามหนึ่ง"; document.querySelector("#gkGate").value = "ประตูหน้า"; document.querySelector("#gkAck1").click(); document.querySelector("#gkAck2").click(); document.querySelector("#gkAckBtn").click(); });
}
async function read(page, text, province = "bangkok", conf = 0.97) {
  await page.evaluate((t, p, c) => { window.__plate = { text: t, conf: c, province: p }; }, text, province, conf);
  await page.evaluate(() => document.querySelector("#gkReadBtn").click());
  await page.waitFor(`document.querySelector("#gkPlate").value !== "" && window.__LQ_VG.kit.lane.read && !window.__LQ_VG.kit.lane.busy`, 8000);
  await sleep(50);
}
const banner = page => page.evaluate(() => { const b = document.querySelector("#gkExtra .gk-banner"); return b ? { s: b.dataset.s, t: b.innerText } : null; });
const evs = page => page.evaluate(() => window.__LQ_VG.store.list("ev"));

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("village: residents, decisions + alerts, guard open -> relay, manual open, auto-open off by default then exact-only", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/village.html?cpu&fakedet`);
      await ack(page);
      await page.evaluate(() => {
        document.querySelector("#t-res").click();
        document.querySelector("#vgResHouse").value = "12/3"; document.querySelector("#vgResPlate").value = "1กข 2345"; document.querySelector("#vgResProv").value = "bangkok"; document.querySelector("#vgResAdd").click();
        document.querySelector("#vgBulk").value = "7,ขข 55,ชลบุรี\n7,ขข 56,chonburi\n7,ขข 57,\n7,ขข 58,\n7,ขข 59,\nbad line\n9,not a plate,";
        document.querySelector("#vgBulkAdd").click();
        document.querySelector("#t-set").click();
        document.querySelector("#vgRelayKind").value = "shelly-get"; document.querySelector("#vgRelayUrl").value = "http://192.168.1.50"; document.querySelector("#vgSetSave").click();
        document.querySelector("#t-deny").click();
        document.querySelector("#vgDenyPlate").value = "ผผ 666"; document.querySelector("#vgDenyWhy").value = "ทดสอบ"; document.querySelector("#vgDenyAdd").click();
        document.querySelector("#t-gate").click();
      });
      const res = await page.evaluate(() => ({ list: window.__LQ_VG.residents(), msg: document.querySelector("#vgResMsg").textContent }));
      assert(res.list.length === 2 && res.list.find(h => h.house === "7").plates.length === 4, "max 4 per house: 4 of 5 imported to house 7: " + JSON.stringify(res));
      assert(res.list.find(h => h.house === "7").plates[0].province === "chonburi", "Thai province name mapped in bulk import");
      assert(/ข้าม/.test(res.msg), "bulk summary " + res.msg);
      await page.evaluate(() => document.querySelector("#gkDemoBtn").click());
      await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
      // resident: guard decides, nothing opens by itself
      await read(page, "1กข 2345");
      let b = await banner(page);
      assert(b && b.s === "resident" && /12\/3/.test(b.t), "resident banner " + JSON.stringify(b));
      assert((await page.evaluate(() => window.__relay.length)) === 0 && (await evs(page)).length === 0, "auto-open is off by default");
      await page.evaluate(() => document.querySelector('[data-act="open"]').click());
      await sleep(100);
      let e = await evs(page), relay = await page.evaluate(() => window.__relay);
      assert(e.length === 1 && e[0].opened && e[0].how === "guard" && e[0].house === "12/3" && e[0].status === "resident" && e[0].by === "ยามหนึ่ง", "guard open logged " + JSON.stringify(e[0]));
      assert(relay.length === 1 && relay[0].url === "http://192.168.1.50/rpc/Switch.Set?id=0&on=true&toggle_after=1" && relay[0].method === "GET", "Shelly Gen2 request " + JSON.stringify(relay));
      // look-alike ข/ช: still matched to the house, flagged for the guard
      await read(page, "1กช 2345");
      b = await banner(page);
      assert(b.s === "resident" && /ใกล้เคียง/.test(b.t), "look-alike flagged " + JSON.stringify(b));
      // unknown -> alert
      await read(page, "งง 1", "");
      b = await banner(page);
      const alert1 = await page.evaluate(() => document.querySelector("#vgAlerts [data-unk]")?.innerText || "");
      assert(b.s === "unknown" && /ไม่อยู่ในรายชื่อ/.test(alert1), "unknown alert " + JSON.stringify({ b, alert1 }));
      await page.evaluate(() => document.querySelector('[data-act="refuse"]').click());
      // deny list (look-alike ฝ/ผ still denied)
      await read(page, "ฝผ 666", "");
      b = await banner(page);
      assert(b.s === "deny" && /ห้ามเข้า/.test(b.t) && /ทดสอบ/.test(b.t), "deny banner " + JSON.stringify(b));
      assert(await page.evaluate(() => !!document.querySelector("#vgAlerts .gk-alert.deny")), "deny alert");
      await page.evaluate(() => document.querySelector("#gkClear").click());
      // manual open without a plate is always possible and logged
      await page.evaluate(() => document.querySelector("#vgManual").click());
      await sleep(100);
      e = await evs(page);
      assert(e[e.length - 1].how === "manual" && e[e.length - 1].opened && !e[e.length - 1].key, "manual open " + JSON.stringify(e[e.length - 1]));
      // the owner enables auto-open: an exact resident read opens and logs "auto"; look-alike / low-confidence / typed do not
      await page.evaluate(() => { document.querySelector("#t-set").click(); document.querySelector("#vgAutoOn").checked = true; document.querySelector("#vgAutoConf").value = "0.95"; document.querySelector("#vgSetSave").click(); document.querySelector("#t-gate").click(); });
      const n0 = await page.evaluate(() => window.__relay.length);
      await read(page, "1กช 2345");
      await read(page, "1กข 2345", "bangkok", 0.9);
      assert((await page.evaluate(() => window.__relay.length)) === n0, "no auto-open for look-alike or below threshold");
      await page.evaluate(() => { const p = document.querySelector("#gkPlate"); p.value = "1กข 2345"; p.dispatchEvent(new Event("input")); });
      assert((await page.evaluate(() => window.__relay.length)) === n0, "typed / edited plate never auto-opens");
      await page.evaluate(() => document.querySelector("#gkClear").click());
      await page.evaluate(() => { window.__plate = { text: "1กข 2345", conf: 0.98, province: "bangkok" }; document.querySelector("#gkReadBtn").click(); });
      await page.waitFor(`window.__relay.length === ${n0 + 1}`, 6000);
      assert(await page.evaluate(() => document.querySelector("#gkPlate").value === "" && /เปิดอัตโนมัติ/.test(document.querySelector(".gk-toast").textContent)), "auto-open clears the panel and tells the guard");
      e = await evs(page);
      assert(e[e.length - 1].how === "auto" && e[e.length - 1].by === "auto" && e[e.length - 1].house === "12/3", "auto-open logged " + JSON.stringify(e[e.length - 1]));
      assert(await page.evaluate(() => /Switch\.Set/.test(window.__relay[window.__relay.length - 1].url)), "auto-open used the relay");
      // per-house log + CSV columns
      await page.evaluate(() => { document.querySelector("#t-log").click(); const s = document.querySelector("#vgLogHouse"); s.value = "12/3"; s.dispatchEvent(new Event("change")); });
      const rows = await page.evaluate(() => document.querySelectorAll("#vgLogBody tr").length);
      assert(rows === 2, "house 12/3 log rows (guard + auto) " + rows);
      await privacyScan(page);
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!ext.length, "third-party requests " + ext.map(q => q.url));
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("village: visitor pass (code, QR, LINE link), check by code, use count, expiry, overstay alert; relay CSP refusal message", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/village.html?cpu&fakedet`);
      await ack(page);
      await page.evaluate(() => {
        document.querySelector("#t-vis").click();
        document.querySelector("#vgVisHouse").value = "88"; document.querySelector("#vgVisPlate").value = "กท 4567"; document.querySelector("#vgVisName").value = "คุณเอ";
        document.querySelector("#vgVisUses").value = "1"; document.querySelector("#vgVisMake").click();
      });
      const p = await page.evaluate(() => ({ p: window.__LQ_VG.lastPass, code: document.querySelector("#vgVisCode").textContent, line: document.querySelector("#vgVisLine").href, qr: document.querySelector("#vgVisQr").width, rows: document.querySelectorAll("#vgVisBody tr").length }));
      assert(/^V-[2-9A-Z]{6}$/.test(p.code) && p.p.key === "กท4567" && p.qr > 100 && p.rows === 1, "pass issued " + JSON.stringify(p).slice(0, 200));
      assert(p.line.startsWith("https://line.me/R/share?text=") && decodeURIComponent(p.line).includes(p.code) && decodeURIComponent(p.line).includes("#pass=" + p.code), "LINE share link " + p.line);
      // the visitor arrives: plate read -> visitor; guard opens -> use counted
      await page.evaluate(() => { document.querySelector("#t-gate").click(); document.querySelector("#gkDemoBtn").click(); });
      await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
      await read(page, "กท 4567", "nonthaburi");
      const b = await banner(page);
      assert(b.s === "visitor" && /88/.test(b.t) && b.t.includes(p.code), "visitor banner " + JSON.stringify(b));
      await page.evaluate(() => document.querySelector('[data-act="open"]').click());
      await sleep(100);
      const used = await page.evaluate(c => window.__LQ_VG.store.get("pass-" + c).used, p.code);
      assert(used === 1, "use counted " + used);
      await read(page, "กท 4567", "nonthaburi");
      assert((await banner(page)).s === "expired", "single-use pass used up");
      await page.evaluate(() => document.querySelector("#gkClear").click());
      // check by code (also via #pass= link)
      await page.evaluate(c => { document.querySelector("#vgPassCode").value = c.toLowerCase(); document.querySelector("#vgPassCheck").click(); }, p.code);
      assert(await page.evaluate(() => document.querySelector("#vgPassRes").dataset.s === "expired"), "code check: used up");
      await page.evaluate(() => { document.querySelector("#vgPassCode").value = "V-ZZZZZZ"; document.querySelector("#vgPassCheck").click(); });
      assert(await page.evaluate(() => /ไม่พบ/.test(document.querySelector("#vgPassRes").textContent)), "unknown code");
      // overstay: the pass ended 40 min ago and the visitor never left
      await page.evaluate(c => { const s = window.__LQ_VG.store, x = s.get("pass-" + c); x.to = Date.now() - 40 * 60000; s.put(x); document.querySelector("#t-vis").click(); document.querySelector("#t-gate").click(); }, p.code);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("lq-lang", { detail: { lang: "th" } })));
      const over = await page.evaluate(() => [...document.querySelectorAll("#vgAlerts [data-over]")].map(e => e.textContent));
      assert(over.length === 1 && /เกินเวลา/.test(over[0]) && over[0].includes(p.code), "overstay alert " + over);
      // a direct LAN relay without the CSP allowance: the guard is told to open by hand, nothing crashes
      await page.evaluate(() => { window.__LQ_RELAY_HOOK = null; document.querySelector("#t-set").click(); document.querySelector("#vgRelayKind").value = "shelly-get"; document.querySelector("#vgRelayUrl").value = "http://192.168.1.50"; document.querySelector("#vgSetSave").click(); document.querySelector("#vgRelayTest").click(); });
      await page.waitFor(`document.querySelector("#vgRelayMsg").dataset.kind === "err"`, 8000);
      const m = await page.evaluate(() => ({ t: document.querySelector("#vgRelayMsg").textContent, k: document.querySelector("#vgRelayMsg").dataset.kind }));
      assert(m.k === "err" && /ตู้ควบคุม/.test(m.t), "relay refusal explained " + JSON.stringify(m));
      await privacyScan(page);
      await page.close();
    });

    await check("village: 中文 and English — no Thai left outside plate / house data; phone 320 / 360 / 390 on every tab", async () => {
      for (const lang of ["zh", "en"]) {
        const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
        await page.goto(`${base}/village.html?cpu&fakedet&lang=${lang}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await ack(page);
        await page.evaluate(() => { document.querySelector("#t-res").click(); document.querySelector("#vgResHouse").value = "12/3"; document.querySelector("#vgResPlate").value = "1กข 2345"; document.querySelector("#vgResAdd").click();
          document.querySelector("#t-vis").click(); document.querySelector("#vgVisHouse").value = "88"; document.querySelector("#vgVisMake").click(); document.querySelector("#t-gate").click(); document.querySelector("#gkDemoBtn").click(); });
        await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
        await read(page, "1กข 2345");
        let c = await coverage(page);
        assert(c.pct === 0, `${lang} gate: Thai ${c.pct}% ${JSON.stringify(c.top)}`);
        await read(page, "งง 1", "");
        c = await coverage(page);
        assert(c.pct === 0, `${lang} unknown alert: Thai ${c.pct}% ${JSON.stringify(c.top)}`);
        for (const t of ["res", "vis", "deny", "log", "set", "check"]) {
          await page.evaluate(t => document.querySelector("#t-" + t).click(), t);
          await sleep(120);
          c = await coverage(page);
          assert(c.pct === 0, `${lang} tab ${t}: Thai ${c.pct}% ${JSON.stringify(c.top)}`);
        }
        await page.close();
      }
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/village.html?cpu&fakedet`);
      await ack(page);
      for (const t of ["gate", "res", "vis", "deny", "log", "set", "check"]) {
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
