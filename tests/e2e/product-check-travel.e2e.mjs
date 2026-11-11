// tests/e2e/product-check-travel.e2e.mjs — medicine.html "Product check" TRAVEL MODE and the reference-image tooling (round 17,
// P9; design §7, §6.3; lensiq-pc-travel.js in #pcTravelSlot, lensiq-pc-refimg.js). FIXED TEST, written before the code and
// locked (sha256 in ~/LENSIQ-field/evals/p9/locked.sha256):
//   1. a foreign label on the device only: the travel card names the INN found on the pack (with the name as printed), the
//      country and the coverage message ("no official database we can check covers Japan" + the agency's own site); Thai
//      equivalents are OFF by default (permission pending) and the card says so with the INN to ask a pharmacist; NOTHING
//      leaves the page; no verdict words; "no dose conversion" is said; a Thai label shows no travel card;
//   2. a US label: the coverage line names the official sources we can check;
//   3. flag ON (window.LENSIQ_PC_THAI_EQUIV = true, the owner's switch): a list from TMT 2020 (CC BY) with its data date and
//      credit, "a list, not a recommendation, ask a pharmacist before switching"; loaded from the small ingredient shards,
//      never the whole table; still nothing leaves the page;
//   4. AI (fake Worker, after consent and the text preview): the translation is labelled "machine translation"; dosing and
//      warning lines carry "translated from the label, not advice, ask a pharmacist" (L47) next to the original; the AI's
//      ingredient list is accepted only when its INN resolves on the device (an unresolved one is listed as not used);
//   5. English / 中文: no Thai outside translate="no" content with the travel card open; phones 320 / 360 / 390 px;
//   6. reference-image tooling on SYNTHETIC canvas boxes only: MobileNetV2 embeddings (the vector checkout.js uses) put a
//      new photo of the same box closer to its 3 references than a different box; the library holds embeddings only.
// Synthetic text and generated pictures only; no image of a person, no pack photo.
import { assert, privacyScan } from "./cdp.mjs";
import { coverage, phone } from "./gate.e2e.mjs";

