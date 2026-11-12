// tests/e2e/nutrition.e2e.mjs — nutrition.html, label mode (Nutrition MVP; docs/NUTRITION-DESIGN.md §2.1, §2.2, §6, §7).
// FIXED TEST, written and locked (~/LENSIQ-field/evals/nutrition/locked.sha256) BEFORE the page existed:
//   1. loads on the device: Thai default, fixed not-medical-advice footer, 1323 in Help, no model before a picture, no
//      third-party request, nothing stored, no console error;
//   2. typed / pasted label text: printed values with units and their source line, "please check" chips, fields not on
//      the label listed as not found (never zero), allergen statement verbatim + the fixed "check the actual label" line;
//   3. amount eaten: calculated column marked "≈" and "calculated from the printed values", kept apart from the printed
//      column; grams without a printed serving weight -> a message and no number; the user edits a value -> "edited by you";
//   4. hide calories: no energy value or energy unit anywhere in the result; one tap shows it for that card only and the
//      setting stays on; a label without an allergen statement says "not found ... does not mean there is none";
//   5. EU panel: kJ -> kcal and salt -> sodium shown on a separate line marked "converted by LENSIQ";
//   6. REAL on-device OCR (PP-OCRv5, WASM, no WebGL) of a synthetic Thai panel drawn on a canvas (repo fonts only): the
//      card shows the energy and sodium values; nothing is uploaded;
//   7. English / 中文: no Thai outside label text marked lang="th" / translate="no"; 8. phones 320 / 360 / 390 px.
// Synthetic text and canvas images only; no photo of a person.
import { assert, privacyScan } from "./cdp.mjs";
import { coverage, phone } from "./gate.e2e.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hardErrors = (page, base) => page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)));
const INIT = "window.confirm=()=>true;window.print=()=>{};";
const TH = ["ข้อมูลโภชนาการ", "หนึ่งหน่วยบริโภค : 1 ซอง (40 กรัม)", "จำนวนหน่วยบริโภคต่อซอง : 2", "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค",
  "พลังงานทั้งหมด 170 กิโลแคลอรี", "ไขมันทั้งหมด 6 ก. 9%", "ไขมันอิ่มตัว 2 ก. 10%", "โปรตีน 4 ก.", "คาร์โบไฮเดรตทั้งหมด 25 ก. 8%", "น้ำตาลทั้งหมด 11 ก.",
  "โซเดียม 230 มก. 10%", "ข้อมูลสำหรับผู้แพ้อาหาร: มี นม ข้าวสาลี"].join("\n");
const NO_W = ["ข้อมูลโภชนาการ", "หนึ่งหน่วยบริโภค : 1 ซอง", "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค", "พลังงานทั้งหมด 170 กิโลแคลอรี", "โซเดียม 230 มก."].join("\n");
const EU = ["Nutrition declaration Per 100 g Per 30 g serving", "Energy 1650 kJ / 394 kcal 495 kJ / 118 kcal", "Fat 12 g 3.6 g", "Carbohydrate 60 g 18 g",
  "Protein 8.0 g 2.4 g", "Salt 0.85 g 0.26 g"].join("\n");
