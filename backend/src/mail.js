// @ts-check
// backend/src/mail.js — transactional e-mail (round 12): receipt / tax-invoice notice, credit-note notice, renewal reminder.
//
// OFF until the owner configures a provider (needs an account + sender-domain DNS: SPF / DKIM / DMARC):
//   MAIL_PROVIDER   var: "resend" | "mailchannels" | "" (off — every mail is logged as skipped_not_configured)
//   MAIL_FROM       var: sender address on the verified domain, e.g. "LENSIQ <billing@example.co.th>"
//   MAIL_API_KEY    SECRET (`wrangler secret put MAIL_API_KEY`) — the provider's API key
//   SITE_URL        var: public site origin for the account-page link, e.g. "https://www.example.co.th"
//
// What a mail contains: a fixed TH / EN / ZH text, the document number, the amount and a link to the signed-in account
// page — never the document itself, the buyer's tax ID / address, or a sign-in link (the receipt stays behind the
// member's own sign-in, GET /api/me/payments/:id/receipt). Opt-outs (users.email_receipts / email_reminders, POST
// /api/me/preferences) stop the e-mail only; every document and the renewal banner stay in the account page.
// Delivery log: mail_log (kind, ref) is UNIQUE, so a retried webhook / cron never sends twice; it stores the member id,
// the provider message id and the outcome — no address, subject or body. Sending is best effort: a provider failure
// never fails a payment, refund or cron run (logged as status 'failed' with the HTTP status only).
import { baht } from "./receipt.js";
import { log, now } from "./util.js";

export const MAIL_KINDS = ["receipt", "credit_note", "renewal_reminder"];
/** Renewal reminder e-mail this many days before the paid period ends (the in-account banner starts at 7). */
export const REMINDER_DAYS = 3;

export const mailProvider = env => {
  const p = String(env.MAIL_PROVIDER || "").toLowerCase();
  return p === "resend" || p === "mailchannels" ? p : "none";
};
/** Admin / go-live view of the mail setup (never the key). */
export function mailStatus(env) {
  const provider = mailProvider(env);
  return { provider, from_set: !!String(env.MAIL_FROM || "").trim(), key_set: !!env.MAIL_API_KEY, site_url_set: !!String(env.SITE_URL || "").trim(), configured: provider !== "none" && !!String(env.MAIL_FROM || "").trim() && !!env.MAIL_API_KEY };
}

const siteLink = (env, path) => {
  const base = String(env.SITE_URL || "").trim().replace(/\/+$/, "");
  return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(base) ? base + path : null;
};

