// tests/e2e/product-check.e2e.mjs — medicine.html "Product check" tab (round 17, P2: on-device recognition). Fixed test
// set written before the tab was built (design docs/PRODUCT-CHECK-DESIGN.md §3, §8, §12 P2):
//   1. the tab loads offline: Thai is the default script, the fixed bottom line + 1669 / 1367 are there, no model is
//      downloaded before a picture is chosen, no third-party request, nothing stored;
//   2. the REAL models (PP-OCRv5 det + th / cjk rec, ONNX Runtime Web WASM, no WebGL) read a synthetic label drawn on a
//      canvas with Thai + Latin + Chinese text (fonts from the repo, no system font): registration-number shapes for
//      Thailand (drug, food) and China come out of the UI with "how to verify" links and the "could not check" list;
//   3. barcodes through the self-hosted zxing-wasm ponyfill: a generated EAN-13 (check digit, GS1 issuer note) and a
//      GS1 DataMatrix (GTIN, expiry as a printed fact, lot, serial); the wasm comes from vendor/zxing, never a CDN;
//   4. the face gate blocks: a face from the detector seam (?fakeface, same approach as the other face e2e tests) blocks,
//      a missing model blocks (?noface), and a detector that cannot run (no WebAssembly) blocks (fails closed);
//   5. English / 中文 leave no Thai outside lang="th" / translate="no" content; 6. phones 320 / 360 / 390 px.
// Synthetic images only (canvas); no photo of a person is used or committed.
import { assert, privacyScan } from "./cdp.mjs";
import { coverage, phone } from "./gate.e2e.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hardErrors = (page, base) => page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)));
const INIT = "window.confirm=()=>true;window.print=()=>{};";
// EAN-13 8850006939727 and GS1 DataMatrix "(01)09501101530003(17)270131(10)LQTEST1(21)SN42", generated once with the
// zxing-wasm writer (not vendored); "0" = dark module
const EAN = "01010010001000110111001010110001011000101000010101000101101111010001011011101100100110111011010";
const DM = ["0101010101010101010101", "0011000010101101111100", "0111010110110100110111", "0100110011100111001010", "0001010111111100110001",
  "0111101100101110111100", "0110010010101010000001", "0010101000101010011000", "0001010101010110011011", "0011000110000111000110",
  "0111111010000111100101", "0010100010011110010000", "0101000111111100001001", "0111100110111101101000", "0101100000010001101101",
  "0111100110010111011010", "0011110101101101110111", "0010000100100111001100", "0010001011110001001011", "0101001011110100111100",
  "0100000110011011100001", "0000000000000000000000"];
