// tests/e2e/seller-doc-narrow.e2e.mjs — seller documents on a phone (owner night order A3, 2026-11-20): at 320 px the
// largest amount ran 15–25 px past the screen (noted at the decision 192 review), and the seller's default document
// language (owner decision 199 ข: Thai + English, behind the Worker switch SELLER_DOC_LANG). FIXED TEST SET, hash-locked in
// evals-locks/seller-docs.sha256 (~/LENSIQ-field/evals/seller-docs/) BEFORE the fix. Synthetic data only.
//   1. the REAL renderDoc (backend/src/seller.js) on screen at 320 / 360 / 390 px, for quotation / invoice / receipt and
//      each language set (th, th-en, th-en-zh), with the largest amounts the product allows (100000 x the highest pilot
//      price, VAT on) and seller / buyer texts at the product's length limits: no horizontal scroll, no element past the
//      right edge, no table cell whose content is cut, and every amount on screen
//   2. the admin seller tab against the REAL Worker code (in-memory D1): with SELLER_DOC_LANG off the default-language
//      control is not shown; switched on it shows Thai + English as the default; the previewed draft has no Chinese
//   3. the tab with the document preview open fits at 320 / 360 / 390 px in TH, EN and 中文 (the page and the document
//      inside the preview frame); EN / ZH carry no Thai
//   4. the owner sets "Thai only" (password + 6-digit code); the next draft has no English labels
import { assert } from "./cdp.mjs";
import { mobileCheck, sleep } from "./zones-lib.mjs";
import { startWorker, TOKEN, PW } from "./admin-setup.e2e.mjs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const THAI = /[ก-ฺเ-๛]/;
const HAN = /[㐀-鿿]/;
const WIDTHS = [320, 360, 390];
const fit = (s, n) => { let o = ""; while (o.length < n) o += s; return o.slice(0, n); };
const SELLER_NAME = fit("บริษัท ทดสอบสังเคราะห์ระบบจัดหน้าเอกสารบนโทรศัพท์ จำกัด Synthetic Narrow Layout Test Co., Ltd. ", 160);
const SELLER_ADDR = fit("อาคารทดสอบสังเคราะห์ ชั้นทดสอบ ถนนทดสอบ แขวงทดสอบ เขตทดสอบ จังหวัดทดสอบ Synthetic Test Tower ", 300);
const BUYER_NAME = fit("ห้างหุ้นส่วนจำกัด ลูกค้าทดสอบสังเคราะห์ Synthetic Narrow Buyer Limited Partnership ", 160);
const BUYER_ADDR = fit("ซอยลูกค้าทดสอบ ถนนลูกค้าทดสอบ ตำบลทดสอบ อำเภอทดสอบ จังหวัดทดสอบ Synthetic Buyer Place ", 300);

function noErrors(page) {
  const errs = page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && /\/admin\/api\//.test(e.url || "") && /status of 4(00|01|03|09)\b/.test(e.text || "")));
  assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
}

/** overflow report of the current document (or of the document inside an iframe when frameSel is given) */
const OVERFLOW = frameSel => `(() => {
  const doc = ${frameSel ? `document.querySelector(${JSON.stringify(frameSel)}).contentDocument` : "document"};
  const de = doc.documentElement, W = de.clientWidth, out = [];
  if (de.scrollWidth > W) out.push("scrollWidth " + de.scrollWidth + " > " + W);
  for (const el of doc.body.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > W + 0.5 || r.left < -0.5) out.push(el.tagName + "." + el.className + " '" + (el.textContent || "").trim().slice(0, 30) + "' " + Math.round(r.left) + ".." + Math.round(r.right) + " / " + W);
  }
  for (const c of doc.querySelectorAll("th, td")) if (c.scrollWidth > c.clientWidth + 1) out.push("cut " + c.tagName + " '" + c.textContent.trim().slice(0, 30) + "' " + c.scrollWidth + " > " + c.clientWidth);
  return out.slice(0, 6);
})()`;

