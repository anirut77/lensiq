// tests/e2e/medicine.e2e.mjs — medicine.html (medicine checker): offline by default (no third-party request until the
// opt-in), Thai registration / food number / emergency card, opt-in lookups through the ?fakenet seam (Thai FDA via the
// Worker route, RxNav + openFDA label sections verbatim, text-only GET requests), loose-pill candidates from the slim
// Pillbox data (>= 3 or none + NLM warning), opt-in history + CSV + delete, OCR / barcode seams, the REAL PP-OCRv5 Thai
// model reading a rendered registration number, 中文 / English with no Thai left, phone 320 / 360 / 390.
import { assert, privacyScan } from "./cdp.mjs";
import { coverage, phone } from "./gate.e2e.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hardErrors = (page, base) => page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)));
const INIT = "window.confirm=()=>true;window.print=()=>{};";
const THFDA = { source: "Thai FDA", fetched: "2026-11-08T02:00:00Z", q: "1A 15/50", total: 1, rows: [{ lcnno: "1A15/50", name_th: "พาราเซตามอล 500", name_en: "PARACETAMOL 500 MG TABLETS",
  licensee: "บริษัท ตัวอย่าง จำกัด", status_text: "คงอยู่", status: "active", type: "ยาสำเร็จรูป", use: "ยาใช้ภายใน", kind: "ยาสามัญประจำบ้าน", newcode: "U1DR1A1022500001511C",
  url: "https://pertento.fda.moph.go.th/FDA_INFORMATION_DRUG/Home/Phar_Product_Inform_Page?Newcode=U1DR1A1022500001511C" }] };
const LABEL = { meta: { disclaimer: "Do not rely on openFDA to make decisions regarding medical care. (mock)" }, results: [{
  set_id: "471fa2f1-73a0-49be-89f3-d3e2cfdaeca0", effective_time: "20240131", indications_and_usage: ["Uses temporarily relieves minor aches and pains"],
  dosage_and_administration: ["Directions adults: take 1 tablet every 4 to 6 hours"], warnings: ["Liver warning: This product contains ibuprofen."],
  openfda: { generic_name: ["IBUPROFEN"], brand_name: ["Example IB"], product_type: ["HUMAN OTC DRUG"], manufacturer_name: ["Example Labs"] } }] };