const INIT = "window.confirm=()=>true;window.print=()=>{};window.__LQ_FAKE_FACE=s=>(window.__faces||{})[s]||[];";
const JA = "LQ解熱鎮痛薬\n成分 1錠中 アセトアミノフェン 300mg\n用法・用量 成人1回2錠 1日3回まで\n使用上の注意 してはいけないこと\n第2類医薬品\n日本製";
const US = "LQ PAIN RELIEF\nActive ingredient (in each caplet): Acetaminophen 500 mg\nDirections: adults take 2 caplets every 6 hours\nNDC 12345-678-90\nMade in USA";
const TH = "ยาเม็ดพาราเซตามอล 500 มก.\nเลขทะเบียน 1A 123/45\nผลิตโดย บริษัท แอลคิว ฟาร์มา จำกัด";
const BAN = /illegal|fake|counterfeit|genuine|authentic|ผิดกฎหมาย|ปลอม|ของแท้|违法|假冒|假货|正品/i;
const SWITCH = /ใช้แทน|instead of|substitute|代替|替代/i;
const NET = `window.LENSIQ_API_BASE="https://api.example.test";window.__ai=[];
  const P=(provider,model,name,region)=>({provider,model,name:{th:name,en:name,zh:name},region:{th:region,en:region,zh:region},
    retention:{th:"ลบภายใน 30 วัน",en:"Deleted within 30 days",zh:"30 天内删除"}});
  const INFO={pc_fields:{feature:"pc_fields",enabled:true,imageModeAllowed:true,stores:false,chain:[P("anthropic","claude-haiku-5-5","Anthropic","USA")]},
    pc_claims:{feature:"pc_claims",enabled:true,imageModeAllowed:false,stores:false,chain:[P("anthropic","claude-sonnet-5-5","Anthropic","USA")]},
    pc_translate:{feature:"pc_translate",enabled:true,imageModeAllowed:false,stores:false,chain:[P("anthropic","claude-haiku-5-5","Anthropic","USA")]}};
  const J=(o,s)=>new Response(JSON.stringify(o),{status:s||200,headers:{"Content-Type":"application/json"}});
  const realFetch=window.fetch.bind(window);
  window.fetch=async(u,init)=>{const url=String(u);if(!url.startsWith("https://api.example.test"))return realFetch(u,init);
    const m=(init&&init.method)||"GET",b=init&&init.body?JSON.parse(init.body):null;window.__ai.push({url,m,b});
    const p=new URL(url);if(p.pathname==="/v1/ai/providers")return J(INFO[p.searchParams.get("feature")]||{enabled:false});
    const f=p.pathname.replace("/v1/ai/","");
    const who={ok:true,provider:"anthropic",model:"claude-haiku-5-5",region:"global",providerName:{th:"Anthropic",en:"Anthropic",zh:"Anthropic"},regionText:{th:"สหรัฐฯ",en:"USA",zh:"美国"}};
    if(f==="pc_fields")return J({...who,json:{product_type:"drug",brand:"LQ",product_name:"LQ解熱鎮痛薬",active_ingredients:[
      {name_on_pack:"アセトアミノフェン",inn:"acetaminophen",strength:"300",unit:"mg"},{name_on_pack:"ユニコーニウム",inn:"unicornium",strength:null,unit:null}],
      dosage_form:"tablet",registration:[],manufacturer:null,lot:null,expiry:null,claims_on_pack:[],languages_on_pack:["ja"],unreadable:["expiry"]}});
    if(f==="pc_claims")return J({...who,json:{signals:[]}});
    if(f==="pc_translate")return J({...who,json:{source_language:"ja",lines:[
      {source:"成分 1錠中 アセトアミノフェン 300mg",translation:"ส่วนประกอบ ใน 1 เม็ด อะเซตามิโนเฟน 300 มก."},
      {source:"用法・用量 成人1回2錠 1日3回まで",translation:"วิธีใช้และขนาด ผู้ใหญ่ครั้งละ 2 เม็ด ไม่เกินวันละ 3 ครั้ง"},
      {source:"使用上の注意 してはいけないこと",translation:"ข้อควรระวังในการใช้ สิ่งที่ห้ามทำ"},
      {source:"日本製",translation:"ผลิตในญี่ปุ่น"}]}});
    return J({fallback:true,reason:"unavailable"},404);};`;
