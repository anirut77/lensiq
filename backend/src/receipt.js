// @ts-check
// backend/src/receipt.js — printable receipt / tax invoice (ใบเสร็จรับเงิน / ใบกำกับภาษี) rendered from the fields
// stored on the payment row (Revenue Code s.86/4: the words "ใบกำกับภาษี", seller name / address / tax ID / branch,
// buyer name / address (+ tax ID / branch when given), document number, date, description, value, VAT shown separately).
//
//   GET /api/me/payments/:id/receipt[?format=json]          the signed-in member's own payment (bearer)
//   GET /admin/api/billing/payments/:id/receipt[?format=json] admin
//
// Thai first, with English / Chinese labels. VAT lines only when the payment was charged VAT (vat_rate_bp > 0, i.e.
// VAT_REGISTERED=true at checkout). Seller fields come from the payment (frozen at checkout); fields that were empty
// then fall back to the current SELLER_* vars. While any of seller name / tax ID / address is still missing the document
// is marked "ฉบับร่าง (DRAFT) — not a valid receipt / tax invoice". Refunded payments carry a "คืนเงินแล้ว" stamp.
// The HTML has no script and no external resource (CSP default-src 'none'); print with the browser (A4).
import { BKK_OFFSET, HttpError } from "./util.js";

export const RECEIPT_STATUSES = ["successful", "partially_refunded", "refunded"];

