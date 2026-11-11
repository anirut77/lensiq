// tests/e2e/product-check-advert.e2e.mjs — medicine.html "Product check": the "advert / post / leaflet" capture type
// (approved item 4, adverts option B: on-device rules only, docs/product-check/ADVERT-CAPTURE-PROPOSAL.md §8). FIXED SET,
// written and locked (sha256 in ~/LENSIQ-field/evals/adverts/locked.sha256) BEFORE the capture type was wired:
//   1. paste path: the user picks "advert", pastes text, taps check -> the on-device card (kind "ad"); a CDP network spy
//      and a fetch spy see NO request of any kind from the moment the advert type is chosen; no label lookup card, no
//      AI step; the card never names the seller (shop, page, handle, LINE ID, phone, URL) and has no verdict word;
//      nothing about the advert is stored;
//   2. photo path: the OCR text of an advert capture goes to the advert card (editable box), never to the label
//      lookup / AI card, and no request is made;
//   3. back to "label": the label flow is unchanged (the lookup card comes back), the advert card is cleared;
//   4. English / 中文: no Thai left outside translate="no" content with the advert card open;
//   5. phones 320 / 360 / 390 px: no overflow, 44 px targets, text >= 12 px with the advert card open.
// Synthetic advert text only (invented shop, handle and phone); the picture is generated noise.
import { assert } from "./cdp.mjs";
import { coverage, phone } from "./gate.e2e.mjs";