const NET = `window.LENSIQ_API_BASE="https://api.example.test";window.__medCalls=[];window.__LQ_MED_FETCH=async(u,init)=>{window.__medCalls.push({u:String(u),m:(init&&init.method)||"GET",b:init&&init.body});
  const j=/\\/api\\/med\\/thfda/.test(u)?${JSON.stringify(THFDA)}:/\\/api\\/med\\/rxnav/.test(u)?{approximateGroup:{candidate:[{rxcui:"5640",score:"10",name:"ibuprofen"}]}}:/\\/api\\/med\\/openfda/.test(u)?${JSON.stringify(LABEL)}:null;
  return new Response(JSON.stringify(j||{error:"x"}),{status:j?200:404,headers:{"Content-Type":"application/json"}});};`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("medicine: offline by default — registration no., food no., emergency card; no third-party request, no storage", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      const r = await page.evaluate(() => {
        const q = document.querySelector("#mdQ"), go = document.querySelector("#mdCheck");
        const online = document.querySelector("#mdOnline").checked, hist = document.querySelector("#mdHist").checked;
        q.value = "เลขทะเบียน 1A 15/50"; go.click();
        const reg = document.querySelector("#mdOut").innerText;
        q.value = "อย. 10-1-12345-1-0001"; go.click();
        const food = document.querySelector("#mdOut").innerText;
        const emBefore = document.querySelector("#mdEmerg").hidden;
        q.value = "ลูกกินยาไปทั้งแผง"; go.click();
        return { online, hist, reg, food, emBefore, em: !document.querySelector("#mdEmerg").hidden, self: !document.querySelector("#mdEmSelf").hidden, server: document.querySelector("#mdServer").textContent };
      });
      assert(!r.online && !r.hist, "online lookups and history are OFF by default");
      assert(/1A 15\/50/.test(r.reg) && /2550/.test(r.reg) && /การค้นออนไลน์ปิดอยู่/.test(r.reg), "registration parsed, lookup gated " + r.reg.slice(0, 200));
      assert(/ไม่ใช่เลขทะเบียนยา/.test(r.food) && /10-1-12345-1-0001/.test(r.food), "food number flagged as not a drug");
      assert(r.emBefore && r.em && !r.self, "emergency card on poisoning wording");
      assert(/ไม่มีข้อมูลออกจากเครื่อง/.test(r.server), "offline status " + r.server);
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !q.url.startsWith("data:") && !q.url.startsWith("blob:"));
      assert(!ext.length, "no third-party requests: " + ext.map(x => x.url).join(", "));
      await privacyScan(page);
      const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => !/^lq-(lang|i18n-debug)$/.test(k)));
      assert(!keys.length, "nothing stored without opt-in: " + keys);
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("medicine: opt-in lookups (fakenet) — Thai FDA via Worker, RxNav + openFDA verbatim label; text-only GETs", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT + NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakenet`);
      await page.evaluate(() => { const o = document.querySelector("#mdOnline"); o.click(); });
      await page.evaluate(() => { document.querySelector("#mdQ").value = "1A 15/50"; document.querySelector("#mdCheck").click(); });
      await page.waitFor(`/ทะเบียนยังคงอยู่/.test(document.querySelector("#mdOut").innerText)`, 8000);
      const th = await page.evaluate(() => document.querySelector("#mdOut").innerText);
      assert(/ยาสามัญประจำบ้าน/.test(th) && /PARACETAMOL 500 MG/.test(th) && /หน้าข้อมูลผลิตภัณฑ์ที่ อย\./.test(th), "Thai FDA row rendered");
      await page.evaluate(() => { document.querySelector("#mdQ").value = "ibuprofen"; document.querySelector("#mdCheck").click(); });
      await page.waitFor(`document.querySelector("[data-act=label-name][data-q=ibuprofen]")`, 8000);
      await page.evaluate(() => document.querySelector("[data-act=label-name][data-q=ibuprofen]").click());
      await page.waitFor(`/Uses temporarily relieves/.test(document.querySelector("#mdOut").innerText)`, 8000);
      const lab = await page.evaluate(() => ({ t: document.querySelector("#mdOut").innerText, en: [...document.querySelectorAll(".md-text")].every(e => e.lang === "en" && e.getAttribute("translate") === "no") }));
      assert(/Directions adults: take 1 tablet every 4 to 6 hours/.test(lab.t) && /วิธีใช้ตามฉลาก/.test(lab.t), "dosing shown verbatim under 'as on the label'");
      assert(/ฉลากของสหรัฐฯ อาจต่างจากฉลากยาที่ขายในไทย/.test(lab.t) && /\(mock\)/.test(lab.t) && /DailyMed/.test(lab.t) && /2024-01-31/.test(lab.t), "US-label note, openFDA disclaimer, source + date");
      assert(lab.en, "label text marked lang=en translate=no (never machine-translated)");
      const calls = await page.evaluate(() => window.__medCalls);
      assert(calls.length >= 3 && calls.every(c => c.m === "GET" && !c.b), "GET only, no body " + JSON.stringify(calls));
      assert(calls.every(c => /^https:\/\/api\.example\.test\/api\/med\/(thfda|rxnav|openfda)\?/.test(c.u) && !/data%3Aimage|data:image|base64/i.test(c.u)), "text only, via the Worker (page CSP has no third-party origin) " + calls.map(c => c.u).join(" "));
      // the mock API base is not in the page CSP, so the shared site scripts' own /v1/config call is (correctly) blocked
      const errs = hardErrors(page, base).filter(e => !/api\.example\.test\/v1\//.test(e.text || "")); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("medicine: no server configured -> 'needs server' + Thai FDA site link (nothing sent)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      const t = await page.evaluate(() => { document.querySelector("#mdOnline").click(); document.querySelector("#mdQ").value = "1A 15/50"; document.querySelector("#mdCheck").click(); return document.querySelector("#mdOut").innerText + " | " + document.querySelector("#mdServer").textContent; });
      assert(/ต้องมีเซิร์ฟเวอร์/.test(t) && /ค้นที่เว็บไซต์ อย\./.test(t), "needs-server message " + t.slice(0, 200));
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !q.url.startsWith("data:"));
      assert(!ext.length, "nothing sent: " + ext.map(x => x.url).join(", "));
      await page.close();
    });

    await check("medicine: loose pill — >= 3 candidates or none, NLM warning, lazy-loaded data, label link via opt-in", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      const before = page.requests.some(r => /pillbox-2020-v1\.json/.test(r.url));
      await page.evaluate(() => {
        document.querySelector("#t-pill").click();
        document.querySelector("#mdImp").value = "5892;V";
        document.querySelector("#mdColor").value = "PINK"; document.querySelector("#mdShape").value = "CAPSULE";
        document.querySelector("#mdPillBtn").click();
      });
      await page.waitFor(`document.querySelectorAll("#mdPillOut .md-cand").length >= 3`, 20000);
      const r = await page.evaluate(() => ({ n: document.querySelectorAll("#mdPillOut .md-cand").length, t: document.querySelector("#mdPillOut").innerText, page: document.querySelector("#tab-pill").innerText,
        loose: document.querySelectorAll("#mdPillOut .md-cand[data-loose=true]").length, strict: document.querySelectorAll("#mdPillOut .md-cand[data-loose=false]").length }));
      assert(r.strict === 0 || r.strict >= 3, "never 1 or 2 rows flagged as matching: " + r.strict);
      assert(!before && page.requests.some(x => /vendor\/pillbox\/pillbox-2020-v1\.json/.test(x.url)), "data lazy-loaded on first search");
      assert(r.n >= 3 && /Temazepam/.test(r.t) && /ไม่ใช่คำตอบว่าเม็ดยาของคุณคือยาตัวไหน/.test(r.t) && r.loose >= 1, "candidates " + r.n);
      assert(r.page.includes("These files will not be updated and should not be used for pill identification."), "NLM warning verbatim");
      await page.evaluate(() => { document.querySelector("#mdImp").value = "QQQQQQQQQX"; document.querySelector("#mdPillBtn").click(); });
      await page.waitFor(`/ไม่พบรายการที่ตรงกัน/.test(document.querySelector("#mdPillOut").innerText)`, 8000);
      await page.evaluate(() => { document.querySelector("#mdImp").value = "5892;V"; document.querySelector("#mdPillBtn").click(); });
      await page.waitFor(`document.querySelector("#mdPillOut [data-act=pill-label]")`, 8000);
      await page.evaluate(() => document.querySelector("#mdPillOut [data-act=pill-label]").click());
      const lab = await page.evaluate(() => ({ tab: document.querySelector("#t-pack").getAttribute("aria-selected"), t: document.querySelector("#mdOut").innerText }));
      assert(lab.tab === "true" && /การค้นออนไลน์ปิดอยู่/.test(lab.t), "label lookup gated on the opt-in");
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("medicine: history is opt-in, text only, CSV export, delete; pharmacist mode is denser", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      const r = await page.evaluate(() => {
        const ls = () => localStorage.getItem("lq-med-history");
        document.querySelector("#mdQ").value = "1A 15/50"; document.querySelector("#mdCheck").click();
        const off = ls();
        document.querySelector("#mdHist").click(); document.querySelector("#mdPharm").click();
        document.querySelector("#mdQ").value = "2A 3/60"; document.querySelector("#mdCheck").click();
        const on = JSON.parse(ls() || "[]");
        document.querySelector("#t-hist").click();
        const list = document.querySelector("#mdHistList").innerText;
        let csv = null; const orig = URL.createObjectURL; URL.createObjectURL = b => { csv = b; return orig.call(URL, b); };
        document.querySelector("#mdHistCsv").click();
        const dense = document.querySelector("#main").classList.contains("md-dense");
        document.querySelector("#mdHistClear").click();
        return { off, on, list, csv: !!csv, dense, after: ls() };
      });
      assert(r.off === null, "no history before opt-in");
      assert(r.on.length === 1 && r.on[0].q === "2A 3/60" && !/data:image/.test(JSON.stringify(r.on)), "history entry, text only");
      assert(/2A 3\/60/.test(r.list) && r.csv && r.dense, "listed, CSV exported, dense view");
      assert(r.after === null, "deleted");
      await page.close();
    });

    await check("medicine: OCR + barcode seams (fakeocr) fill the box for the user to confirm", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT + "window.__LQ_FAKE_OCR=()=>'Reg. No. 1A I5/5O';window.__LQ_FAKE_BARCODE=()=>'8850999320014';"], isolated: true });
      await page.goto(`${base}/medicine.html?fakeocr`);
      await page.evaluate(() => document.querySelector("#mdOcrBtn").click());
      await page.waitFor(`document.querySelector("#mdQ").value === "1A 15/50"`, 5000);
      assert(await page.evaluate(() => document.querySelector("#mdOut").innerText === ""), "OCR does not auto-run the lookup (user confirms)");
      await page.evaluate(() => document.querySelector("#mdScanBtn").click());
      await page.waitFor(`/GS1/.test(document.querySelector("#mdOut").innerText)`, 5000);
      await page.close();
    });

    await check("medicine: REAL PP-OCRv5 Thai model reads a rendered registration number on this device", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      const out = await page.evaluate(async () => {
        const c = document.createElement("canvas"); c.width = 360; c.height = 64;
        const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
        x.fillStyle = "#111"; x.font = "bold 40px Arial, Helvetica, sans-serif"; x.textBaseline = "middle"; x.fillText("1A 15/50", 24, 34);
        try { return { text: await window.__LQ_MED.ocr(c) }; } catch (e) { return { err: String(e) }; }
      });
      assert(!out.err, "OCR ran: " + out.err);
      const reg = await page.evaluate(t => window.LQMed.findThaiReg(t).map(r => r.norm), out.text);
      assert(reg.includes("1A 15/50"), "read " + JSON.stringify(out.text) + " -> " + JSON.stringify(reg));
      await page.close();
    });

    await check("medicine: 中文 and English leave no Thai outside lang=th content; Thai restored", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      for (const lang of ["zh", "en"]) {
        await page.goto(`${base}/medicine.html?lang=${lang}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await page.evaluate(() => { document.querySelector("#mdQ").value = "1A 15/50"; document.querySelector("#mdCheck").click(); document.querySelector("#t-pill").click(); });
        await sleep(400);
        const c = await coverage(page);
        assert(c.pct === 0, `${lang}: Thai left ${c.pct}% ${JSON.stringify(c.top)}`);
      }
      await page.goto(`${base}/medicine.html?lang=th`);
      await page.waitFor(`window.LQI18N && LQI18N.lang === "th"`, 8000);
      assert(await page.evaluate(() => /[ก-๙]/.test(document.querySelector("h1").textContent)), "Thai restored");
      await page.close();
    });

    await check("medicine: phone 320 / 360 / 390 px — no overflow, 44 px targets, text >= 12 px (with results open)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT + NET], isolated: true });
      for (const r of await phone(page, `${base}/medicine.html`)) {
        assert(r.sw <= r.cw, `@${r.w} overflow ${r.sw}>${r.cw}`);
        assert(!r.bad.length, `@${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
        assert(!r.tiny.length, `@${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
      }
      await page.goto(`${base}/medicine.html?fakenet`);
      await page.evaluate(() => { document.querySelector("#mdOnline").click(); document.querySelector("#mdQ").value = "1A 15/50"; document.querySelector("#mdCheck").click(); });
      await page.waitFor(`/PARACETAMOL/.test(document.querySelector("#mdOut").innerText)`, 8000);
      for (const r of await phone(page, null)) {
        assert(r.sw <= r.cw, `results @${r.w} overflow ${r.sw}>${r.cw}`);
        assert(!r.bad.length, `results @${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
      }
      await page.evaluate(() => { document.querySelector("#mdQ").value = "ibuprofen"; document.querySelector("#mdCheck").click(); });
      await page.waitFor(`document.querySelector("[data-act=label-name][data-q=ibuprofen]")`, 8000);
      await page.evaluate(() => document.querySelector("[data-act=label-name][data-q=ibuprofen]").click());
      await page.waitFor(`/Uses temporarily/.test(document.querySelector("#mdOut").innerText)`, 8000);
      for (const r of await phone(page, null)) assert(r.sw <= r.cw && !r.bad.length && !r.tiny.length, `label @${r.w} ${r.sw}>${r.cw} ${r.bad.slice(0, 4)} ${r.tiny.slice(0, 4)}`);
      await page.evaluate(() => {
        document.querySelector("#t-pill").click(); document.querySelector("#mdImp").value = "5892;V"; document.querySelector("#mdPillBtn").click();
      });
      await page.waitFor(`document.querySelectorAll("#mdPillOut .md-cand").length >= 3`, 20000);
      for (const r of await phone(page, null)) assert(r.sw <= r.cw && !r.bad.length && !r.tiny.length, `pill @${r.w} ${r.sw}>${r.cw} ${r.bad.slice(0, 4)} ${r.tiny.slice(0, 4)}`);
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
