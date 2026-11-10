// tests/e2e/product-check-lookup.e2e.mjs — medicine.html "Product check" risk-signal card (round 17, P4; lensiq-pc-lookup.js
// in #pcClaimsSlot). Fixed cases from docs/product-check/P4-RESULTS.md:
//   1. on the device only (no API base): TMT brand -> ingredient, NLEM line, the curated Thai warning (number + date + link),
//      P3 over-claim signals; NOTHING leaves the page (no request but this site); the official-source button names every
//      source and country first; after the tap every remote row says "could not check" (no server), never "no signal";
//   2. fake Worker (?fakenet seam window.__LQ_PC_FETCH): ONE POST to <API>/api/pc/batch per tap (review S6) carrying derived
//      facts only (number, GTIN, TMT name, ingredient), never the label text; registered / recall-by-name / source-down / bad
//      answer rows rendered with source + date; TMT from on-demand index shards, never the whole table (review S7); Health
//      Canada searched on the device from static shards and never part of the batch (review S5);
//   3. the real P2 hand-off: the "lq-pc-text" event (text + codes) drives the card; a GTIN goes to openFDA;
//   4. English / 中文: no Thai outside translate="no" content with the card open (before and after the lookups);
//   5. no verdict words on the card; 6. phones 320 / 360 / 390 px with the card open, before and after the lookups.
// Synthetic text only; no image of a person.
import { assert, privacyScan } from "./cdp.mjs";
import { coverage, phone } from "./gate.e2e.mjs";

const INIT = "window.confirm=()=>true;window.print=()=>{};";
const LABEL = "TYLENOL 500 Reg. No. 1A 844/39 รักษาหายขาด 100% ไม่มีผลข้างเคียง อย. 13-2-06463-5-0326";
const ITEM = { thfda: { lcnno: "1A 844/39", name_th: "ไทลินอล 500", name_en: "TYLENOL 500", status: "active", status_text: "คงอยู่", url: "https://pertento.fda.moph.go.th/x" },
  openfda: { ref: "D-0001-2026", date: "2026-07-08", title: "LQ TEST recall", reason: "CGMP", url: "https://www.accessdata.fda.gov/scripts/ires/index.cfm" } };
// the fake Worker answers each lookup of the batch; safetygate is down, hsa answers a body without items (bad shape)
const NET = `window.LENSIQ_API_BASE="https://api.example.test";window.__pcCalls=[];window.__LQ_PC_FETCH=async(u,init)=>{window.__pcCalls.push({u:String(u),m:(init&&init.method)||"GET",b:init&&init.body});
  const I=${JSON.stringify(ITEM)};const L=JSON.parse((init&&init.body)||"{}").lookups||[];
  const results=L.map(x=>{const s=x.source;if(s==="safetygate")return{status:502,source:s,ok:false,could_not_check:true,reason:"timeout"};
    if(s==="hsa")return{status:200,source:s,ok:true};const items=I[s]?[I[s]]:[];
    return{status:200,source:s,ok:true,found:items.length,total:items.length,items,fetched:"2026-11-10T03:00:00Z",credit:"LQ TEST credit",testing_only:s==="thfda"};});
  return new Response(JSON.stringify({ok:true,results}),{status:200,headers:{"Content-Type":"application/json"}});};`;