const INIT = "window.confirm=()=>true;window.print=()=>{};window.__LQ_FAKE_FACE=s=>(window.__faces||{})[s]||[];";
// every fetch the page makes is recorded (the advert flow must make none)
const SPY = "window.__net=[];(function(){const f=window.fetch.bind(window);window.fetch=(u,i)=>{window.__net.push(String(u&&u.url||u));return f(u,i);};})();";
const AD = "ร้านสวยใสช็อปสาธิต\nครีมขาวไว ใน 7 วัน รักษาสิวหายขาด\nแอดไลน์ @suayshopdemo โทร 081-234-5678\nสั่งเลย https://shop.example.invalid/p/42";
const SELLER = /สวยใสช็อปสาธิต|suayshopdemo|081-234-5678|example\.invalid/i;
const BAN = /illegal|unlawful|fake|counterfeit|scam|fraud|ผิดกฎหมาย|ปลอม|หลอกลวง|ฉ้อโกง|违法|违反|假冒|假货|诈骗|欺诈/i;
const LABEL = "TESTOL 500 mg\nเลขทะเบียน 1A 844/39\nรักษาหายขาด 100% ไม่มีผลข้างเคียง";
const PICTURE = () => {
  const s = window.__LQ_PC.st, c = document.querySelector("#pcStill"), x = c.getContext("2d"); c.width = 400; c.height = 300;
  const im = x.createImageData(400, 300); let v = 4242;
  for (let i = 0; i < im.data.length; i += 4) { for (let k = 0; k < 3; k++) { v = (v * 1103515245 + 12345) >>> 0; im.data[i + k] = v >>> 24; } im.data[i + 3] = 255; }
  x.putImageData(im, 0, 0); s.still = true; s.crop = { x: 50, y: 50, w: 300, h: 200 }; document.querySelector("#pcCamWrap").hidden = false; window.__faces = {};
};
const openTab = page => page.evaluate(() => { document.querySelector("#t-pc").click(); return !document.querySelector("#tab-pc").hidden; });
const pick = (page, kind) => page.evaluate(k => { const r = document.querySelector(`input[name=pcKind][value=${k}]`); r.click(); return r.checked; }, kind);
async function paste(page, text, cat = "") {
  await page.evaluate((t, c) => {
    const ta = document.querySelector("#pcAdText"); ta.value = t; ta.dispatchEvent(new Event("input", { bubbles: true }));
    const sel = document.querySelector("#pcAdCat"); sel.value = c; sel.dispatchEvent(new Event("change", { bubbles: true }));
    document.querySelector("#pcAdGo").click();
  }, text, cat);
  await page.waitFor(`document.querySelector("#pcAdCard")`, 8000);
}
const cardInfo = page => page.evaluate(() => {
  const c = document.querySelector("#pcAdCard");
  return { text: c.innerText, html: c.innerHTML, rules: [...c.querySelectorAll("li[data-rule]")].map(l => l.dataset.rule), kind: c.dataset.kind,
    last: window.__LQ_PCA && window.__LQ_PCA.st.last ? { kind: window.__LQ_PCA.st.last.kind, sent: window.__LQ_PCA.st.last.sent } : null,
    slot: document.querySelector("#pcClaimsSlot").innerHTML, ai: !!document.querySelector("#pcAiGo"), lookup: !!document.querySelector("#pcLookup") };
});

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("pc-advert: paste -> on-device card (kind ad); NO request of any kind; no lookup / AI; no seller name; no verdict; nothing stored", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SPY], isolated: true });
      await page.goto(`${base}/medicine.html`);
      assert(await openTab(page), "tab opens");
      assert(await page.evaluate(() => document.querySelector("input[name=pcKind][value=label]").checked), "label is the default capture type");
      assert(await page.evaluate(() => document.querySelector("#pcAdPanel").hidden), "advert panel hidden by default");
      const reqBefore = page.requests.length, netBefore = await page.evaluate(() => window.__net.length);
      assert(await pick(page, "ad"), "advert type chosen");
      assert(await page.evaluate(() => !document.querySelector("#pcAdPanel").hidden), "advert panel shown");
      const note = await page.evaluate(() => document.querySelector("#pcAdPanel").innerText);
      assert(/ไม่ส่ง/.test(note) && /ผู้ขาย/.test(note), "the panel says nothing is sent and the result is not about a seller: " + note);
      await paste(page, AD);
      const c = await cardInfo(page);
      assert(c.kind === "ad" && c.last && c.last.kind === "ad" && c.last.sent === false, "kind ad, not sent " + JSON.stringify(c.last));
      assert(c.rules.length >= 1, "risk signals shown " + c.rules);
      assert(!SELLER.test(c.text) && !SELLER.test(c.html), "the card never names the seller: " + c.text);
      assert(!BAN.test(c.text), "no verdict word: " + c.text);
      assert(/สัญญาณเสี่ยง/.test(c.text) && /ไม่ใช่คำตัดสินทางกฎหมาย/.test(c.text), "risk signal wording, not a legal finding");
      assert(c.slot === "" && !c.ai && !c.lookup, "no label lookup card and no AI step for an advert");
      await new Promise(r => setTimeout(r, 400));
      const reqs = page.requests.slice(reqBefore).filter(q => !/^(data|blob):/.test(q.url));
      assert(!reqs.length, "no request after choosing the advert type: " + reqs.map(q => q.url).join(", "));
      assert((await page.evaluate(() => window.__net.length)) === netBefore, "no fetch call");
      const stored = await page.evaluate(() => JSON.stringify(Object.assign({}, localStorage)) + JSON.stringify(Object.assign({}, sessionStorage)));
      assert(!/สวยใส|suayshop|รักษาสิว|ขาวไว/.test(stored), "nothing about the advert is stored: " + stored.slice(0, 200));
      assert(!(await page.evaluate(() => document.querySelector("#pcAdCard button, #pcAdCard form"))), "no share / report controls on the card");
      await page.close();
    });

    await check("pc-advert: photo path — the OCR text of an advert capture goes to the advert card, never to the label lookup / AI; no request", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SPY], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await pick(page, "ad");
      const reqBefore = page.requests.length;
      await page.evaluate(PICTURE);
      await page.evaluate(t => { const s = window.__LQ_PC.st; s.ocr = { text: t, lines: t.split("\n"), script: "th", ms: { total: 1 } }; s.text = t; s.read = true;
        window.__LQ_PC.reparse(); }, AD);
      await page.waitFor(`document.querySelector("#pcAdCard")`, 8000);
      const box = await page.evaluate(() => document.querySelector("#pcAdText").value);
      assert(box === AD, "the read text is in the advert box, editable: " + box);
      const c = await cardInfo(page);
      assert(c.kind === "ad" && c.rules.length >= 1 && !SELLER.test(c.text), "advert card from the photo text " + c.text);
      assert(c.slot === "" && !c.ai && !c.lookup, "no label lookup card and no AI step");
      await new Promise(r => setTimeout(r, 400));
      const reqs = page.requests.slice(reqBefore).filter(q => !/^(data|blob):/.test(q.url));
      assert(!reqs.length, "no request: " + reqs.map(q => q.url).join(", "));
      await page.close();
    });

    await check("pc-advert: back to 'label' — the label flow is unchanged (lookup card back), the advert card is cleared", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html?fakeface`);
      await openTab(page);
      await pick(page, "ad");
      await paste(page, AD);
      assert(await pick(page, "label"), "label chosen again");
      assert(await page.evaluate(() => document.querySelector("#pcAdPanel").hidden && !document.querySelector("#pcAdCard")), "advert panel hidden and card cleared");
      await page.evaluate(PICTURE);
      await page.evaluate(t => { const s = window.__LQ_PC.st; s.ocr = { text: t, lines: t.split("\n"), script: "th", ms: { total: 1 } }; s.text = t; s.read = true;
        const b = document.querySelector("#pcText"); if (b) b.value = t; window.__LQ_PC.reparse(); }, LABEL);
      await page.waitFor(`document.querySelector("#pcLookup") && document.querySelector("#pcText")`, 15000);
      assert(await page.evaluate(() => document.querySelectorAll("#pcClaims li[data-rule]").length >= 1), "label risk signals as before");
      await page.close();
    });

    await check("pc-advert: English and 中文 — no Thai left outside translate=no content with the advert card open", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      for (const lang of ["en", "zh"]) {
        await page.goto(`${base}/medicine.html?lang=${lang}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await openTab(page);
        await pick(page, "ad");
        await paste(page, AD);
        const c = await coverage(page);
        assert(c.pct === 0, `${lang}: Thai left ${c.pct}% ${JSON.stringify(c.top)}`);
        const t = await page.evaluate(() => document.querySelector("#pcAdCard").innerText);
        assert(lang === "en" ? /risk signal/i.test(t) && /not a legal finding/i.test(t) : /风险信号/.test(t) && /不是法律结论/.test(t), lang + " " + t);
        assert(!SELLER.test(t) && !BAN.test(t), lang + " seller / verdict " + t);
      }
      await page.close();
    });

    await check("pc-advert: phone 320 / 360 / 390 px — no overflow, 44 px targets, text >= 12 px with the advert card open", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await openTab(page);
      await pick(page, "ad");
      await paste(page, AD);
      for (const r of await phone(page, null)) {
        assert(r.sw <= r.cw, `@${r.w} overflow ${r.sw}>${r.cw}`);
        assert(!r.bad.length, `@${r.w} small targets: ${r.bad.slice(0, 8).join(" | ")}`);
        assert(!r.tiny.length, `@${r.w} tiny text: ${r.tiny.slice(0, 8).join(" | ")}`);
      }
      await page.close();
    });
  } finally { await browser.close(); }
}