/** Plain-text bodies, Thai first then English and Chinese (one mail for every reader). Only fixed text + numbers. */
export function mailText(kind, v) {
  const link = v.link ? `\n\n${v.link}` : "";
  if (kind === "receipt") {
    return {
      subject: `LENSIQ ใบเสร็จ ${v.no} / Receipt / 收据`,
      text: `ขอบคุณที่ชำระเงิน — เอกสารเลขที่ ${v.no} ยอด ${v.amount} บาท ดูและพิมพ์ใบเสร็จ${v.tax ? " / ใบกำกับภาษี" : ""}ได้ในหน้าบัญชีของคุณ (ต้องเข้าสู่ระบบ)` +
        `\n\nThank you for your payment — document ${v.no}, ${v.amount} THB. View and print the receipt${v.tax ? " / tax invoice" : ""} in your account (sign-in required).` +
        `\n\n感谢您的付款 — 单据编号 ${v.no}，金额 ${v.amount} 泰铢。请登录您的账户查看并打印收据${v.tax ? "／税务发票" : ""}。` + link +
        "\n\n— อีเมลแจ้งการทำรายการ ปิดได้ในหน้าบัญชี / Transactional notice; turn it off in your account / 交易通知，可在账户中关闭"
    };
  }
  if (kind === "credit_note") {
    return {
      subject: `LENSIQ คืนเงิน / Refund / 退款${v.no ? " " + v.no : ""}`,
      text: `เราคืนเงิน ${v.amount} บาท สำหรับเอกสาร ${v.receipt}${v.no ? ` แล้ว — ใบลดหนี้เลขที่ ${v.no}` : " แล้ว"} ดูรายละเอียดได้ในหน้าบัญชีของคุณ` +
        `\n\nWe refunded ${v.amount} THB for document ${v.receipt}${v.no ? ` — credit note ${v.no}` : ""}. Details are in your account.` +
        `\n\n我们已为单据 ${v.receipt} 退款 ${v.amount} 泰铢${v.no ? `，贷项通知单编号 ${v.no}` : ""}。详情请见您的账户。` + link +
        "\n\n— อีเมลแจ้งการทำรายการ ปิดได้ในหน้าบัญชี / Transactional notice; turn it off in your account / 交易通知，可在账户中关闭"
    };
  }
  return {
    subject: "LENSIQ แพ็กเกจใกล้หมดอายุ / Your plan ends soon / 套餐即将到期",
    text: `แพ็กเกจ ${v.plan_th || v.plan} ของคุณจะหมดอายุในอีก ${v.days} วัน (${v.date}) การชำระด้วย PromptPay ไม่ต่ออายุอัตโนมัติ — ต่ออายุได้ในหน้าบัญชีถ้าต้องการ` +
      `\n\nYour ${v.plan} plan ends in ${v.days} day(s) (${v.date}). PromptPay plans do not renew automatically — renew from your account if you wish.` +
      `\n\n您的 ${v.plan} 套餐将在 ${v.days} 天后到期（${v.date}）。PromptPay 套餐不会自动续订——如需续订，请在账户中操作。` + link +
      "\n\n— ปิดการแจ้งเตือนทางอีเมลได้ในหน้าบัญชี / Turn these reminders off in your account / 可在账户中关闭此提醒"
  };
}

async function deliver(env, to, m, fetchImpl) {
  const provider = mailProvider(env), from = String(env.MAIL_FROM || "").trim();
  const f = fetchImpl || fetch;
  const init = (url, headers, body) => {
    /** @type {RequestInit} */
    const o = { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) };
    try { o.signal = AbortSignal.timeout(5000); } catch { /* older runtime */ }
    return f(url, o);
  };
  if (provider === "resend") {
    const r = await init("https://api.resend.com/emails", { Authorization: "Bearer " + env.MAIL_API_KEY }, { from, to: [to], subject: m.subject, text: m.text });
    const j = await r.json().catch(() => ({}));
    return { ok: r.ok, status: r.status, id: j && j.id ? String(j.id).slice(0, 80) : null };
  }
  const r = await init("https://api.mailchannels.net/tx/v1/send", { "X-Api-Key": String(env.MAIL_API_KEY) },
    { personalizations: [{ to: [{ email: to }] }], from: { email: from.replace(/^.*<([^>]+)>.*$/, "$1") }, subject: m.subject, content: [{ type: "text/plain", value: m.text }] });
  return { ok: r.ok, status: r.status, id: r.headers.get("X-Message-Id") || null };
}

/**
 * Sends one transactional mail at most once per (kind, ref). Returns the logged status. Never throws.
 * @param {Env} env @param {{kind: string, ref: string, userId: string|null, optOut?: string, vars: Record<string, any>}} o
 * @param {typeof fetch} [fetchImpl]
 */
