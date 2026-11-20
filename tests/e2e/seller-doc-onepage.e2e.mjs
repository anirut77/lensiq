// tests/e2e/seller-doc-onepage.e2e.mjs — a short quotation / invoice / receipt prints on ONE A4 page (owner decision 192 ก,
// 2026-11-20: the documents ran to 2 pages even with a single item line, because the header stacked the seller block and
// then the number and dates, pushing the item table onto page 2). FIXED TEST SET, hash-locked in
// evals-locks/seller-settings.sha256 (relock3/) BEFORE the fix. The documents come from the REAL renderDoc
// (backend/src/seller.js) with synthetic data only: a VAT-registered seller with a logo, seller and buyer names and
// addresses at the product's length limits in Thai and Chinese (name 160, address 300 characters), a 300-character note,
// and lines from the approved price list.
//   1. 1 to 5 item lines: Chrome print-to-PDF (A4, with the document's own @page and with Chrome's paper size) gives
//      exactly 1 page, for each of the 3 document types
//   2. every quantity, unit price, amount, the subtotal, the VAT and the total (and on the quotation every regular price)
//      are in the PDF text
//   3. no table cell ends past the A4 printable width (layout as print at 210 mm - 2 x 14 mm) and no PDF text item ends
//      past the page's right edge
//   4. a long document (20 lines, the product maximum) still paginates: more than 1 page, every amount present, no overflow
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MM = 96 / 25.4;
const PRINT_W = Math.floor((210 - 2 * 14) * MM); // CSS px inside the document's @page margins

