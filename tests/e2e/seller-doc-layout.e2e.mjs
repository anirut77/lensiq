// tests/e2e/seller-doc-layout.e2e.mjs — the printed quotation / invoice / receipt fit an A4 page (independent review at
// f06271c6, 2026-11-20: the quotation's "regular price" header did not wrap, the table ran past the right edge and the
// amount column, subtotal, VAT and total were missing from the PDF). FIXED TEST SET, hash-locked in
// evals-locks/seller-settings.sha256 BEFORE the fix. The documents come from the REAL renderDoc (backend/src/seller.js)
// with synthetic data only: a VAT-registered seller, every approved price line, one line with a long TH / EN / ZH
// description, and quantities that make wide amounts.
//   1. each document printed with Chrome print-to-PDF (A4) carries, in the text pdf.js extracts: every quantity, every
//      unit price, every amount, the subtotal, the VAT and the total (and, on the quotation, every regular price)
//   2. no table cell extends past the printable width: laid out as print at the A4 printable width (210 mm - 2 x 14 mm),
//      every th / td ends inside the page, and no text item in the PDF ends past the page's right edge
import { assert } from "./cdp.mjs";
import { sleep } from "./zones-lib.mjs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MM = 96 / 25.4;
const PRINT_W = Math.floor((210 - 2 * 14) * MM); // CSS px inside the document's @page margins