const typeText = (page, t) => page.evaluate(t => { document.querySelector("#nutText").value = t; document.querySelector("#nutParse").click(); }, t);
const card = page => page.evaluate(() => {
  const o = document.querySelector("#nutOut");
  return {
    text: o.innerText,
    rows: [...o.querySelectorAll("[data-field]")].map(r => ({ f: r.dataset.field, b: r.dataset.basis, printed: (r.querySelector(".nut-printed") || {}).textContent || "",
      st: (r.querySelector(".nut-st") || { dataset: {} }).dataset.st || "", calc: (r.querySelector(".nut-calc") || {}).textContent || "",
      src: (r.querySelector(".nut-src") || {}).textContent || "", conv: (r.querySelector(".nut-conv") || {}).textContent || "" })),
    notFound: (o.querySelector("#nutNotFound") || {}).textContent || "",
    allergen: (o.querySelector("#nutAllergen") || {}).innerText || "",
    calcMsg: (o.querySelector("#nutCalcMsg") || {}).textContent || ""
  };
});
const DRAW = `window.__drawPanel = async () => {
  const add = async (fam, url, o) => { const f = new FontFace(fam, "url(" + url + ")", o); document.fonts.add(await f.load()); };
  await add("LQThai", "/vendor/fonts/prompt/prompt-500-thai.woff2", { weight: "500", unicodeRange: "U+0E00-0E7F" });
  await add("LQThai", "/tests/fixtures/fonts/liberation/LiberationSans-Regular.ttf", { weight: "500", unicodeRange: "U+0000-00FF" });
  const L = ["ข้อมูลโภชนาการ", "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค", "พลังงานทั้งหมด 160 กิโลแคลอรี", "ไขมันทั้งหมด 6 ก.", "โปรตีน 4 ก.", "คาร์โบไฮเดรตทั้งหมด 23 ก.",
    "น้ำตาลทั้งหมด 8 ก.", "โซเดียม 230 มก."];
  const c = document.createElement("canvas"); c.width = 820; c.height = 70 + L.length * 54;
  const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#111"; x.textBaseline = "middle"; x.font = '500 30px "LQThai"';
  L.forEach((t, i) => x.fillText(t, 40, 50 + i * 54));
  window.__panel = c;
  return document.fonts.check('500 30px "LQThai"', "ข้อมูล");
};`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("nutrition: loads on the device — Thai default, fixed footer, 1323 in Help, no model before a picture, nothing sent or stored", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/nutrition.html`);
      const r = await page.evaluate(() => ({
        lang: document.documentElement.lang, footer: document.querySelector("#nutFooter").innerText,
        help: document.querySelector("#nutHelp").innerText, tel: [...document.querySelectorAll("#nutHelp a[href^='tel:']")].map(a => a.getAttribute("href")),
        api: !!window.LQNut && !!window.__LQ_NUT, hide: document.querySelector("#nutHideKcal").checked, script: document.querySelector("#nutScript").value
      }));
      assert(r.lang === "th" && r.api, "page state " + JSON.stringify(r));
      assert(/ข้อมูลเพื่อประกอบการตัดสินใจ ไม่ใช่คำแนะนำทางการแพทย์/.test(r.footer) && /แพทย์หรือนักกำหนดอาหาร/.test(r.footer), "footer " + r.footer);
      assert(r.tel.includes("tel:1323") && /1323/.test(r.help), "support line 1323 in Help");
      assert(r.hide === false && r.script === "th", "defaults: calories shown, Thai script");
      await sleep(300);
      const models = page.requests.filter(q => /vendor\/(models|ort|zxing|mediapipe)\//.test(q.url));
      assert(!models.length, "no model download before a picture: " + models.map(q => q.url).join(", "));
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !q.url.startsWith("data:") && !q.url.startsWith("blob:"));
      assert(!ext.length, "no third-party requests: " + ext.map(x => x.url).join(", "));
      await privacyScan(page);
      const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => !/^lq-(lang|i18n-debug)$/.test(k)));
      assert(!keys.length, "nothing stored: " + keys);
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("nutrition: typed label text -> printed values with source lines, not-found list, allergen box, amount eaten, edit by the user", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/nutrition.html`);
      await typeText(page, TH);
      await page.waitFor(`document.querySelector("#nutOut [data-field]")`, 5000);
      const c = await card(page);
      const row = f => c.rows.find(x => x.f === f);
      assert(row("energy_kcal") && /170/.test(row("energy_kcal").printed) && /กิโลแคลอรี|kcal/.test(row("energy_kcal").printed), "energy as printed " + JSON.stringify(row("energy_kcal")));
      assert(/230/.test(row("sodium").printed) && /มก/.test(row("sodium").printed), "sodium as printed " + JSON.stringify(row("sodium")));
      assert(/โซเดียม 230 มก\./.test(row("sodium").src), "source line shown " + row("sodium").src);
      assert(c.rows.every(x => x.st), "every row has a status chip");
      assert(/ใยอาหาร/.test(c.notFound) && !c.rows.some(x => x.f === "fibre"), "fibre listed as not found, never zero: " + c.notFound);
      assert(/มี นม ข้าวสาลี/.test(c.allergen) && /โปรดตรวจฉลากจริงด้วยตัวเองทุกครั้ง/.test(c.allergen), "allergen box " + c.allergen);
      const marks = await page.evaluate(() => [...document.querySelectorAll("#nutAllergen mark")].map(m => m.textContent));
      assert(marks.includes("นม") && marks.includes("ข้าวสาลี"), "allergen words highlighted " + marks);
      assert(!/ปลอดสารก่อภูมิแพ้|ไม่มีสารก่อภูมิแพ้/.test(c.text), "never allergen-free");
      // amount eaten: 2 servings (= the whole pack)
      await page.evaluate(() => { const k = document.querySelector("#nutAmtKind"); k.value = "pack"; k.dispatchEvent(new Event("change")); });
      const p2 = await card(page);
      assert(/≈\s*340/.test(p2.rows.find(x => x.f === "energy_kcal").calc), "whole pack = 2 × 170 " + JSON.stringify(p2.rows.find(x => x.f === "energy_kcal")));
      assert(/≈\s*460/.test(p2.rows.find(x => x.f === "sodium").calc), "sodium × 2");
      assert(/170/.test(p2.rows.find(x => x.f === "energy_kcal").printed), "printed column unchanged");
      assert(/คำนวณจากค่าบนฉลาก/.test(p2.text), "calculated column is labelled");
      await page.evaluate(() => { const k = document.querySelector("#nutAmtKind"); k.value = "g"; k.dispatchEvent(new Event("change"));
        const n = document.querySelector("#nutAmtN"); n.value = "20"; n.dispatchEvent(new Event("input")); });
      const g = await card(page);
      assert(/≈\s*85/.test(g.rows.find(x => x.f === "energy_kcal").calc), "20 g of a 40 g serving " + JSON.stringify(g.rows.find(x => x.f === "energy_kcal")));
      // edit a printed value -> "edited by you"; the calculation follows the edit
      await page.evaluate(() => { const r = document.querySelector("#nutOut [data-field=sodium]"); r.querySelector(".nut-edit").click(); });
      await page.evaluate(() => { const i = document.querySelector("#nutOut [data-field=sodium] .nut-edit-in"); i.value = "250"; i.closest("form").requestSubmit(); });
      const e = await card(page);
      const s = e.rows.find(x => x.f === "sodium");
      assert(/250/.test(s.printed) && s.st === "edited" && /แก้โดยคุณ/.test(e.text), "edited value marked " + JSON.stringify(s));
      assert(/≈\s*125/.test(s.calc), "calculation follows the edit " + s.calc);
      // per serving only, no printed serving weight: grams are refused with a message, servings still work
      await typeText(page, NO_W);
      await page.evaluate(() => { const k = document.querySelector("#nutAmtKind"); k.value = "g"; k.dispatchEvent(new Event("change"));
        const n = document.querySelector("#nutAmtN"); n.value = "50"; n.dispatchEvent(new Event("input")); });
      const nw = await card(page);
      assert(/ไม่ได้พิมพ์น้ำหนัก/.test(nw.calcMsg) && nw.rows.every(x => !/\d/.test(x.calc)), "no guessed weight: " + nw.calcMsg + " " + JSON.stringify(nw.rows));
      assert(/ไม่พบข้อความเรื่องสารก่อภูมิแพ้ในภาพนี้ ซึ่งไม่ได้แปลว่าไม่มี/.test(nw.allergen) && /โปรดตรวจฉลากจริงด้วยตัวเองทุกครั้ง/.test(nw.allergen),
        "no statement: not found is not none " + nw.allergen);
      const posts = page.requests.filter(q => q.method && q.method !== "GET");
      assert(!posts.length, "nothing uploaded: " + posts.map(q => q.url).join(", "));
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("nutrition: hide calories removes every energy value from the result; one tap reveals it for that card only", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/nutrition.html`);
      await page.evaluate(() => { const h = document.querySelector("#nutHideKcal"); h.checked = true; h.dispatchEvent(new Event("change")); });
      await typeText(page, TH);
      await page.waitFor(`document.querySelector("#nutOut [data-field]")`, 5000);
      await page.evaluate(() => { const k = document.querySelector("#nutAmtKind"); k.value = "pack"; k.dispatchEvent(new Event("change")); });
      const h = await page.evaluate(() => ({ html: document.querySelector("#nutOut").innerHTML, text: document.querySelector("#nutOut").innerText,
        details: [...document.querySelectorAll("details")].filter(d => d.querySelector("#nutText")).map(d => d.open) }));
      assert(!/170|340/.test(h.html), "no energy value in the result DOM");
      assert(!/กิโลแคลอรี|kcal|\bkJ\b|พลังงาน/.test(h.text), "no energy row or unit: " + h.text.slice(0, 200));
      await page.evaluate(() => document.querySelector("#nutReveal").click());
      const shown = await page.evaluate(() => document.querySelector("#nutOut").innerText);
      assert(/170/.test(shown), "revealed for this card");
      assert(await page.evaluate(() => document.querySelector("#nutHideKcal").checked), "the setting stays on");
      await typeText(page, TH);
      assert(!/170/.test(await page.evaluate(() => document.querySelector("#nutOut").innerHTML)), "a new card is hidden again");
      await page.close();
    });

    await check("nutrition: EU panel — kJ -> kcal and salt -> sodium on a separate 'converted by LENSIQ' line", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/nutrition.html`);
      await typeText(page, EU);
      await page.waitFor(`document.querySelector("#nutOut [data-field]")`, 5000);
      const c = await card(page);
      const salt = c.rows.find(x => x.f === "salt" && x.b === "100g");
      assert(salt && /0\.85/.test(salt.printed) && /340/.test(salt.conv) && /แปลงโดย LENSIQ/.test(salt.conv), "salt converted apart " + JSON.stringify(salt));
      assert(!/340/.test(salt.printed), "converted value not in the printed column");
      const kj = c.rows.find(x => x.f === "energy_kj" && x.b === "100g");
      assert(kj && /1650/.test(kj.printed), "kJ as printed " + JSON.stringify(kj));
      assert(c.rows.some(x => x.b === "serving") && c.rows.some(x => x.b === "100g"), "both columns");
      await page.close();
    });

    await check("nutrition: REAL on-device OCR of a synthetic Thai panel (PP-OCRv5, WASM) -> energy and sodium on the card, nothing uploaded", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, DRAW], isolated: true });
      await page.goto(`${base}/nutrition.html`);
      assert(await page.evaluate(() => window.__drawPanel()), "test fonts loaded");
      await page.evaluate(() => window.__LQ_NUT.setImage(window.__panel));
      await page.waitFor(`document.querySelector("#nutOut [data-field=sodium]")`, 180000);
      const c = await card(page);
      const e = c.rows.find(x => x.f === "energy_kcal"), s = c.rows.find(x => x.f === "sodium");
      assert(e && /160/.test(e.printed), "energy read on the device " + JSON.stringify(c.rows) + " " + JSON.stringify(await page.evaluate(() => window.__LQ_NUT.st.text)));
      assert(s && /230/.test(s.printed), "sodium read on the device " + JSON.stringify(s));
      const loaded = await page.evaluate(() => window.LQPCRun.loaded());
      assert(loaded.det && loaded.rec.th, "on-device models used " + JSON.stringify(loaded));
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !q.url.startsWith("data:") && !q.url.startsWith("blob:"));
      assert(!ext.length, "on device only: " + ext.map(x => x.url).join(", "));
      const posts = page.requests.filter(q => q.method && q.method !== "GET");
      assert(!posts.length, "nothing uploaded: " + posts.map(q => q.method + " " + q.url).join(", "));
      const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => !/^lq-(lang|i18n-debug)$/.test(k)));
      assert(!keys.length, "nothing stored: " + keys);
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("nutrition: English / 中文 leave no Thai outside label text; phones 320 / 360 / 390 px without sideways scrolling", async () => {
      for (const lang of ["en", "zh"]) {
        const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
        await page.goto(`${base}/nutrition.html?lang=${lang}`);
        await page.waitFor(`document.documentElement.lang !== "th"`, 8000);
        await sleep(300);
        await page.evaluate(() => document.querySelector("#nutSample").click());
        await page.waitFor(`document.querySelector("#nutOut [data-field]")`, 5000);
        await page.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
        const cov = await coverage(page);
        assert(cov.pct === 0, `${lang}: Thai left ${cov.pct} % ${JSON.stringify(cov.top)}`);
        await page.close();
      }
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/nutrition.html`);
      await page.evaluate(() => document.querySelector("#nutSample").click());
      await page.waitFor(`document.querySelector("#nutOut [data-field]")`, 5000);
      for (const r of await phone(page, null)) { // the page WITH a result card
        assert(r.sw <= r.cw, `@${r.w} overflow ${r.sw}>${r.cw}`);
        assert(!r.bad.length, `@${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
        assert(!r.tiny.length, `@${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
      }
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