const esc = v => String(v == null ? "" : v).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
export const baht = satang => (Number(satang || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TH_MONTHS = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
/** Thai date (Buddhist era) + ISO date, both in Bangkok time. */
export function thaiDate(t) {
  const d = new Date((t + BKK_OFFSET) * 1000);
  const iso = d.toISOString().slice(0, 10);
  return { th: `${d.getUTCDate()} ${TH_MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`, iso };
}

const PERIOD_LABEL = { month: "รายเดือน / Monthly / 月付", year: "รายปี / Yearly / 年付", once: "ซื้อครั้งเดียว / One-time / 一次性", comp: "—" };

/** Structured receipt (also returned with ?format=json). */
export function receiptData(p, plan, env) {
  if (!p || !RECEIPT_STATUSES.includes(p.status) || !p.receipt_no) throw new HttpError(404, "no receipt for this payment");
  const seller = {
    name: p.seller_name || env.SELLER_NAME || null, tax_id: p.seller_tax_id || env.SELLER_TAX_ID || null,
    address: p.seller_address || env.SELLER_ADDRESS || null, branch: p.seller_branch || env.SELLER_BRANCH || null
  };
  const missing = ["name", "tax_id", "address"].filter(k => !seller[k]);
  const vat = p.vat_rate_bp > 0;
  const taxInvoice = vat && p.doc_type === "tax_invoice_receipt";
  return {
    receipt_no: p.receipt_no, doc_type: taxInvoice ? "tax_invoice_receipt" : "receipt", draft: missing.length > 0, missing_seller_fields: missing,
    title_th: taxInvoice ? "ใบเสร็จรับเงิน / ใบกำกับภาษี" : "ใบเสร็จรับเงิน", title_en: taxInvoice ? "Receipt / Tax Invoice" : "Receipt", title_zh: taxInvoice ? "收据 / 税务发票" : "收据",
    date: thaiDate(p.paid_at || p.created_at), paid_at: p.paid_at, payment_id: p.id, method: p.method || "promptpay",
    seller, buyer: { name: p.buyer_name || null, tax_id: p.buyer_tax_id || null, address: p.buyer_address || null, branch: p.buyer_branch || null, email: p.buyer_email || null },
    item: { plan_id: p.plan_id, name_th: plan ? plan.name_th : p.plan_id || "LENSIQ", name_en: plan ? plan.name_en : p.plan_id || "LENSIQ", name_zh: plan ? plan.name_zh || null : null, period: p.period, quantity: 1, amount_satang: p.amount_satang },
    vat: vat ? { rate_bp: p.vat_rate_bp, subtotal_satang: p.subtotal_satang, vat_satang: p.vat_satang } : null,
    total_satang: p.amount_satang, currency: p.currency || "THB",
    refund: p.status === "refunded" || p.status === "partially_refunded" ? { refunded_at: p.refunded_at, refund_satang: p.refund_satang, reference: p.refund_ref, partial: p.status === "partially_refunded" } : null,
    livemode: !!p.livemode
  };
}

const row = (th, en, zh, value) => `<tr><th>${esc(th)}<small>${esc(en)} · ${esc(zh)}</small></th><td>${value}</td></tr>`;

export function renderReceipt(d) {
  const sellerBranch = d.seller.branch ? esc(d.seller.branch) : "สำนักงานใหญ่ / Head office / 总部";
  const vatRows = d.vat ? [
    `<tr><td>มูลค่าสินค้า/บริการ (ก่อนภาษี) <small>Value before VAT · 税前金额</small></td><td class="num">${baht(d.vat.subtotal_satang)}</td></tr>`,
    `<tr><td>ภาษีมูลค่าเพิ่ม ${(d.vat.rate_bp / 100).toFixed(0)}% <small>VAT · 增值税</small></td><td class="num">${baht(d.vat.vat_satang)}</td></tr>`
  ].join("") : "";
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(d.title_th)} ${esc(d.receipt_no)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.5 "Sarabun","Noto Sans Thai","Noto Sans SC",system-ui,sans-serif; color: #111; background: #fff; margin: 0; padding: 24px; }
  .doc { max-width: 760px; margin: 0 auto; position: relative; }
  h1 { font-size: 22px; margin: 0 0 2px; } h1 small, th small, td small { display: block; font-size: 11px; color: #555; font-weight: 400; }
  .head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; vertical-align: top; padding: 6px 8px; }
  .meta th { width: 38%; font-weight: 600; } .items { margin-top: 16px; border-top: 1px solid #999; }
  .items thead th { border-bottom: 1px solid #999; background: #f3f3f3; } .num { text-align: right; white-space: nowrap; }
  .total td { border-top: 2px solid #111; font-weight: 700; font-size: 16px; }
  .stamp { border: 3px solid #b00; color: #b00; padding: 6px 12px; font-weight: 700; display: inline-block; transform: rotate(-4deg); margin: 8px 0; }
  .draft { position: fixed; inset: 40% 0 auto 0; text-align: center; font-size: 64px; color: rgba(176,0,0,.18); transform: rotate(-18deg); pointer-events: none; }
  .note { font-size: 12px; color: #444; margin-top: 16px; }
  @media print { body { padding: 0; } @page { size: A4; margin: 16mm; } }
</style></head><body><div class="doc">
${d.draft ? `<div class="draft" aria-hidden="true">ฉบับร่าง · DRAFT · 草稿</div><p class="stamp">ฉบับร่าง — ยังไม่ใช่${d.doc_type === "tax_invoice_receipt" ? "ใบกำกับภาษี" : "ใบเสร็จรับเงิน"}ที่ใช้ได้ตามกฎหมาย<small>DRAFT — seller details incomplete (${esc(d.missing_seller_fields.join(", "))}); not a valid receipt / tax invoice · 草稿</small></p>` : ""}
${d.refund ? `<p class="stamp">${d.refund.partial ? "คืนเงินบางส่วนแล้ว" : "คืนเงินแล้ว"} ${baht(d.refund.refund_satang)} บาท<small>${d.refund.partial ? "Partially refunded · 部分退款" : "Refunded · 已退款"} — ref ${esc(d.refund.reference || "")}</small></p>` : ""}
${d.livemode ? "" : `<p class="stamp">ทดสอบ — TEST MODE · 测试</p>`}
<div class="head">
  <div><h1>${esc(d.title_th)}<small>${esc(d.title_en)} · ${esc(d.title_zh)}</small></h1>
    <div>${esc(d.seller.name || "—")}</div><div>${esc(d.seller.address || "—")}</div>
    <div>เลขประจำตัวผู้เสียภาษี <small>Tax ID · 纳税人识别号</small> ${esc(d.seller.tax_id || "—")} · ${sellerBranch}</div></div>
  <table class="meta" style="width:auto">
    ${row("เลขที่", "No.", "编号", esc(d.receipt_no))}
    ${row("วันที่", "Date", "日期", `${esc(d.date.th)} (${esc(d.date.iso)})`)}
    ${row("ชำระโดย", "Paid by", "付款方式", d.method === "promptpay" ? "พร้อมเพย์ / PromptPay" : esc(d.method))}
  </table>
</div>
<table class="meta">
  ${row("ผู้ซื้อ", "Buyer", "买方", esc(d.buyer.name || "—"))}
  ${row("ที่อยู่", "Address", "地址", esc(d.buyer.address || "—"))}
  ${d.buyer.tax_id ? row("เลขประจำตัวผู้เสียภาษีผู้ซื้อ", "Buyer tax ID", "买方税号", esc(d.buyer.tax_id) + (d.buyer.branch ? " · " + esc(d.buyer.branch) : "")) : ""}
  ${d.buyer.email ? row("อีเมล", "E-mail", "电子邮件", esc(d.buyer.email)) : ""}
</table>
<table class="items">
  <thead><tr><th>รายการ <small>Description · 项目</small></th><th class="num">จำนวนเงิน (บาท) <small>Amount (THB) · 金额</small></th></tr></thead>
  <tbody>
    <tr><td>LENSIQ ${esc(d.item.name_th)} <small>${esc(d.item.name_en)}${d.item.name_zh ? " · " + esc(d.item.name_zh) : ""} — ${esc(PERIOD_LABEL[d.item.period] || d.item.period || "")} × ${d.item.quantity}</small></td><td class="num">${baht(d.item.amount_satang)}</td></tr>
    ${vatRows}
    <tr class="total"><td>รวมทั้งสิ้น <small>Total${d.vat ? " incl. VAT" : ""} · 合计</small></td><td class="num">${baht(d.total_satang)}</td></tr>
  </tbody>
</table>
<p class="note">${d.vat ? "ราคารวมภาษีมูลค่าเพิ่มแล้ว · Prices include VAT · 价格含增值税" : "ผู้ขายไม่ได้จดทะเบียนภาษีมูลค่าเพิ่ม — ไม่มีภาษีมูลค่าเพิ่ม · Seller not VAT-registered — no VAT charged · 卖方未登记增值税"}<br>
อ้างอิงการชำระเงิน <small>Payment reference · 付款参考</small> ${esc(d.payment_id)}</p>
</div></body></html>`;
}

export const RECEIPT_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
};

/** Loads payment + plan and returns {data} or a Response-ready {html}. */
export async function receiptFor(env, p, format) {
  const plan = p && p.plan_id ? await env.DB.prepare("SELECT id, name_th, name_en, name_zh FROM plans WHERE id = ?1").bind(p.plan_id).first() : null;
  const d = receiptData(p, plan, env);
  return format === "json" ? { data: d } : { html: renderReceipt(d), data: d };
}

// ---- credit note (ใบลดหนี้) — round 11 -------------------------------------------------------------------------------
// Issued for every refund of a VAT tax invoice (Revenue Code s.86/10): the words "ใบลดหนี้", seller name / address / tax
// ID / branch, buyer, credit-note number + date, the original tax invoice number + date, the original value, the
// correct value, the difference and the VAT on the difference, and the reason. Same draft rules as the receipt.

/** Structured credit note for refund row `r` of payment `p` (throws 404 when that refund has no credit-note number). */
export function creditNoteData(p, r, plan, env) {
  if (!p || !r || !r.credit_note_no) throw new HttpError(404, "no credit note for this refund");
  const base = receiptData(p, plan, env);
  const rate = p.vat_rate_bp || 0;
  const vatOf = satang => Math.round(satang * rate / (10000 + rate));
  const diff = r.amount_satang;
  // value before this refund = amount paid minus the refunds issued before it
  const before = p.amount_satang - (r.before_satang || 0);
  return {
    credit_note_no: r.credit_note_no, doc_type: "credit_note", draft: base.draft, missing_seller_fields: base.missing_seller_fields,
    title_th: "ใบลดหนี้", title_en: "Credit note", title_zh: "贷项通知单",
    date: thaiDate(r.ts), seller: base.seller, buyer: base.buyer, item: base.item, livemode: base.livemode,
    original: { receipt_no: p.receipt_no, date: base.date, value_satang: before, value_ex_vat_satang: before - vatOf(before) },
    correct_value_satang: before - diff, difference_satang: diff, difference_ex_vat_satang: diff - vatOf(diff), vat_on_difference_satang: vatOf(diff),
    rate_bp: rate, reason: r.note || "คืนเงิน / Refund / 退款", reference: r.reference, payment_id: p.id
  };
}

export function renderCreditNote(d) {
  const sellerBranch = d.seller.branch ? esc(d.seller.branch) : "สำนักงานใหญ่ / Head office / 总部";
  return `<!doctype html>
<html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(d.title_th)} ${esc(d.credit_note_no)}</title>
<style>
  :root { color-scheme: light; }
  body { font: 14px/1.5 "Sarabun","Noto Sans Thai","Noto Sans SC",system-ui,sans-serif; color: #111; background: #fff; margin: 0; padding: 24px; }
  .doc { max-width: 760px; margin: 0 auto; } h1 { font-size: 22px; margin: 0 0 2px; } small { display: block; font-size: 11px; color: #555; font-weight: 400; }
  .head { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; } th, td { text-align: left; vertical-align: top; padding: 6px 8px; } .num { text-align: right; white-space: nowrap; }
  .items { margin-top: 16px; border-top: 1px solid #999; } .total td { border-top: 2px solid #111; font-weight: 700; }
  .stamp { border: 3px solid #b00; color: #b00; padding: 6px 12px; font-weight: 700; display: inline-block; margin: 8px 0; }
  @media print { body { padding: 0; } @page { size: A4; margin: 16mm; } }
</style></head><body><div class="doc">
${d.draft ? `<p class="stamp">ฉบับร่าง — ยังไม่ใช่ใบลดหนี้ที่ใช้ได้ตามกฎหมาย<small>DRAFT — seller details incomplete (${esc(d.missing_seller_fields.join(", "))}) · 草稿</small></p>` : ""}
${d.livemode ? "" : `<p class="stamp">ทดสอบ — TEST MODE · 测试</p>`}
<div class="head">
  <div><h1>${esc(d.title_th)}<small>${esc(d.title_en)} · ${esc(d.title_zh)}</small></h1>
    <div>${esc(d.seller.name || "—")}</div><div>${esc(d.seller.address || "—")}</div>
    <div>เลขประจำตัวผู้เสียภาษี <small>Tax ID · 纳税人识别号</small> ${esc(d.seller.tax_id || "—")} · ${sellerBranch}</div></div>
  <table style="width:auto">
    ${row("เลขที่", "No.", "编号", esc(d.credit_note_no))}
    ${row("วันที่", "Date", "日期", `${esc(d.date.th)} (${esc(d.date.iso)})`)}
    ${row("อ้างถึงใบกำกับภาษีเลขที่", "Original tax invoice", "原税务发票", `${esc(d.original.receipt_no)} · ${esc(d.original.date.th)}`)}
  </table>
</div>
<table>
  ${row("ผู้ซื้อ", "Buyer", "买方", esc(d.buyer.name || "—"))}
  ${row("ที่อยู่", "Address", "地址", esc(d.buyer.address || "—"))}
  ${d.buyer.tax_id ? row("เลขประจำตัวผู้เสียภาษีผู้ซื้อ", "Buyer tax ID", "买方税号", esc(d.buyer.tax_id) + (d.buyer.branch ? " · " + esc(d.buyer.branch) : "")) : ""}
  ${row("เหตุที่ลดหนี้", "Reason", "原因", esc(d.reason))}
</table>
<table class="items"><tbody>
  <tr><td>มูลค่าตามใบกำกับภาษีเดิม <small>Original value (incl. VAT) · 原金额</small></td><td class="num">${baht(d.original.value_satang)}</td></tr>
  <tr><td>มูลค่าที่ถูกต้อง <small>Correct value · 正确金额</small></td><td class="num">${baht(d.correct_value_satang)}</td></tr>
  <tr><td>ผลต่าง (ก่อนภาษี) <small>Difference before VAT · 差额（税前）</small></td><td class="num">${baht(d.difference_ex_vat_satang)}</td></tr>
  <tr><td>ภาษีมูลค่าเพิ่ม ${(d.rate_bp / 100).toFixed(0)}% ของผลต่าง <small>VAT on the difference · 差额增值税</small></td><td class="num">${baht(d.vat_on_difference_satang)}</td></tr>
  <tr class="total"><td>รวมลดหนี้ <small>Total credited · 合计</small></td><td class="num">${baht(d.difference_satang)}</td></tr>
</tbody></table>
<p class="note">อ้างอิงการคืนเงิน <small>Refund reference · 退款参考</small> ${esc(d.reference || "")} · ${esc(d.payment_id)}</p>
</div></body></html>`;
}

/** Loads refund `refundId` of payment `p` (+ the refunds before it) and returns {data, html?}. */
export async function creditNoteFor(env, p, refundId, format) {
  const r = await env.DB.prepare("SELECT * FROM refunds WHERE id = ?1 AND payment_id = ?2").bind(Number(refundId), p.id).first();
  if (!r) throw new HttpError(404, "refund not found");
  const prior = await env.DB.prepare("SELECT COALESCE(SUM(amount_satang), 0) AS s FROM refunds WHERE payment_id = ?1 AND id < ?2").bind(p.id, r.id).first();
  const plan = p.plan_id ? await env.DB.prepare("SELECT id, name_th, name_en, name_zh FROM plans WHERE id = ?1").bind(p.plan_id).first() : null;
  const d = creditNoteData(p, { ...r, before_satang: Number(prior.s) }, plan, env);
  return format === "json" ? { data: d } : { html: renderCreditNote(d), data: d };
}
