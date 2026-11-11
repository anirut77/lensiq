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
// AMENDMENT 2026-11-11 (owner decision: release as "experimental"; stricter, re-locked):
//   6. type first: with no product type chosen, tapping check runs NOTHING (no card, a "choose the type" message); a
//      type guessed from the words is only a suggestion that the user must confirm, and the card then says "chosen";
//   7. an "experimental" badge and the generated accuracy line (independent test, 246 / 135, 64 %, 1.5 per 100, source)
//      are on the advert panel in TH / EN / ZH;
//   8. no signal: exactly the owner's sentence, no tick; a Chinese advert shows "limited support"; the photo path also
//      waits for the type.
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
// AMENDMENT 2026-11-11: a check only runs with a product type chosen, so the shared helper always chooses one
async function paste(page, text, cat = "cosmetic") {
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
      await page.waitFor(`document.querySelector("#pcAdText").value.length > 0`, 8000);
      const box = await page.evaluate(() => document.querySelector("#pcAdText").value);
      assert(box === AD, "the read text is in the advert box, editable: " + box);
      // AMENDMENT: no check before a type is chosen, also on the photo path
      assert(await page.evaluate(() => !document.querySelector("#pcAdCard") && !!document.querySelector("#pcAdOut [data-need-type]")),
        "photo path waits for the product type");
      await page.evaluate(() => { const sel = document.querySelector("#pcAdCat"); sel.value = "cosmetic"; sel.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.waitFor(`document.querySelector("#pcAdCard")`, 8000);
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

    await check("pc-advert AMENDMENT: type first — no type, no check; a guessed type is only a suggestion the user confirms", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT, SPY], isolated: true });
      await page.goto(`${base}/medicine.html`);
      await openTab(page);
      await pick(page, "ad");
      assert(await page.evaluate(() => document.querySelector("#pcAdCat").value === ""), "no type chosen by default");
      await page.evaluate(t => { document.querySelector("#pcAdText").value = t; document.querySelector("#pcAdGo").click(); }, AD);
      await page.waitFor(`document.querySelector("#pcAdOut [data-need-type]")`, 8000);
      const st = await page.evaluate(() => ({ card: !!document.querySelector("#pcAdCard"), last: window.__LQ_PCA.st.last,
        msg: document.querySelector("#pcAdOut [data-need-type]").innerText, sug: document.querySelector("#pcAdUseGuess") && document.querySelector("#pcAdUseGuess").dataset.cat }));
      assert(!st.card && !st.last, "nothing checked before a type is chosen");
      assert(/เลือกประเภทสินค้า/.test(st.msg), "asks for the type: " + st.msg);
      assert(st.sug === "cosmetic", "the guess is offered as a suggestion only: " + st.sug);
      await page.evaluate(() => document.querySelector("#pcAdUseGuess").click());
      await page.waitFor(`document.querySelector("#pcAdCard")`, 8000);
      const c = await page.evaluate(() => ({ sel: document.querySelector("#pcAdCat").value, chosen: !!document.querySelector("#pcAdCard [data-cat]"),
        guess: !!document.querySelector("#pcAdCard [data-guess], #pcAdCard [data-all-families]") }));
      assert(c.sel === "cosmetic" && c.chosen && !c.guess, "after confirming, the card says the type was chosen " + JSON.stringify(c));
      // a text with no type cue: no suggestion, still nothing runs
      await page.evaluate(() => { const sel = document.querySelector("#pcAdCat"); sel.value = ""; sel.dispatchEvent(new Event("change", { bubbles: true }));
        document.querySelector("#pcAdText").value = "สินค้านี้ รักษาเบาหวานหายขาด"; document.querySelector("#pcAdGo").click(); });
      await page.waitFor(`document.querySelector("#pcAdOut [data-need-type]")`, 8000);
      assert(await page.evaluate(() => !document.querySelector("#pcAdCard") && !document.querySelector("#pcAdUseGuess")), "no type, no cue -> no card, no suggestion");
      assert((await page.evaluate(() => window.__net.length)) === 0, "still no request");
      await page.close();
    });

    await check("pc-advert AMENDMENT: experimental badge + generated accuracy line on the panel; exact no-signal sentence; Chinese 'limited support' (TH / EN / ZH)", async () => {
      const { loadFigures, expand } = await import("../../tools/accuracy-sync.mjs");
      const rows = Object.fromEntries(expand(loadFigures()).map(r => [r.key, r]));
      const EXP = { th: "ทดลอง", en: "Experimental", zh: "实验" };
      const LIMITED = { th: "รองรับแบบจำกัด", en: "Limited support", zh: "支持有限" };
      const page = await browser.newPage(null, { initScripts: [INIT], isolated: true });
      for (const lang of ["th", "en", "zh"]) {
        await page.goto(`${base}/medicine.html?lang=${lang}`);
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 8000);
        await openTab(page);
        await pick(page, "ad");
        const panel = await page.evaluate(() => ({ badge: (document.querySelector("#pcAdPanel .md-badge[data-exp]") || {}).innerText || "",
          acc: (document.querySelector('#pcAdPanel [data-i18n="md.pc.ad.acc"]') || {}).innerText || "" }));
        assert(panel.badge.includes(EXP[lang]), `${lang} experimental badge: ${panel.badge}`);
        assert(panel.acc.replace(/\s+/g, " ").trim() === rows["md.pc.ad.acc"][lang].replace(/\s+/g, " ").trim(), `${lang} accuracy line = generated: ${panel.acc}`);
        await paste(page, "สินค้าดีมาก ส่งไว", "food");
        const none = await page.evaluate(() => { const p = document.querySelector("#pcAdCard [data-none]"); return { t: p ? p.innerText : "", html: document.querySelector("#pcAdCard").innerHTML }; });
        assert(none.t.trim() === rows["md.pc.ad.none"][lang], `${lang} exact no-signal sentence: ${none.t}`);
        assert(!/✓|✔|✅|☑|data-kind="ok"|no problem|ไม่มีปัญหา|没有问题/i.test(none.html), lang + " no tick / no 'no problem'");
        await paste(page, "本品三天根治糖尿病，无副作用 美白", "supplement");
        await page.waitFor(`document.querySelector("#pcAdCard [data-limited]")`, 8000);
        const lim = await page.evaluate(() => document.querySelector("#pcAdCard [data-limited]").innerText);
        assert(lim.includes(LIMITED[lang]), `${lang} limited support: ${lim}`);
        if (lang !== "th") { const c = await coverage(page); assert(c.pct === 0, `${lang}: Thai left ${c.pct}% ${JSON.stringify(c.top)}`); }
      }
      await page.close();
    });
  } finally { await browser.close(); }
}