const fit = (s, n) => { let o = ""; while (o.length < n) o += s; return o.slice(0, n); };
const SELLER_NAME = fit("บริษัท ทดสอบสังเคราะห์ระบบจัดหน้าเอกสารภาษาไทยและภาษาจีน จำกัด 合成测试文档排版有限公司（泰文与中文长名称测试）", 160);
const SELLER_ADDR = fit("เลขที่ 1 อาคารทดสอบสังเคราะห์ ชั้น 99 ห้อง 9999 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10000 合成测试大厦99楼9999室 测试路 测试区 曼谷 10000 ", 300);
const BUYER_NAME = fit("ห้างหุ้นส่วนจำกัด ลูกค้าทดสอบสังเคราะห์เพื่อการตรวจความยาวชื่อในเอกสาร 合成测试客户有限合伙企业（用于检查单据名称长度）", 160);
const BUYER_ADDR = fit("เลขที่ 2 หมู่ 2 ซอยลูกค้าทดสอบ ถนนลูกค้า ตำบลทดสอบ อำเภอทดสอบ จังหวัดทดสอบ 10100 合成测试客户地址 第二巷 测试镇 测试县 测试府 10100 ", 300);
const NOTE = fit("หมายเหตุทดสอบสังเคราะห์ ใช้ตรวจว่าข้อความยาวยังอยู่ในหน้าเดียว 合成测试备注，用于检查长文本仍在一页之内。 ", 300);
// synthetic 400 x 112 logo (shows at the document's maximum 200 x 56)
const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="112"><rect width="400" height="112" fill="#246"/></svg>`;

export default async function ({ launch, check, repo, base }) {
  const imp = p => import(pathToFileURL(join(repo, p)).href);
  const seller = await imp("backend/src/seller.js");
  const { PRICE_LINES } = await imp("backend/src/price-list.js");
  const { baht } = await imp("backend/src/receipt.js");

  const S = { legal_name: SELLER_NAME, tax_id: "0000000000000", address: SELLER_ADDR, branch: "สาขาทดสอบสังเคราะห์ที่ 00001 合成测试分店",
    bank_name: "ธนาคารทดสอบสังเคราะห์ 合成测试银行", bank_account_name: SELLER_NAME.slice(0, 120), bank_account_no: "0001112223",
    contact_phone: "0200000000", contact_email: "billing@seller.example", contact_line: "@sellertest",
    logo_mime: "image/svg+xml", logo_data: Buffer.from(LOGO_SVG).toString("base64") };
  const mkLines = n => Array.from({ length: n }, (_, i) => {
    const p = PRICE_LINES[i % PRICE_LINES.length], qty = [1999, 12, 250, 3, 99999][i % 5];
    return { id: p.id, name_th: p.name_th, name_en: p.name_en, name_zh: p.name_zh, unit_th: p.unit_th, unit_en: p.unit_en, unit_zh: p.unit_zh,
      min_satang: p.min_satang || 0, qty, unit_satang: p.pilot_satang, amount_satang: qty * p.pilot_satang,
      regular_th: p.regular_th, regular_en: p.regular_en, regular_zh: p.regular_zh };
  });
  const doc = (type, n) => {
    const lines = mkLines(n);
    const subtotal = lines.reduce((a, l) => a + l.amount_satang, 0), vat = Math.round(subtotal * 0.07);
    return { doc_type: type, status: "issued", number: "TS-" + type.slice(0, 2).toUpperCase() + "-000001", created_at: 1763500000, issued_at: 1763500000,
      buyer: { name: BUYER_NAME, address: BUYER_ADDR, tax_id: "0000000000001", branch: "สำนักงานใหญ่ 总公司" },
      lines, missing_seller_fields: [], seller: S, vat_registered: true, vat_rate_bp: 700, vat_satang: vat,
      subtotal_satang: subtotal, total_satang: subtotal + vat,
      extra: { ...(type === "quotation" ? { valid_days: 30 } : type === "invoice" ? { due_days: 15 } : { paid_on: "2026-11-20" }),
        ref: fit("REF-" + type.toUpperCase() + "-ทดสอบอ้างอิง-参考-", 80), note: NOTE } };
  };

  const browser = await launch();
  const flat = s => String(s).replace(/\s+/g, "");
  let reader = null;
  async function read(b64) {
    if (!reader) {
      reader = await browser.newPage(null, { isolated: true });
      await reader.goto(base + "/converter.html");
      await reader.waitFor("typeof pdfjsLib !== 'undefined'", 10000);
    }
    return reader.evaluate(async b64 => {
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const d = await pdfjsLib.getDocument({ data: bin }).promise;
      let text = "", over = [];
      for (let i = 1; i <= d.numPages; i++) {
        const pg = await d.getPage(i), w = pg.getViewport({ scale: 1 }).width;
        const items = (await pg.getTextContent()).items;
        text += items.map(x => x.str).join(" ") + "\n";
        for (const x of items) if (x.str.trim() && x.transform[4] + x.width > w + 0.5) over.push(`p${i} "${x.str}" ends ${Math.round(x.transform[4] + x.width)} > ${Math.round(w)}`);
      }
      return { pages: d.numPages, text, over };
    }, b64);
  }

  /** Chrome print-to-PDF on A4: cssPage = the document's own @page (size A4, 14 mm), else Chrome's A4 paper size */
  async function printed(html, cssPage) {
    const p = await browser.newPage(null, { isolated: true });
    try {
      await p.goto("about:blank");
      const { frameTree } = await p.send("Page.getFrameTree");
      await p.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
      await sleep(300);
      const { data } = await p.send("Page.printToPDF", { paperWidth: 8.27, paperHeight: 11.69, printBackground: true, preferCSSPageSize: !!cssPage });
      return await read(data);
    } finally { await p.close(); }
  }

  async function overflowing(html) {
    const p = await browser.newPage(null, { isolated: true });
    try {
      await p.send("Emulation.setDeviceMetricsOverride", { width: PRINT_W, height: 1100, deviceScaleFactor: 1, mobile: false });
      await p.send("Emulation.setEmulatedMedia", { media: "print" });
      await p.goto("about:blank");
      const { frameTree } = await p.send("Page.getFrameTree");
      await p.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
      await sleep(300);
      return await p.evaluate(W => {
        const out = [];
        if (document.documentElement.scrollWidth > W) out.push("page scrollWidth " + document.documentElement.scrollWidth + " > " + W);
        for (const c of document.querySelectorAll("th, td")) {
          const r = c.getBoundingClientRect();
          if (r.right > W + 0.5) out.push(`${c.tagName} "${c.textContent.trim().slice(0, 40)}" ends ${Math.round(r.right)} > ${W}`);
        }
        return out;
      }, PRINT_W);
    } finally { await p.close(); }
  }

  const missingAmounts = (d, text) => {
    const t = flat(text), want = [];
    for (const [i, l] of d.lines.entries()) want.push([`qty#${i + 1}`, String(l.qty)], [`unit#${i + 1}`, baht(l.unit_satang)], [`amount#${i + 1}`, baht(l.amount_satang)]);
    if (d.doc_type === "quotation") for (const [i, l] of d.lines.entries()) want.push([`regular#${i + 1}`, l.regular_en]);
    want.push(["subtotal", baht(d.subtotal_satang)], ["VAT", baht(d.vat_satang)], ["total", baht(d.total_satang)]);
    return want.filter(([, v]) => !t.includes(flat(v))).map(([k, v]) => `${k}=${v}`);
  };

  try {
    for (const type of ["quotation", "invoice", "receipt"]) {
      for (let n = 1; n <= 5; n++) {
        const d = doc(type, n), html = seller.renderDoc(d);
        await check(`${type}, ${n} line(s): exactly 1 A4 page, every amount in the PDF, nothing past the printable width`, async () => {
          const css = await printed(html, true), paper = await printed(html, false);
          assert(css.pages === 1, `${type} ${n} line(s): ${css.pages} pages with the document's @page A4 (want 1)`);
          assert(paper.pages === 1, `${type} ${n} line(s): ${paper.pages} pages on Chrome's A4 paper (want 1)`);
          const miss = missingAmounts(d, css.text);
          assert(!miss.length, `${type} ${n} line(s): missing from the PDF: ${miss.join(", ")}`);
          const o = await overflowing(html);
          assert(!o.length, `${type} ${n} line(s): ${o.slice(0, 5).join(" | ")}`);
          assert(!css.over.length && !paper.over.length, `${type} ${n} line(s): PDF text past the page edge: ${[...css.over, ...paper.over].slice(0, 5).join(" | ")}`);
        });
      }
      await check(`${type}, 20 lines: still paginates (more than 1 page), every amount in the PDF, nothing past the printable width`, async () => {
        const d = doc(type, 20), html = seller.renderDoc(d);
        const css = await printed(html, true);
        assert(css.pages > 1, `${type} 20 lines: ${css.pages} page(s) (want more than 1)`);
        const miss = missingAmounts(d, css.text);
        assert(!miss.length, `${type} 20 lines: missing from the PDF: ${miss.join(", ")}`);
        const o = await overflowing(html);
        assert(!o.length, `${type} 20 lines: ${o.slice(0, 5).join(" | ")}`);
        assert(!css.over.length, `${type} 20 lines: PDF text past the page edge: ${css.over.slice(0, 5).join(" | ")}`);
      });
    }
  } finally {
    if (reader) await reader.close().catch(() => {});
    await browser.close();
  }
}