export default async function ({ launch, check, repo }) {
  const imp = p => import(pathToFileURL(join(repo, p)).href);
  const seller = await imp("backend/src/seller.js");
  const { PRICE_LINES } = await imp("backend/src/price-list.js");
  const { baht } = await imp("backend/src/receipt.js");
  const top = PRICE_LINES.slice().sort((a, b) => b.pilot_satang - a.pilot_satang);
  const S = { legal_name: SELLER_NAME, tax_id: "0000000000000", address: SELLER_ADDR, branch: "สาขาทดสอบสังเคราะห์ที่ 00001",
    bank_name: "ธนาคารทดสอบสังเคราะห์", bank_account_name: SELLER_NAME.slice(0, 120), bank_account_no: "00011122233344455566",
    contact_phone: "+020000000000000", contact_email: "billing.department.long.address@seller-synthetic.example", contact_line: "@sellertestnarrowlayout" };
  const doc = (type, langs, n) => {
    const lines = top.slice(0, n).map(p => ({ id: p.id, name_th: p.name_th, name_en: p.name_en, name_zh: p.name_zh, unit_th: p.unit_th, unit_en: p.unit_en,
      unit_zh: p.unit_zh, min_satang: p.min_satang || 0, qty: 100000, unit_satang: p.pilot_satang, amount_satang: 100000 * p.pilot_satang,
      regular_th: p.regular_th, regular_en: p.regular_en, regular_zh: p.regular_zh }));
    const subtotal = lines.reduce((a, l) => a + l.amount_satang, 0), vat = Math.round(subtotal * 0.07);
    return { doc_type: type, status: "issued", number: "TSNARROW-" + type.slice(0, 2).toUpperCase() + "-000001", created_at: 1763500000, issued_at: 1763500000,
      buyer: { name: BUYER_NAME, address: BUYER_ADDR, tax_id: "0000000000001", branch: "สำนักงานใหญ่" }, langs,
      lines, missing_seller_fields: [], seller: S, vat_registered: true, vat_rate_bp: 700, vat_satang: vat, subtotal_satang: subtotal, total_satang: subtotal + vat,
      extra: { ...(type === "quotation" ? { valid_days: 30 } : type === "invoice" ? { due_days: 15 } : { paid_on: "2026-11-20" }), ref: fit("REF-NARROW-", 80) } };
  };

  const browser = await launch();
  const W = await startWorker(repo, { vars: { SELLER_DOC_LANG: "off" }, deps: { fetch: async () => { throw new Error("no network"); } } });
  const page = await browser.newPage(null, { isolated: true });
  try {
    await check("documents at 320 / 360 / 390 px: largest amounts, every type and language set, nothing past the screen, every amount shown", async () => {
      const p = await browser.newPage(null, { isolated: true });
      try {
        const bad = [];
        for (const type of ["quotation", "invoice", "receipt"]) for (const langs of ["th", "th-en", "th-en-zh"]) for (const n of [1, 3]) {
          const d = doc(type, langs, n);
          const html = seller.renderDoc(d);
          for (const width of WIDTHS) {
            await p.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
            await p.goto("about:blank");
            const { frameTree } = await p.send("Page.getFrameTree");
            await p.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
            await sleep(150);
            const over = await p.evaluate(OVERFLOW(null));
            if (over.length) bad.push(`${type} ${langs} ${n} line(s) @${width}: ${over.join(" | ")}`);
            const text = (await p.evaluate("document.body.innerText")).replace(/\s+/g, "");
            const want = [d.subtotal_satang, d.vat_satang, d.total_satang, ...d.lines.flatMap(l => [l.unit_satang, l.amount_satang])].map(baht);
            for (const w of want) if (!text.includes(w.replace(/\s+/g, ""))) bad.push(`${type} ${langs} @${width}: amount ${w} not shown`);
          }
        }
        assert(!bad.length, bad.length + " problem(s): " + bad.slice(0, 6).join(" || "));
      } finally { await p.close(); }
    });

    const reauth = async () => {
    await W.env.DB.prepare("UPDATE admin_users SET totp_last_step = 0").run();
    const code = await W.totp(page.secret);
    await page.waitFor("!!document.querySelector('dialog.ad-reauth[open]')", 6000);
    await page.evaluate((pw, c) => {
      const d = document.querySelector("dialog.ad-reauth[open]");
      const ins = d.querySelectorAll("input");
      ins[0].value = pw; ins[1].value = c;
      d.querySelector("button[value=ok]").click();
    }, PW, code);
  };
  const openSeller = async () => {
    await page.evaluate(() => document.querySelector("[data-tab=leads]").click());
    await sleep(200);
    await page.evaluate(() => document.querySelector("[data-tab=seller]").click());
    await page.waitFor("!!document.getElementById('adsState').textContent", 8000);
    await sleep(400);
  };
  const preview = async () => {
    const n0 = await page.evaluate("document.querySelectorAll('#adsDocs [data-doc]').length");
    await page.evaluate(() => {
      const f = document.getElementById("adsDocForm");
      f.elements.doc_type.value = "quotation"; f.elements.buyer_name.value = "Narrow Buyer Co."; f.elements.buyer_address.value = "Synthetic buyer address";
      f.elements.line_id.value = "attendance_setup"; f.elements.line_qty.value = "100000";
      f.requestSubmit();
    });
    await page.waitFor(`document.querySelectorAll('#adsDocs [data-doc]').length === ${n0 + 1}`, 8000);
    await page.evaluate(() => { document.getElementById("adsPreview").srcdoc = ""; document.querySelector("#adsDocs [data-doc] [data-act=preview]").click(); });
    await page.waitFor("/310,300,000\\.00/.test(document.getElementById('adsPreview').srcdoc || '')", 8000);
    await sleep(400);
    return page.evaluate("document.getElementById('adsPreview').srcdoc.replace(/<style[\\s\\S]*?<\\/style>/g, ' ').replace(/<[^>]+>/g, ' ')");
  };
  const narrow = async label => {
    await mobileCheck(page);
    for (const width of WIDTHS) {
      await page.send("Emulation.setDeviceMetricsOverride", { width, height: 800, deviceScaleFactor: 2, mobile: true });
      await sleep(300);
      const inner = await page.evaluate(OVERFLOW("#adsPreview"));
      assert(!inner.length, `${label} @${width}: the document inside the preview overflows: ${inner.join(" | ")}`);
    }
    await page.send("Emulation.clearDeviceMetricsOverride");
  };
    await check("admin seller tab: switch off = no language control; switched on = Thai + English by default, the preview has no Chinese", async () => {
      await page.goto(W.origin + "/admin");
      await page.waitFor("!document.getElementById('adBoot').hidden", 8000);
      await page.evaluate((t, pw) => {
        const f = document.getElementById("adBootForm");
        f.token.value = t; f.username.value = "owner"; f.password.value = pw; f.password2.value = pw; f.requestSubmit();
      }, TOKEN, PW);
      await page.waitFor("!!document.getElementById('adTwoKey').getAttribute('data-raw')", 15000);
      page.secret = await page.evaluate(() => document.getElementById("adTwoKey").getAttribute("data-raw"));
      await page.evaluate(c => { const f = document.getElementById("adTwoForm"); f.code.value = c; f.requestSubmit(); }, await W.totp(page.secret));
      await page.waitFor("!document.getElementById('adCodes').hidden", 10000);
      await page.evaluate(() => { document.getElementById("adCodesOk").click(); document.getElementById("adCodesDone").click(); });
      await page.waitFor("!document.getElementById('adApp').hidden", 8000);
      await openSeller();
      assert(await page.evaluate("!!document.getElementById('adsLangRow') && document.getElementById('adsLangRow').hidden"), "switch off: the control is hidden");
      await W.env.DB.prepare("UPDATE seller_profile SET legal_name = ?1, tax_id = '0000000000000', address = ?2, vat_registered = 1, vat_rate_bp = 700, " +
        "bank_name = 'Test Bank', bank_account_name = 'Narrow Test', bank_account_no = '0001112223', contact_email = 'billing@seller.example', doc_prefix = 'TS' WHERE id = 1")
        .bind(SELLER_NAME, SELLER_ADDR).run();
      W.env.SELLER_DOC_LANG = "on";
      await openSeller();
      const row = await page.evaluate(() => { const r = document.getElementById("adsLangRow"); return { hidden: r.hidden, value: r.querySelector("select").value, text: r.innerText }; });
      assert(!row.hidden, "switch on: the control is shown");
      assert(row.value === "th-en", "default Thai + English: " + row.value);
      const t = await preview();
      assert(/Quotation/.test(t) && /ใบเสนอราคา/.test(t), "TH + EN labels");
      assert(!HAN.test(t), "no Chinese in a Thai + English document: " + (t.match(/.{0,20}[㐀-鿿].{0,20}/) || [])[0]);
      noErrors(page);
    });

    await check("phones 320 / 360 / 390 in TH, English and 中文: the tab and the document in the preview fit; EN / ZH carry no Thai", async () => {
      await narrow("th");
      for (const l of ["en", "zh"]) {
        await page.evaluate(l => { const s = document.getElementById("adLang"); s.value = l; s.dispatchEvent(new Event("change")); }, l);
        await page.waitFor(`window.LQI18N.lang === ${JSON.stringify(l)}`, 8000);
        await sleep(400);
        const t = await page.evaluate(() => {
          const p = document.querySelector('[data-panel="seller"]').cloneNode(true);
          p.querySelectorAll("[data-user-value], iframe").forEach(x => x.remove());
          return p.innerText + "\n" + [...p.querySelectorAll("option")].map(o => o.textContent).join("\n") + "\n" +
            [...p.querySelectorAll("input, select, button")].map(x => (x.placeholder || "") + " " + (x.getAttribute("aria-label") || "")).join("\n");
        });
        assert(!THAI.test(t), l + ": Thai left: " + (t.match(/[^\n]*[ก-ฺเ-๛][^\n]*/) || [])[0]);
        await narrow(l);
      }
      await page.evaluate(() => { const s = document.getElementById("adLang"); s.value = "th"; s.dispatchEvent(new Event("change")); });
      await page.waitFor("window.LQI18N.lang === 'th'", 8000);
      noErrors(page);
    });

    await check("the owner sets Thai only (password + 6-digit code): the next draft has no English labels", async () => {
      await page.evaluate(() => { const s = document.querySelector("#adsLangRow select"); s.value = "th"; document.getElementById("adsForm").requestSubmit(); });
      await reauth();
      await page.waitFor("/บันทึกข้อมูลกิจการแล้ว/.test(document.getElementById('adMsg').textContent)", 8000);
      const t = await preview();
      assert(/ใบเสนอราคา/.test(t), "Thai title");
      for (const w of ["Quotation", "Seller", "Customer", "Total", "Description"]) assert(!t.includes(w), "Thai only: '" + w + "' found");
      assert(!HAN.test(t), "no Chinese");
      await narrow("th only");
      noErrors(page);
    });
  } finally { await page.close(); await W.close(); await browser.close(); }
}