export default async function ({ launch, check, repo, base }) {
  const imp = p => import(pathToFileURL(join(repo, p)).href);
  const seller = await imp("backend/src/seller.js");
  const { PRICE_LINES } = await imp("backend/src/price-list.js");
  const { baht } = await imp("backend/src/receipt.js");

  const LONG = {
    id: "synthetic_long", name_th: "บริการทดสอบสังเคราะห์สำหรับตรวจการจัดหน้า รายการที่มีคำอธิบายยาวมากเป็นพิเศษ เพื่อดูว่าคอลัมน์รายการตัดบรรทัดได้และไม่ดันตัวเลขออกนอกหน้ากระดาษ",
    name_en: "Synthetic layout-check service with an unusually long description, to make sure the description column wraps and never pushes the figures off the page",
    name_zh: "用于检查版面的合成测试服务，描述特别长，以确认项目栏可以换行，且不会把数字挤出页面",
    unit_th: "หน่วยทดสอบต่อเดือนต่อสาขา", unit_en: "test unit per branch per month", unit_zh: "测试单位/每分店/每月",
    pilot_satang: 1234567, regular_th: "12,345–23,456 (ขั้นต่ำ 99,999)", regular_en: "12,345–23,456 (minimum 99,999)", regular_zh: "12,345–23,456（最低 99,999）"
  };
  const src = [...PRICE_LINES, LONG];
  const lines = src.map((p, i) => {
    const qty = [1, 12, 250, 3, 1999][i % 5];
    return { id: p.id, name_th: p.name_th, name_en: p.name_en, name_zh: p.name_zh, unit_th: p.unit_th, unit_en: p.unit_en, unit_zh: p.unit_zh,
      min_satang: p.min_satang || 0, qty, unit_satang: p.pilot_satang, amount_satang: qty * p.pilot_satang,
      regular_th: p.regular_th, regular_en: p.regular_en, regular_zh: p.regular_zh };
  });
  const subtotal = lines.reduce((a, l) => a + l.amount_satang, 0);
  const vat = Math.round(subtotal * 0.07);
  const S = { legal_name: "บริษัท ทดสอบสังเคราะห์ จำกัด (Synthetic Test Co., Ltd.)", tax_id: "0000000000000", address: "1 ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพฯ 10000",
    branch: "", bank_name: "ธนาคารทดสอบ", bank_account_name: "บริษัท ทดสอบสังเคราะห์ จำกัด", bank_account_no: "0001112223",
    contact_phone: "0200000000", contact_email: "billing@seller.example", contact_line: "@sellertest" };
  const doc = type => ({ doc_type: type, status: "issued", number: "TS-" + type.slice(0, 2).toUpperCase() + "-000001", created_at: 1763500000, issued_at: 1763500000,
    buyer: { name: "ลูกค้าทดสอบ จำกัด", address: "2 ถนนลูกค้า กรุงเทพฯ 10100", tax_id: "0000000000001", branch: "สำนักงานใหญ่" },
    lines, missing_seller_fields: [], seller: S, vat_registered: true, vat_rate_bp: 700, vat_satang: vat,
    subtotal_satang: subtotal, total_satang: subtotal + vat,
    extra: type === "quotation" ? { valid_days: 30, ref: "REF-QT-LAYOUT" } : type === "invoice" ? { due_days: 15, ref: "REF-IV-LAYOUT" } : { paid_on: "2026-11-20", ref: "REF-RC-LAYOUT" } });

  const browser = await launch();
  const flat = s => String(s).replace(/\s+/g, "");

  /** Chrome print-to-PDF (A4) of the HTML; returns pdf.js text and every text item's right edge vs. the page width */
  async function printed(html) {
    const p = await browser.newPage(null, { isolated: true });
    try {
      await p.goto("about:blank");
      const { frameTree } = await p.send("Page.getFrameTree");
      await p.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
      await sleep(300);
      const { data } = await p.send("Page.printToPDF", { paperWidth: 8.27, paperHeight: 11.69, printBackground: true });
      const r = await browser.newPage(null, { isolated: true });
      try {
        await r.goto(base + "/converter.html");
        await r.waitFor("typeof pdfjsLib !== 'undefined'", 10000);
        return await r.evaluate(async b64 => {
          const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
          const d = await pdfjsLib.getDocument({ data: bin }).promise;
          let text = "", over = [];
          for (let i = 1; i <= d.numPages; i++) {
            const pg = await d.getPage(i), w = pg.getViewport({ scale: 1 }).width;
            const items = (await pg.getTextContent()).items;
            text += items.map(x => x.str).join(" ") + "\n";
            for (const x of items) if (x.str.trim() && x.transform[4] + x.width > w + 0.5) over.push(`p${i} "${x.str}" ends ${Math.round(x.transform[4] + x.width)} > ${Math.round(w)}`);
          }
          return { text, over };
        }, data);
      } finally { await r.close(); }
    } finally { await p.close(); }
  }

  /** th / td that end past the printable width when the document is laid out as print at A4 width */
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

  try {
    for (const type of ["quotation", "invoice", "receipt"]) {
      const d = doc(type);
      const html = seller.renderDoc(d);
      await check(`${type}: the A4 PDF carries every quantity, unit price, amount, the subtotal, the VAT and the total`, async () => {
        const { text } = await printed(html);
        const t = flat(text);
        const want = [];
        for (const l of lines) want.push(["qty " + l.id, String(l.qty)], ["unit " + l.id, baht(l.unit_satang)], ["amount " + l.id, baht(l.amount_satang)]);
        if (type === "quotation") for (const l of lines) want.push(["regular " + l.id, l.regular_en]);
        want.push(["subtotal", baht(subtotal)], ["VAT", baht(vat)], ["total", baht(subtotal + vat)]);
        const missing = want.filter(([, v]) => !t.includes(flat(v))).map(([k, v]) => `${k}=${v}`);
        assert(!missing.length, `${type}: missing from the PDF: ${missing.join(", ")}`);
      });
      await check(`${type}: no table cell extends past the A4 printable width (layout and PDF)`, async () => {
        const o = await overflowing(html);
        assert(!o.length, `${type}: ${o.slice(0, 5).join(" | ")}`);
        const { over } = await printed(html);
        assert(!over.length, `${type}: PDF text past the page edge: ${over.slice(0, 5).join(" | ")}`);
      });
    }
  } finally { await browser.close(); }
}