export async function sendOnce(env, { kind, ref, userId, optOut, vars }, fetchImpl) {
  const db = env.DB, t = now(), provider = mailProvider(env);
  try {
    const u = userId ? await db.prepare("SELECT email, email_receipts, email_reminders, status FROM users WHERE id = ?1").bind(userId).first() : null;
    let status = "pending";
    if (!mailStatus(env).configured) status = "skipped_not_configured";
    else if (!u || !u.email || u.status !== "active") status = "skipped_no_address";
    else if (optOut && !Number(u[optOut])) status = "skipped_opt_out";
    const claim = await db.prepare("INSERT OR IGNORE INTO mail_log (ts, kind, ref, user_id, provider, status) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(t, kind, String(ref).slice(0, 80), userId, provider, status).run();
    if (!claim.meta || !claim.meta.changes) return "duplicate";
    if (status !== "pending") return status;
    let res;
    try { res = await deliver(env, String(u.email), mailText(kind, { ...vars, link: vars.link || siteLink(env, "/account.html") }), fetchImpl); } catch (e) { res = { ok: false, status: 0, id: null, name: (e && e.name) || "Error" }; }
    const final = res.ok ? "sent" : "failed";
    await db.prepare("UPDATE mail_log SET status = ?1, provider_id = ?2, error = ?3 WHERE kind = ?4 AND ref = ?5")
      .bind(final, res.id, res.ok ? null : String(res.status || res.name || "error").slice(0, 40), kind, String(ref).slice(0, 80)).run();
    log("mail." + final, { kind, status: res.status || 0 });
    return final;
  } catch (e) {
    log("mail.error", { kind, name: String((e && e.name) || "Error").slice(0, 40) });
    return "error";
  }
}

/** Receipt notice after a successful payment (billing.js applyCharge). */
export async function mailReceipt(env, paymentId, fetchImpl) {
  const p = await env.DB.prepare("SELECT id, user_id, receipt_no, amount_satang, doc_type FROM payments WHERE id = ?1").bind(paymentId).first();
  if (!p || !p.user_id || !p.receipt_no) return "skipped_no_address";
  return sendOnce(env, { kind: "receipt", ref: p.id, userId: p.user_id, optOut: "email_receipts", vars: { no: p.receipt_no, amount: baht(p.amount_satang), tax: p.doc_type === "tax_invoice_receipt" } }, fetchImpl);
}

/** Refund / credit-note notice (billing-admin.js refundPayment). */
export async function mailCreditNote(env, paymentId, refundId, fetchImpl) {
  const db = env.DB;
  const p = await db.prepare("SELECT id, user_id, receipt_no FROM payments WHERE id = ?1").bind(paymentId).first();
  const r = await db.prepare("SELECT id, amount_satang, credit_note_no FROM refunds WHERE id = ?1 AND payment_id = ?2").bind(refundId, paymentId).first();
  if (!p || !r || !p.user_id) return "skipped_no_address";
  return sendOnce(env, { kind: "credit_note", ref: String(r.id), userId: p.user_id, optOut: "email_receipts", vars: { no: r.credit_note_no || null, receipt: p.receipt_no || p.id.slice(0, 8), amount: baht(r.amount_satang) } }, fetchImpl);
}

/** Daily: renewal reminders for paid periods ending within REMINDER_DAYS (one per subscription period). */
export async function mailRenewalReminders(env, t = now(), fetchImpl) {
  const rows = (await env.DB.prepare("SELECT s.id, s.user_id, s.plan_id, s.current_period_end, p.name_th, p.name_en FROM subscriptions s JOIN plans p ON p.id = s.plan_id " +
    "WHERE s.status = 'active' AND s.user_id IS NOT NULL AND s.plan_id != 'free' AND s.current_period_end > ?1 AND s.current_period_end <= ?2 LIMIT 200")
    .bind(t, t + REMINDER_DAYS * 86400).all()).results || [];
  const out = { candidates: rows.length, sent: 0 };
  for (const s of rows) {
    const d = new Date((s.current_period_end + 7 * 3600) * 1000).toISOString().slice(0, 10);
    const st = await sendOnce(env, { kind: "renewal_reminder", ref: `${s.id}:${s.current_period_end}`, userId: s.user_id, optOut: "email_reminders",
      vars: { plan: s.name_en || s.plan_id, plan_th: s.name_th || s.plan_id, days: Math.max(1, Math.ceil((s.current_period_end - t) / 86400)), date: d, link: siteLink(env, `/pricing.html?plan=${encodeURIComponent(s.plan_id)}`) } }, fetchImpl);
    if (st === "sent") out.sent++;
  }
  return out;
}

/** Admin: the delivery log (no addresses are stored). */
export async function adminMailLog(db, q = {}) {
  const limit = Math.min(200, Math.max(1, Number.parseInt(String(q.limit || 50), 10) || 50));
  const rows = (await db.prepare("SELECT id, ts, kind, ref, user_id, provider, status, provider_id, error FROM mail_log ORDER BY id DESC LIMIT ?1").bind(limit).all()).results || [];
  return { mail: rows };
}