// draws the synthetic label / codes into window.__label / __ean / __dm (fonts: Prompt (OFL, vendored), Liberation Sans
// and a 12 KB Noto Sans SC subset (OFL, tests/fixtures/fonts) — identical glyphs on CI and dev machines)
const DRAW = `window.__draw = async () => {
  const add = async (fam, url, o) => { const f = new FontFace(fam, "url(" + url + ")", o); document.fonts.add(await f.load()); };
  await add("LQThai", "/vendor/fonts/prompt/prompt-500-thai.woff2", { weight: "500", unicodeRange: "U+0E00-0E7F" });
  await add("LQThai", "/vendor/fonts/prompt/prompt-500-latin.woff2", { weight: "500", unicodeRange: "U+0000-00FF" });
  await add("LQTestSans", "/tests/fixtures/fonts/liberation/LiberationSans-Bold.ttf", { weight: "700" });
  await add("LQTestCJK", "/tests/fixtures/fonts/noto-sans-sc-subset/LQTestCJKSubset-Bold.ttf", { weight: "700" });
  const c = document.createElement("canvas"); c.width = 900; c.height = 560;
  const x = c.getContext("2d"); x.fillStyle = "#f6f2e8"; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = "#14213d"; x.fillRect(0, 0, c.width, 14);
  x.fillStyle = "#111"; x.textBaseline = "middle";
  x.font = "500 44px LQThai"; x.fillText("ยาแก้ปวดลดไข้", 60, 80);
  x.font = "500 34px LQThai"; x.fillText("อย. 10-1-12345-1-0001", 60, 160);
  x.font = "700 36px LQTestSans"; x.fillText("Reg. No. 1A 15/50", 60, 240);
  x.font = "700 40px LQTestCJK"; x.fillText("国药准字H20003263", 60, 330);
  x.font = "700 44px LQTestCJK"; x.fillText("感冒灵颗粒", 60, 420);
  window.__label = c;
  const e = document.createElement("canvas"); e.width = 95 * 3 + 80; e.height = 170;
  const ex = e.getContext("2d"); ex.fillStyle = "#fff"; ex.fillRect(0, 0, e.width, e.height); ex.fillStyle = "#000";
  [...${JSON.stringify(EAN)}].forEach((ch, i) => { if (ch === "0") ex.fillRect(40 + i * 3, 25, 3, 120); });
  window.__ean = e;
  const d = document.createElement("canvas"); d.width = 22 * 7 + 80; d.height = d.width;
  const dx = d.getContext("2d"); dx.fillStyle = "#fff"; dx.fillRect(0, 0, d.width, d.height); dx.fillStyle = "#000";
  ${JSON.stringify(DM)}.forEach((row, y) => [...row].forEach((ch, xx) => { if (ch === "0") dx.fillRect(40 + xx * 7, 40 + y * 7, 7, 7); }));
  window.__dm = d;
  return document.fonts.check("700 40px LQTestCJK", "国药准字") && document.fonts.check("500 44px LQThai", "ยา");
};`;
const openTab = page => page.evaluate(() => { document.querySelector("#t-pc").click(); return !document.querySelector("#tab-pc").hidden; });
const results = page => page.evaluate(() => ({
  status: document.querySelector("#pcStatus").textContent,
  regs: [...document.querySelectorAll("#pcRegs [data-country]")].map(e => `${e.dataset.country}:${e.dataset.kind}:${e.querySelector(".md-imp").textContent}`),
  text: (document.querySelector("#pcText") || {}).value || "",
  codes: document.querySelector("#pcCodes") ? document.querySelector("#pcCodes").innerText : "",
  how: [...document.querySelectorAll("#pcHow a")].map(a => a.href),
  cant: document.querySelector("#pcCant") ? document.querySelector("#pcCant").innerText : "",
  crop: window.__LQ_PC.st.crop, still: [document.querySelector("#pcStill").width, document.querySelector("#pcStill").height],
  cropShown: !document.querySelector("#pcCrop").hidden
}));

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("product-check: tab loads offline — Thai default, bottom line + 1669 / 1367, no model before a picture, nothing sent or stored", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      assert(await openTab(page), "tab opens");
      const r = await page.evaluate(() => ({
        script: document.querySelector("#pcScript").value, bottom: document.querySelector("#tab-pc .pc-bottom").innerText,
        tels: [...document.querySelectorAll("#tab-pc a[href^='tel:']")].map(a => a.getAttribute("href")),
        api: !!window.LQPC && !!window.LQPCRun && !!window.__LQ_PC, selected: document.querySelector("#t-pc").getAttribute("aria-selected"),
        others: ["#tab-pack", "#tab-pill", "#tab-hist"].map(s => document.querySelector(s).hidden)
      }));
      assert(r.script === "th", "Thai is the default script: " + r.script);
      assert(/ไม่ใช่การยืนยันขั้นสุดท้าย ยืนยันกับเภสัชกร/.test(r.bottom), "fixed bottom line " + r.bottom);
      assert(r.tels.includes("tel:1669") && r.tels.includes("tel:1367"), "1669 / 1367 " + r.tels);
      assert(r.api && r.selected === "true" && r.others.every(Boolean), "tab state " + JSON.stringify(r));
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

    await check("product-check: REAL on-device OCR of a synthetic Thai + Latin + Chinese label — auto crop, editable text, TH + CN number shapes, verify links, could-not-check list", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, DRAW], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await openTab(page);
      assert(await page.evaluate(() => window.__draw()), "test fonts loaded");
      await page.evaluate(() => window.__LQ_PC.setImage(window.__label));
      await page.waitFor(`document.querySelector("#pcRegs")`, 120000);
      const th = await results(page);
      const cr = th.crop;
      assert(th.cropShown && cr && cr.w > 300 && cr.h > 300 && cr.x >= 0 && cr.y >= 0 && cr.x + cr.w <= th.still[0] && cr.y + cr.h <= th.still[1],
        "auto crop around the text " + JSON.stringify(cr));
      assert(th.regs.includes("TH:drug:1A 15/50"), "Thai drug registration shape from OCR: " + JSON.stringify(th.regs) + " text " + JSON.stringify(th.text));
      assert(th.regs.includes("TH:food:10-1-12345-1-0001"), "Thai food number from OCR: " + JSON.stringify(th.regs) + " text " + JSON.stringify(th.text));
      const acc = await page.evaluate(t => Math.max(...t.split("\n").map(l => window.LQPC.charAccuracy("ยาแก้ปวดลดไข้", l))), th.text);
      assert(acc >= 0.8, "Thai line read (char accuracy " + acc + "): " + JSON.stringify(th.text));
      assert(th.how.some(u => /oryor\.com/.test(u)) && th.how.some(u => /porta\.fda\.moph\.go\.th/.test(u)), "Thai verify links " + th.how);
      assert(/ยังไม่ได้ตรวจเลขกับฐานข้อมูลทะเบียน/.test(th.cant), "could-not-check list " + th.cant);
      assert(!/ของแท้|ของปลอม/.test(await page.evaluate(() => document.querySelector("#tab-pc").innerText)), "no genuine / fake verdict");
      // the user edits the text: parsing follows the edit (no model run)
      await page.evaluate(() => { document.querySelector("#pcText").value = "MAL19990123AZ"; document.querySelector("#pcReparse").click(); });
      const ed = await results(page);
      assert(ed.regs.length === 1 && ed.regs[0] === "MY:mal:MAL19990123AZ" && ed.how.some(u => /quest3plus/.test(u)), "edited text re-parsed " + JSON.stringify(ed.regs));
      // Chinese: the user switches the script and reads again
      await page.evaluate(() => { const s = document.querySelector("#pcScript"); s.value = "cjk"; s.dispatchEvent(new Event("change")); document.querySelector("#pcRun").click(); });
      await page.waitFor(`/国药准字/.test((document.querySelector("#pcText") || {}).value || "")`, 120000);
      const cn = await results(page);
      assert(cn.regs.includes("CN:cn-drug:国药准字H20003263"), "Chinese approval-number shape: " + JSON.stringify(cn.regs) + " " + JSON.stringify(cn.text));
      const acc2 = await page.evaluate(t => Math.max(...t.split("\n").map(l => window.LQPC.charAccuracy("感冒灵颗粒", l))), cn.text);
      assert(acc2 >= 0.8, "Chinese line read (char accuracy " + acc2 + "): " + JSON.stringify(cn.text));
      const loaded = await page.evaluate(() => window.LQPCRun.loaded());
      assert(loaded.det && loaded.rec.th && loaded.rec.cjk && !loaded.rec.ko && !loaded.rec.latin, "lazy, one script at a time " + JSON.stringify(loaded));
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !q.url.startsWith("data:") && !q.url.startsWith("blob:"));
      assert(!ext.length, "on device only: " + ext.map(x => x.url).join(", "));
      const posts = page.requests.filter(q => q.method && q.method !== "GET");
      assert(!posts.length, "nothing uploaded: " + posts.map(q => q.method + " " + q.url).join(", "));
      const keys = await page.evaluate(() => Object.keys(localStorage).filter(k => !/^lq-(lang|i18n-debug)$/.test(k)));
      assert(!keys.length, "nothing stored without the history opt-in: " + keys);
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("product-check: barcodes via self-hosted zxing-wasm — EAN-13 (check digit, issuer note) and GS1 DataMatrix (GTIN, expiry as printed fact, lot, serial)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, DRAW], isolated: true });
      await page.goto(`${base}/medicine.html?pcbar=zxing`);
      await openTab(page);
      await page.evaluate(() => window.__draw());
      // load the picture without running OCR, then scan only
      await page.evaluate(() => { const s = window.__LQ_PC.st,
        c = document.querySelector("#pcStill"); c.width = window.__ean.width; c.height = window.__ean.height; c.getContext("2d").drawImage(window.__ean, 0,
        0); s.still = true; document.querySelector("#pcCamWrap").hidden = false; });
      await page.evaluate(() => window.__LQ_PC.scan());
      await page.waitFor(`document.querySelector("#pcCodes")`, 60000);
      const e = await results(page);
      assert(/8850006939727/.test(e.codes) && /เลขตรวจสอบถูกต้อง/.test(e.codes) && /885/.test(e.codes) && /GS1 ไทย/.test(e.codes) && /ไม่ได้บอกว่าผลิตที่ประเทศใด/.test(e.codes),
        "EAN-13 card " + e.codes);
      await page.evaluate(() => { const c = document.querySelector("#pcStill"); c.width = window.__dm.width; c.height = window.__dm.height; c.getContext("2d").drawImage(window.__dm, 0, 0); });
      await page.evaluate(() => window.__LQ_PC.scan());
      await page.waitFor(`/LQTEST1/.test((document.querySelector("#pcCodes") || {}).innerText || "")`, 60000);
      const d = await results(page);
      assert(/09501101530003/.test(d.codes) && /2027-01-31/.test(d.codes) && /LQTEST1/.test(d.codes) && /SN42/.test(d.codes), "GS1 fields " + d.codes);
      assert(/ตามที่พิมพ์ในบาร์โค้ด/.test(d.codes) && /ไม่ได้ตรวจกับผู้ผลิต/.test(d.codes), "expiry shown as a printed fact " + d.codes);
      const wasm = page.requests.filter(q => /zxing_reader\.wasm/.test(q.url));
      assert(wasm.length && wasm.every(q => q.url.startsWith(base + "/vendor/zxing/")), "wasm self-hosted " + wasm.map(q => q.url));
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !q.url.startsWith("data:") && !q.url.startsWith("blob:"));
      assert(!ext.length, "no CDN: " + ext.map(x => x.url).join(", "));
      const errs = hardErrors(page, base); assert(!errs.length, "console errors " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("product-check: face gate blocks a face (detector seam), blocks when the model is missing, blocks when the detector cannot run (fails closed)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, DRAW, "window.__faces={frame:[{score:0.91}],crop:[]};window.__LQ_FAKE_FACE=s=>window.__faces[s];"], isolated: true });
      const put = () => page.evaluate(() => { const s = window.__LQ_PC.st, c = document.querySelector("#pcStill"); c.width = 400; c.height = 300; c.getContext("2d").fillRect(0, 0, 400,
        300); s.still = true; s.crop = { x: 50, y: 50, w: 200, h: 150 }; });
      await page.goto(`${base}/medicine.html?fakeface`);
      await put();
      const face = await page.evaluate(() => window.__LQ_PC.faceCheck());
      assert(face.allow === false && face.reason === "face" && face.maxScore >= 0.9, "face in frame blocks " + JSON.stringify(face));
      await page.evaluate(() => { window.__faces = { frame: [], crop: [{ score: 0.35 }] }; });
      const crop = await page.evaluate(() => window.__LQ_PC.faceCheck());
      assert(crop.allow === false && crop.reason === "face", "face in the crop blocks " + JSON.stringify(crop));
      await page.evaluate(() => { window.__faces = { frame: [], crop: [] }; });
      const clean = await page.evaluate(() => window.__LQ_PC.faceCheck());
      assert(clean.allow === true && clean.runs.length === 2, "no face in frame and crop -> allowed " + JSON.stringify(clean));
      await page.goto(`${base}/medicine.html?noface`);
      await put();
      const missing = await page.evaluate(() => window.__LQ_PC.faceCheck());
      assert(missing.allow === false && missing.reason === "model-missing", "missing model blocks " + JSON.stringify(missing));
      await page.goto(`${base}/medicine.html`);
      await put();
      const real = await page.evaluate(() => window.__LQ_PC.faceCheck());
      // fail closed = either the real detector ran on all three views (frame, tiles, crop) or the picture is blocked.
      // (CI's Chrome reports no WebGL at all and MediaPipe still runs there, so WebGL is not the switch to test.)
      const ran = real.allow === true && real.runs.length === 3 && real.runs.every(r => Array.isArray(r.faces));
      const blocked = real.allow === false && ["error", "model-missing"].includes(real.reason);
      assert(ran || blocked, "real detector: ran on frame + tiles + crop, or blocked " + JSON.stringify(real));
      const fetched = page.requests.filter(q => /face-gate\/blaze_face_short_range\.tflite/.test(q.url));
      assert(fetched.length >= 1 && fetched.every(q => q.url.startsWith(base)), "BlazeFace model self-hosted " + fetched.map(q => q.url));
      await page.close();
      // the detector cannot run (WebAssembly removed from the page) -> must block, on every machine
      const NO_WASM = "try{Object.defineProperty(window,'WebAssembly',{value:undefined,configurable:true})}catch(e){}";
      const page2 = await browser.newPage(null, { initScripts: [INIT, DRAW, NO_WASM], isolated: true });
      await page2.goto(`${base}/medicine.html`);
      await page2.evaluate(() => { const s = window.__LQ_PC.st, c = document.querySelector("#pcStill"); c.width = 400; c.height = 300; c.getContext("2d").fillRect(0, 0, 400, 300);
        s.still = true; s.crop = { x: 50, y: 50, w: 200, h: 150 }; });
      const broken = await page2.evaluate(() => window.__LQ_PC.faceCheck());
      assert(broken.allow === false && ["error", "model-missing"].includes(broken.reason), "detector cannot run -> blocked " + JSON.stringify(broken));
      await page2.close();
    });

    await check("product-check: history opt-in ON stores only number norms, GTINs and country codes — never the OCR text or an image; emergency wording opens the emergency card", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, DRAW], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await page.evaluate(() => document.querySelector("#mdHist").click());
      await openTab(page);
      await page.evaluate(() => window.__draw());
      await page.evaluate(() => window.__LQ_PC.setImage(window.__label));
      await page.waitFor(`document.querySelector("#pcRegs")`, 120000);
      // a barcode as well, so the GTIN path is covered
      await page.evaluate(() => { window.__LQ_PC.st.codes = { engine: "test", codes: [{ rawValue: "8850006939727", format: "ean_13" }] }; window.__LQ_PC.reparse(); });
      const r = await page.evaluate(() => {
        const rows = JSON.parse(localStorage.getItem("lq-med-history") || "[]"), text = window.__LQ_PC.st.text;
        const regs = window.LQPC.findRegNumbers(text);
        return { rows, text, norms: regs.map(x => x.norm), countries: [...new Set(regs.map(x => x.country))], keys: Object.keys(localStorage) };
      });
      const pc = r.rows.filter(x => x.kind === "pc");
      assert(pc.length >= 1, "a history row was written with the opt-in on " + JSON.stringify(r.rows));
      const row = pc[0], allowed = new Set([...r.norms, "8850006939727"]);
      assert(Object.keys(row).sort().join() === "at,kind,q,r", "row fields " + Object.keys(row));
      assert(row.q.split(" · ").every(p => allowed.has(p)) && row.q.includes("1A 15/50") && row.q.includes("8850006939727"), "q holds only norms + GTINs: " + row.q);
      assert(row.r.split(", ").every(c => r.countries.includes(c)), "r holds only country codes: " + row.r);
      const stored = await page.evaluate(() => Object.keys(localStorage).map(k => k + "=" + localStorage.getItem(k)).join("\n"));
      for (const word of ["ยาแก้ปวด", "ลดไข้", "感冒灵颗粒", "Reg. No"]) assert(!stored.includes(word), "OCR text stored: " + word);
      assert(!/data:image|base64/i.test(stored), "no image in storage");
      await privacyScan(page);
      // emergency wording in the (edited) OCR text opens the same emergency card as the Box / label tab, and is not stored
      const before = (await page.evaluate(() => localStorage.getItem("lq-med-history"))) || "";
      await page.evaluate(() => { document.querySelector("#pcText").value = "ลูกกินยาไปทั้งแผง 1A 15/50"; document.querySelector("#pcReparse").click(); });
      const em = await page.evaluate(() => ({ shown: !document.querySelector("#mdEmerg").hidden, hist: localStorage.getItem("lq-med-history") || "" }));
      assert(em.shown, "emergency card opened from the Product check text");
      assert(em.hist === before, "emergency wording is never stored");
      await page.close();
    });

    await check("product-check: a GS1 expiry before today's LOCAL date shows a risk signal with a next step; today / future show none", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await openTab(page);
      const show = iso => page.evaluate(iso => {
        const yy = iso.slice(2, 4) + iso.slice(5, 7) + iso.slice(8, 10);
        Object.assign(window.__LQ_PC.st, { codes: { engine: "test", codes: [{ rawValue: "(01)09501101530003(17)" + yy, format: "data_matrix" }] }, text: "", read: true });
        window.__LQ_PC.reparse();
        const sig = document.querySelector("#pcCodes [data-signal=expiry-past]");
        return sig ? sig.textContent : "";
      }, iso);
      const d = await page.evaluate(() => { const f = n => { const t = new Date(); t.setDate(t.getDate() + n); return window.LQPC.localDate(t); }; return { past: f(-1), today: f(0),
        future: f(30) }; });
      const past = await show(d.past);
      assert(/ดูเหมือนผ่านมาแล้ว/.test(past) && /ถามเภสัชกร/.test(past), "past -> risk signal with next step: " + past);
      assert(!(await show(d.today)), "today is not past");
      assert(!(await show(d.future)), "future is not past");
      await page.close();
    });

    await check("product-check: English and 中文 leave no Thai outside lang=th / translate=no content (with results open); Thai restored", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, DRAW], isolated: true });
      for (const lang of ["en", "zh"]) {
        await page.goto(`${base}/medicine.html?lang=${lang}&pcbar=zxing`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await openTab(page);
        await page.evaluate(() => window.__draw());
        await page.evaluate(() => window.__LQ_PC.setImage(window.__label));
        await page.waitFor(`document.querySelector("#pcCant")`, 120000);
        await page.evaluate(() => { document.querySelector("#pcText").value = "ฆท. 1020/2564 MAL19990123AZ 1A 15/50"; document.querySelector("#pcReparse").click(); });
        const c = await coverage(page);
        assert(c.pct === 0, `${lang}: Thai left ${c.pct}% ${JSON.stringify(c.top)}`);
        const bottom = await page.evaluate(() => document.querySelector("#tab-pc .pc-bottom").innerText);
        assert(lang === "en" ? /Not a definitive identification\. Confirm with a pharmacist/.test(bottom) : /不是最终鉴定结果/.test(bottom), lang + " bottom line " + bottom);
      }
      await page.goto(`${base}/medicine.html?lang=th`);
      await page.waitFor(`window.LQI18N && LQI18N.lang === "th"`, 8000);
      assert(await page.evaluate(() => /[ก-๙]/.test(document.querySelector("#t-pc").textContent)), "Thai restored");
      await page.close();
    });

    await check("product-check: phone 320 / 360 / 390 px — no overflow, 44 px targets, text >= 12 px (empty tab and with results open)", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, DRAW], isolated: true });
      await page.goto(`${base}/medicine.html?pcbar=zxing`);
      await openTab(page);
      for (const r of await phone(page, null)) {
        assert(r.sw <= r.cw, `@${r.w} overflow ${r.sw}>${r.cw}`);
        assert(!r.bad.length, `@${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
        assert(!r.tiny.length, `@${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
      }
      await page.evaluate(() => window.__draw());
      await page.evaluate(() => window.__LQ_PC.setImage(window.__label));
      await page.waitFor(`document.querySelector("#pcCant")`, 120000);
      await page.evaluate(() => { document.querySelector("#pcText").value = "1A 15/50 10-1-12345-1-0001 MAL19990123AZ NDC 0603-5892-21"; document.querySelector("#pcReparse").click(); });
      for (const r of await phone(page, null)) {
        assert(r.sw <= r.cw, `results @${r.w} overflow ${r.sw}>${r.cw}`);
        assert(!r.bad.length, `results @${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
        assert(!r.tiny.length, `results @${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
      }
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