const BAN = /illegal|fake|counterfeit|genuine|authentic|ผิดกฎหมาย|ปลอม|ของแท้|违法|假冒|假货|正品/i;
const openTab = page => page.evaluate(() => { document.querySelector("#t-pc").click(); return !document.querySelector("#tab-pc").hidden; });
const card = page => page.evaluate(() => {
  const c = document.querySelector("#pcLookup");
  return c ? { text: c.innerText, tmt: [...c.querySelectorAll("[data-tmt]")].map(e => e.innerText), alerts: [...c.querySelectorAll("[data-signal=alert-th]")].map(e => e.innerText),
    alertLinks: [...c.querySelectorAll("[data-signal=alert-th] a")].map(a => a.href), claims: [...c.querySelectorAll("#pcClaims li")].map(l => l.dataset.rule),
    notice: (c.querySelector("#pcLookupNotice") || {}).innerText || "", rows: [...c.querySelectorAll("[data-source]")].map(r => ({ s: r.dataset.source, st: r.dataset.state,
      sig: r.dataset.signal || "", t: r.innerText })),
    cant: [...c.querySelectorAll("[data-cant]")].map(e => e.innerText) } : null;
});

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("pc-lookup: on the device — TMT, NLEM, Thai warning list, over-claims; nothing leaves; remote rows 'could not check' without a server", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await openTab(page);
      await page.evaluate(t => window.__LQ_PCL.run(t, []), LABEL);
      await page.waitFor(`document.querySelector("#pcLookup")`, 15000);
      const c = await card(page);
      assert(c.tmt.length === 1 && /TYLENOL 500 → paracetamol/.test(c.tmt[0]) && /บัญชียาหลักแห่งชาติ 2567/.test(c.tmt[0]), "TMT + NLEM " + JSON.stringify(c.tmt));
      assert(/17 ก\.พ\. 2563/.test(c.text), "TMT data-as-of date shown");
      assert(c.alerts.length === 1 && /2025-11-13/.test(c.alerts[0]) && /sildenafil/.test(c.alerts[0]) && /13-2-06463-5-0326/.test(c.alerts[0]), "Thai warning " + JSON.stringify(c.alerts));
      assert(c.alertLinks.length === 1 && /^https:\/\/www\.fda\.moph\.go\.th\/news\//.test(c.alertLinks[0]), "warning links to the FDA page");
      assert(c.claims.includes("D01") && c.claims.includes("D02"), "over-claim signals " + c.claims);
      assert(/1A 844\/39/.test(c.notice) && /TYLENOL 500/.test(c.notice) && /paracetamol/.test(c.notice) && /อย\. \(ไทย\)/.test(c.notice) && /สหภาพยุโรป/.test(c.notice) && !/แคนาดา/.test(c.notice),
        "notice names facts and every source / country they go to (Health Canada runs on the device, so it is not listed): " + c.notice);
      assert(!/รักษาหายขาด/.test(c.notice), "label text is never part of what is sent");
      assert(!BAN.test(c.text), "no verdict words: " + c.text.match(BAN));
      const before = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!before.length, "nothing leaves the page: " + before.map(q => q.url).join(" "));
      await page.evaluate(() => document.querySelector("#pcLookupGo").click());
      await page.waitFor(`document.querySelector("#pcLookupRows")`, 8000);
      const d = await card(page);
      const remote = d.rows.filter(r => r.s !== "healthcanada");
      assert(remote.length >= 6 && remote.every(r => r.st === "could_not_check"), "every remote row: could not check " + JSON.stringify(d.rows.map(r => r.s + ":" + r.st)));
      assert(d.rows.some(r => r.s === "healthcanada") && d.rows.filter(r => r.s === "healthcanada").every(r => r.st === "none" && /2026-11-0\d/.test(r.t)),
        "Health Canada works on the device without a server, with its data date " + JSON.stringify(d.rows.filter(r => r.s === "healthcanada")));
      assert(d.cant.some(t => /ยังไม่ได้ตั้งเซิร์ฟเวอร์/.test(t)), "reason: no server");
      const after = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!after.length, "no request without a server: " + after.map(q => q.url).join(" "));
      assert(await page.evaluate(() => /ไม่ใช่การยืนยันขั้นสุดท้าย/.test(document.querySelector("#tab-pc .pc-bottom").innerText)), "bottom line stays");
      const hcRow = d.rows.find(r => r.s === "healthcanada");
      assert(hcRow && /2023-11-08/.test(hcRow.t) && /2026-11-07/.test(hcRow.t), "Health Canada row states its window (re-review 10): " + (hcRow && hcRow.t));
      // re-review 15: P2's "could not check yet" list no longer contradicts the card
      const cant = await page.evaluate(t => { const s = window.__LQ_PC.st; s.text = t; s.read = true; window.__LQ_PC.reparse(); return document.querySelector("#pcCant").innerText; }, LABEL);
      assert(!/ยังไม่ได้ตรวจคำโฆษณาเกินจริง/.test(cant) && !/ขั้นนี้ตรวจเฉพาะรูปแบบเลข/.test(cant) && /การ์ด "สัญญาณเสี่ยง"/.test(cant), "P2 list reworded: " + cant);
      await privacyScan(page);
      await page.close();
    });

    await check("pc-lookup: fake Worker — one batch POST of derived facts; registered, recall-to-compare, source-down rows; TMT and Health Canada from on-demand shards", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT + NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakenet`);
      await openTab(page);
      await page.evaluate(t => window.__LQ_PCL.run(t + " Reg. No. SIN09110P", []), LABEL);
      await page.waitFor(`document.querySelector("#pcLookupGo")`, 15000);
      assert(await page.evaluate(() => window.__pcCalls.length === 0), "nothing sent before the tap");
      assert(await page.evaluate(() => window.__LQ_PCL.st.mode === "shards"), "TMT matched over on-demand shards");
      const got = page.requests.map(q => q.url).filter(u => /\/vendor\/pc-drugs\//.test(u));
      assert(!got.some(u => /tmt-2563\.json/.test(u)) && got.filter(u => /\/vendor\/pc-drugs\/tmt\/[0-9a-f-]+\.json/.test(u)).length >= 1 && got.length <= 45,
        "only the shards this label needs, never the whole table: " + got.length + " " + got.slice(0, 4).join(" "));
      await page.evaluate(() => document.querySelector("#pcLookupGo").click());
      await page.waitFor(`document.querySelector("#pcLookupRows")`, 8000);
      const c = await card(page);
      const by = s => c.rows.filter(r => r.s === s);
      assert(by("thfda").length && by("thfda").every(r => r.st === "found" && /2026-11-10/.test(r.t) && /TYLENOL 500/.test(r.t)), "Thai FDA registered row " + JSON.stringify(by("thfda")));
      assert(by("openfda").some(r => r.sig === "recall_name" && /D-0001-2026/.test(r.t) && /2026-07-08/.test(r.t)), "openFDA recall to compare " + JSON.stringify(by("openfda")));
      assert(by("safetygate").every(r => r.st === "could_not_check"), "source down -> could not check");
      assert(by("rasff").every(r => r.st === "none" && /ไม่ได้แปลว่าสินค้าปลอดภัย/.test(r.t)), "checked, not found, with the caveat");
      assert(c.cant.some(t => /EU Safety Gate/.test(t)), "down source listed under 'could not check'");
      assert(by("hsa").every(r => r.st === "could_not_check"), "a 200 without items is 'could not check', not 'not found'");
      assert(c.cant.some(t => /อ่านไม่ได้/.test(t)), "bad answer reason shown");
      const calls = await page.evaluate(() => window.__pcCalls);
      assert(calls.length === 1 && calls[0].m === "POST" && calls[0].u === "https://api.example.test/api/pc/batch", "one POST per tap " + JSON.stringify(calls.map(x => x.u)));
      const look = JSON.parse(calls[0].b).lookups;
      assert(look.length >= 6 && look.length <= 16 && look.every(x => Object.keys(x).every(k => ["source", "q", "op", "by"].includes(k))), "lookups " + calls[0].b);
      assert(!look.some(x => x.source === "healthcanada"), "Health Canada never sent");
      assert(by("healthcanada").length && by("healthcanada").every(r => r.st === "none"), "Health Canada row from the device " + JSON.stringify(by("healthcanada")));
      assert(page.requests.some(q => /\/vendor\/pc-recalls\/hc\/t\/[a-z0-9]{2}\.json/.test(q.url)) && !page.requests.some(q => /HCRSAMOpenData/.test(q.url)),
        "Health Canada word shards from this site, never the 16 MB file");
      const sent = calls[0].b;
      assert(!/รักษาหายขาด|ไม่มีผลข้างเคียง|100%/.test(sent), "label text never sent: " + sent);
      const has = (src, q, op) => look.some(x => x.source === src && x.q === q && (!op || x.op === op));
      assert(has("thfda", "1A 844/39", "drug") && has("thfda", "13-2-06463-5-0326", "food") && has("openfda", "TYLENOL 500") && has("rxnav", "paracetamol") && has("hsa", "SIN09110P"),
        "derived facts " + sent);
      assert(!BAN.test(c.text), "no verdict words");
      await page.close();
    });

    await check("pc-lookup: the P2 'lq-pc-text' event (text + codes) drives the card; a valid GTIN goes to openFDA only", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await openTab(page);
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("lq-pc-text", { detail: { text: "ZYCEL 200", script: "th", codes: [{ rawValue: "8850006939727", format: "ean_13" }] } })));
      await page.waitFor(`document.querySelector("#pcLookupNotice")`, 15000);
      const c = await card(page);
      assert(/ZYCEL 200 → celecoxib/.test(c.tmt.join(" ")), "TMT from the event " + c.tmt);
      assert(/8850006939727/.test(c.notice), "GTIN in the notice " + c.notice);
      const plan = await page.evaluate(() => window.__LQ_PCL.st.plan.map(p => p.path));
      assert(plan.filter(p => /8850006939727/.test(p)).every(p => p.startsWith("/api/pc/openfda?by=gtin")), "GTIN only to openFDA " + plan);
      await page.close();
    });

    await check("pc-lookup: English and 中文 leave no Thai outside translate=no content (card open, before and after the lookups)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT + NET], isolated: true });
      for (const lang of ["en", "zh"]) {
        await page.goto(`${base}/medicine.html?lang=${lang}&fakenet`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await openTab(page);
        await page.evaluate(t => window.__LQ_PCL.run(t, []), LABEL);
        await page.waitFor(`document.querySelector("#pcLookupGo")`, 15000);
        let c = await coverage(page);
        assert(c.pct === 0, `${lang} before: Thai left ${c.pct}% ${JSON.stringify(c.top)}`);
        await page.evaluate(() => document.querySelector("#pcLookupGo").click());
        await page.waitFor(`document.querySelector("#pcLookupRows")`, 8000);
        c = await coverage(page);
        assert(c.pct === 0, `${lang} after: Thai left ${c.pct}% ${JSON.stringify(c.top)}`);
        const t = await page.evaluate(() => document.querySelector("#pcLookup").innerText);
        assert(lang === "en" ? /Risk signals and facts from official sources/.test(t) && /found in|Found in/.test(t) : /风险信号/.test(t), lang + " card text");
        assert(!BAN.test(t), lang + " no verdict words");
      }
      await page.close();
    });
    await check("pc-lookup: phone 320 / 360 / 390 px with the card open (before and after the lookups) — no overflow, 44 px targets, text >= 12 px", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT + NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakenet`);
      await openTab(page);
      await page.evaluate(t => window.__LQ_PCL.run(t, []), LABEL);
      await page.waitFor(`document.querySelector("#pcLookupGo")`, 15000);
      for (const step of ["before", "after"]) {
        if (step === "after") {
          await page.evaluate(() => document.querySelector("#pcLookupGo").click());
          await page.waitFor(`document.querySelector("#pcLookupRows")`, 8000);
        }
        for (const r of await phone(page, null)) {
          assert(r.sw <= r.cw, `${step} @${r.w} overflow ${r.sw}>${r.cw}`);
          assert(!r.bad.length, `${step} @${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
          assert(!r.tiny.length, `${step} @${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
        }
      }
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