const PICTURE = () => {
  const s = window.__LQ_PC.st, c = document.querySelector("#pcStill"), x = c.getContext("2d"); c.width = 400; c.height = 300;
  const im = x.createImageData(400, 300); let v = 4242;
  for (let i = 0; i < im.data.length; i += 4) { for (let k = 0; k < 3; k++) { v = (v * 1103515245 + 12345) >>> 0; im.data[i + k] = v >>> 24; } im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); s.still = true; s.crop = { x: 50, y: 50, w: 300, h: 200 }; document.querySelector("#pcCamWrap").hidden = false; window.__faces = {};
};
const openTab = page => page.evaluate(() => { document.querySelector("#t-pc").click(); return !document.querySelector("#tab-pc").hidden; });
const outside = (page, base) => page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
const travel = page => page.evaluate(() => {
  const c = document.querySelector("#pcTravel");
  if (!c) return null;
  const eq = c.querySelector("#pcTravelEq");
  return { text: c.innerText, countries: [...c.querySelectorAll("#pcTravelCountries [data-country]")].map(e => ({ c: e.dataset.country, level: e.dataset.level, t: e.innerText,
    links: [...e.querySelectorAll("a")].map(a => a.href) })), inn: [...c.querySelectorAll("#pcTravelInn [data-inn]")].map(e => ({ inn: e.dataset.inn, via: e.dataset.via, t: e.innerText })),
    rej: [...c.querySelectorAll("#pcTravelInnRej li")].map(e => e.innerText), eq: eq ? { state: eq.dataset.state, t: eq.innerText,
      rows: [...eq.querySelectorAll("li[data-same]")].map(l => ({ same: l.dataset.same, t: l.innerText })), links: [...eq.querySelectorAll("a")].map(a => a.href) } : null,
    not: (c.querySelector("#pcTravelNot") || {}).innerText || "" };
});
async function runLabel(page, text) {
  await page.evaluate(t => window.__LQ_PCL.run(t, []), text);
  await page.waitFor(`document.querySelector("#pcLookup")`, 15000);
}

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("pc-travel: a Japanese label on the device — INN as printed, country + coverage message, Thai equivalents OFF by default, nothing leaves", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await openTab(page);
      assert(await page.evaluate(() => window.LENSIQ_PC_THAI_EQUIV === false), "the permission flag is OFF by default");
      await runLabel(page, JA);
      await page.waitFor(`document.querySelector("#pcTravel #pcTravelInn [data-inn]")`, 15000);
      const t = await travel(page);
      assert(t.inn.length === 1 && t.inn[0].inn === "paracetamol" && /アセトアミノフェン/.test(t.inn[0].t) && t.inn[0].via !== "ai", "INN + name as printed " + JSON.stringify(t.inn));
      const jp = t.countries.find(x => x.c === "JP");
      assert(jp && jp.level === "none" && /ญี่ปุ่น/.test(jp.t) && /ไม่มีฐานข้อมูลทางการที่เราตรวจได้/.test(jp.t) && jp.links.some(u => /pmda\.go\.jp/.test(u)),
        "coverage message for Japan + the agency's own site " + JSON.stringify(t.countries));
      assert(t.eq && t.eq.state === "off" && !t.eq.rows.length && /ปิดอยู่/.test(t.eq.t) && /อย\./.test(t.eq.t) && /เภสัชกร/.test(t.eq.t) && /paracetamol/.test(t.eq.t),
        "Thai equivalents off: says why, gives the INN to ask a pharmacist " + JSON.stringify(t.eq));
      assert(/ไม่แปลงขนาดยา/.test(t.not) && /เภสัชกร/.test(t.not), "no dose conversion said: " + t.not);
      assert(!BAN.test(t.text) && !SWITCH.test(t.text.replace(t.not, "")), "no verdict / switching words: " + t.text);
      assert(!outside(page, base).length, "nothing leaves the page: " + outside(page, base).map(q => q.url).join(" "));
      assert(!page.requests.some(q => /tmt-ing\//.test(q.url)), "no Thai-equivalent table loaded while the switch is off");
      assert(await page.evaluate(() => /ไม่ใช่การยืนยันขั้นสุดท้าย/.test(document.querySelector("#tab-pc .pc-bottom").innerText)), "bottom line stays");
      // a Thai label: no travel card
      await runLabel(page, TH);
      await page.waitFor(`window.__LQ_PCL.st.text === ${JSON.stringify(TH)}`, 8000);
      assert(!(await travel(page)), "no travel card for a Thai product");
      await privacyScan(page);
      await page.close();
    });

    await check("pc-travel: a US label — the coverage line names the official sources we can check", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await openTab(page);
      await runLabel(page, US);
      await page.waitFor(`document.querySelector("#pcTravel [data-country=US]")`, 15000);
      const t = await travel(page);
      const us = t.countries.find(x => x.c === "US");
      assert(us.level === "covered" && /openFDA/.test(us.t) && /RxNorm/.test(us.t), "US covered: " + us.t);
      assert(t.inn.some(x => x.inn === "paracetamol" && /Acetaminophen/.test(x.t)), "acetaminophen -> paracetamol " + JSON.stringify(t.inn));
      assert(!outside(page, base).length, "nothing leaves the page");
      await page.close();
    });

    await check("pc-travel: owner's switch ON — TMT 2020 list (CC BY, data date, credit), 'not a recommendation', from small shards only", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, "window.LENSIQ_PC_THAI_EQUIV=true;"], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await openTab(page);
      await runLabel(page, JA);
      await page.waitFor(`document.querySelector("#pcTravelEq[data-state=on] li[data-same]")`, 15000);
      const t = await travel(page);
      assert(t.eq.rows.length >= 3 && t.eq.rows.length <= 12, "a short list " + t.eq.rows.length);
      assert(/17 ก\.พ\. 2563/.test(t.eq.t) && /TMT/.test(t.eq.t) && /CC BY/.test(t.eq.t), "data date + source + licence: " + t.eq.t.slice(0, 300));
      assert(/ไม่ใช่คำแนะนำ/.test(t.eq.t) && /ถามเภสัชกรก่อนเปลี่ยนยา/.test(t.eq.t) && /ไม่ใช่ทะเบียน/.test(t.eq.t), "list, not a recommendation, not a register: " + t.eq.t.slice(0, 400));
      assert(!BAN.test(t.text) && !SWITCH.test(t.eq.t), "no verdict / 'use instead' words");
      assert(!page.requests.some(q => /tmt-2563\.json/.test(q.url)), "never the whole table");
      assert(page.requests.some(q => /vendor\/pc-drugs\/tmt-ing\//.test(q.url)), "the ingredient shards");
      assert(!outside(page, base).length, "still nothing leaves the page");
      await page.close();
    });

    await check("pc-travel: AI translation — 'machine translation', dosing / warning lines labelled per L47 beside the original; AI INN accepted only when it resolves", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, NET], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await page.evaluate(PICTURE);
      await page.evaluate(t => { const s = window.__LQ_PC.st; s.ocr = { text: t, lines: t.split("\n"), script: "cjk", ms: { total: 1 } }; s.text = t; s.read = true;
        window.__LQ_PC.reparse(); }, JA);
      await page.waitFor(`document.querySelector("#pcAiGo")`, 15000);
      await page.evaluate(() => document.querySelector("#pcAiGo").click());
      await page.waitFor(`document.querySelector("dialog.lq-ai-consent") && document.querySelector("dialog.lq-ai-consent").open`, 8000);
      await page.evaluate(() => document.querySelector("dialog.lq-ai-consent button[value=ok]").click());
      await page.waitFor(`document.querySelector("#pcAiPrevSend")`, 8000);
      await page.evaluate(() => document.querySelector("#pcAiPrevSend").click());
      await page.waitFor(`document.querySelector("#pcAiOut #pcAiTr")`, 8000);
      const tr = await page.evaluate(() => ({ mt: (document.querySelector("#pcAiTrMt") || {}).innerText || "",
        rows: [...document.querySelectorAll("#pcAiTr dd[data-kind]")].map(d => ({ kind: d.dataset.kind, t: d.innerText, note: !!d.querySelector("[data-l47]"),
          src: d.previousElementSibling ? d.previousElementSibling.innerText : "", srcNo: d.previousElementSibling ? !!d.previousElementSibling.querySelector("[translate=no]") : false })) }));
      assert(/แปลด้วยเครื่อง/.test(tr.mt), "machine translation label: " + tr.mt);
      const dose = tr.rows.find(r => /用法/.test(r.src)), warn = tr.rows.find(r => /注意/.test(r.src)), other = tr.rows.find(r => /成分/.test(r.src));
      assert(dose && dose.kind === "dose" && dose.note && /แปลจากฉลาก ไม่ใช่คำแนะนำ ถามเภสัชกร/.test(dose.t) && dose.srcNo, "dosing line labelled (L47), original kept " + JSON.stringify(dose));
      assert(warn && warn.kind === "warning" && warn.note, "warning line labelled " + JSON.stringify(warn));
      assert(other && other.kind === "other" && !other.note, "an ingredient line has no L47 note " + JSON.stringify(other));
      await page.waitFor(`document.querySelector("#pcTravelInn [data-via=ai]") || document.querySelector("#pcTravelInnRej li")`, 8000);
      const t = await travel(page);
      assert(t.inn.filter(x => x.inn === "paracetamol").length === 1, "one row per INN (device + AI agree) " + JSON.stringify(t.inn));
      assert(t.rej.length === 1 && /ユニコーニウム/.test(t.rej[0]), "the unresolved AI ingredient is listed as not used " + JSON.stringify(t.rej));
      assert(!t.inn.some(x => /unicornium/i.test(x.inn)), "an unresolved INN is never shown as an INN");
      const sent = await page.evaluate(() => window.__ai.filter(c => c.m === "POST").map(c => c.url.split("/v1/ai/")[1]));
      assert(sent.includes("pc_translate"), "translation went through the gateway after consent " + sent);
      await page.close();
    });

    await check("pc-travel: English / 中文 — no Thai left outside translate=no; phones 320 / 360 / 390 px", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, "window.LENSIQ_PC_THAI_EQUIV=true;"], isolated: true });
      for (const lang of ["en", "zh"]) {
        await page.goto(`${base}/medicine.html?lang=${lang}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await openTab(page);
        await runLabel(page, JA);
        await page.waitFor(`document.querySelector("#pcTravelEq[data-state=on] li[data-same]")`, 15000);
        const c = await coverage(page);
        assert(c.pct === 0, `${lang}: Thai left ${c.pct}% ${JSON.stringify(c.top)}`);
        const t = await travel(page);
        assert(lang === "en" ? /Travel mode/.test(t.text) && /Japan/.test(t.text) && /not a recommendation/i.test(t.eq.t) : /旅行模式/.test(t.text) && /日本/.test(t.text), lang + " card text");
        assert(!BAN.test(t.text), lang + " no verdict words");
      }
      for (const r of await phone(page, null)) {
        assert(r.sw <= r.cw, `@${r.w} overflow ${r.sw}>${r.cw}`);
        assert(!r.bad.length, `@${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
        assert(!r.tiny.length, `@${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
      }
      await page.close();
    });

    await check("pc-refimg: synthetic canvas boxes — MobileNetV2 embeddings separate the same box from a different one; the library holds embeddings only", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      const r = await page.evaluate(async () => {
        const load = src => new Promise((res, rej) => {
          const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s);
        });
        if (!window.tf) await load("vendor/tfjs/tf.es2017.min.js");
        if (!window.LQPCRefImg) await load("lensiq-pc-refimg.js");
        const R = window.LQPCRefImg, tf = window.tf;
        const m = await R.loadModel(tf);
        const emb = (design, variant) => { const c = document.createElement("canvas"); R.drawSynthetic(c, design, variant); return R.embedCanvas(tf, m.model, c); };
        const entries = [];
        for (const d of [0, 1]) for (let v = 0; v < 3; v++) entries.push({ key: { gtin: d ? "4006381333931" : "8850123456787" }, licence: "synthetic", credit: "LENSIQ synthetic box",
          source: "generated in the test", date: "2026-11-11", photo_sha256: R.hexOf(d * 10 + v), vec: emb(d, v) });
        const lib = R.buildLibrary(entries, { embedder: "mnv2", built: "2026-11-11" });
        const same = R.compare(lib, { gtin: "8850123456787" }, emb(0, 3)), other = R.compare(lib, { gtin: "8850123456787" }, emb(2, 0));
        return { backend: m.backend, dim: lib.dim, valid: R.validateLibrary(lib).ok, json: JSON.stringify(lib).length, sample: JSON.stringify(lib).slice(0, 2000), same, other };
      });
      assert(r.dim === 1280 && r.valid, "1280-d MobileNetV2 embeddings, valid library " + JSON.stringify({ dim: r.dim, valid: r.valid, backend: r.backend }));
      assert(r.same.state === "similar" && r.other.state === "looks-different" && r.same.best > r.other.best, "same box vs other box " + JSON.stringify([r.same, r.other]));
      assert(r.same.weak && !r.same.standalone, "weak signal, never alone");
      assert(!/data:image|base64,|"image"|"pixels"/.test(r.sample), "embeddings only in the library");
      assert(!outside(page, base).length, "nothing leaves the page");
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
