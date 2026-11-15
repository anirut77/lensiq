/* lensiq-pc-ai.js — Product Check "ask AI" step (round 17 P7; design §5.2, §8.2, §10.6; owner decisions PC-D1, PC-D2, PC-D9).
 * Browser: window.LQPCAI, painted into #pcAiSlot inside the risk-signal card of lensiq-pc-lookup.js · Node: module.exports
 * (pure parts, tests/unit/pc-ai.test.js).
 *
 * OPT-IN, NOTHING BEFORE CONSENT. The step is shown only when the page has an API base (LQApi). Pressing "ask AI":
 *   1. the patient-name guard (lensiq-pc-guard.js) runs on the label text on this device;
 *   2. ONE consent screen (LQAI.ensureConsentGroup "pc") for pc_fields + pc_claims + pc_translate: the provider, model and
 *      processing country used for each, the retention of every provider that may receive data, the single choice
 *      "text only" (default) or "photo of the product (faces blurred first)", "remember my choice", how to withdraw;
 *      a remembered choice skips the screen; the withdraw button under the step clears it at once;
 *   3. text mode: the guard's redacted text goes out (derived facts); the user sees what was removed;
 *      image mode (pc_fields only): if the guard found anything, OR the text looks like a dispensing / prescription label
 *      (LQPCGuard.imageCheck: a name with no cue cannot be found in text but would be in the photo), the photo is BLOCKED
 *      and the page offers text only with
 *      the parts removed; otherwise prepareUpload() (lensiq-pc-ui.js — the ONLY image path: faces blurred, preview, the
 *      user confirms) and the confirmed JPEG goes out. textOnly or cancelled from prepareUpload -> text only, said so;
 *   4. results are ADDED to the card under the on-device results, labelled "AI estimate" with the provider and country;
 *      they never replace an on-device or official fact. pc_claims signals are listed apart from the LQClaims hits with an
 *      agreement line (both / AI only / on this device only).
 * MANDATORY TEXT PREVIEW (coordinator decision, mirrors the photo preview): before ANY send the page shows the EXACT text that
 *   will go out, removed parts highlighted, editable; nothing is sent until "Send this text". The edited text is checked by
 *   the guard again (anything new is removed and shown again). "Remember my choice" never skips it: it is open for a text
 *   with a redaction or a dispensing-label look (or without a remembered consent) and collapsed, one tap away, for a clean
 *   product text. What is sent equals what was shown (e2e).
 * OCR PROVENANCE (owner decision 2026-11-10, option b): only text that came from the on-device OCR of the label is ever
 *   sent. The original OCR output (window.__LQ_PC.st.ocr.text) is kept; in the preview the user may delete or correct, but
 *   every token that is not in the OCR output (LQPCGuard.provenance: substring after NFKC / Thai-digit / case folding, or a
 *   1-2 character OCR correction of an existing token) is struck through, "not sent: not on the label", and dropped. A
 *   name or phone typed into the box never reaches a request (e2e). The Worker cannot verify this (it never sees the label
 *   or its OCR; sending them would itself move deleted label data off the device): docs/product-check/P7-RESULTS.md §2.
 * DISPENSING LABELS (owner decision 2026-11-10: AI stays OFF): LQPCGuard.DEFAULTS.dispensingAI "off" (default) = no AI at all for a text
 *   that looks like a dispensing / prescription label (no consent screen, nothing sent; on-device results stay);
 *   "text-preview" = text only after the preview. Page override for tests: window.LENSIQ_PC_DISPENSING_AI (the Worker uses
 *   the module default, so change DEFAULTS to change both).
 * PRODUCT-LABEL EVIDENCE (owner decision 2026-11-10, option 1): LQPCGuard.aiGate(text, facts) is THE decision for both modes
 *   (text and image), taken before the consent screen and again on the edited preview text: AI only when the capture
 *   shows product-label evidence (a registration-number shape, a decoded barcode, or two label cue types) AND no sign of a
 *   personal document (recipient / sender, delivery, order, receipt, certificate, appointment, letter) AND is not a
 *   dispensing label. Otherwise: no consent screen, no request, a clear message; on-device results stay. facts = the
 *   barcodes decoded and the registration numbers parsed on this device; they go to the LENSIQ Worker with the text so it
 *   can repeat the check (never to the AI provider).
 * No verdict words: risk signals only. TH default + i18n/en-med.js, i18n/zh-med.js (md.pc.ai.*).
 *
 *   agreement(aiSignals, deviceClaims) -> {both, aiOnly, deviceOnly}
 *   decide({mode, image, features}) -> {send: "text"|"image"} | {offer: "text"}   image = LQPCGuard.imageCheck(text)
 *   gateNote(reason) -> "" | "dispOff" | "personalDoc" | "noProduct"   the notice shown when LQPCGuard.aiGate refuses
 *   NEXT STEP (owner decision 2026-11-10, option ก): only for "no-product" the page adds #pcAiGuide: photograph the side with
 *   the registration number or the ingredients list, or scan the barcode, with one-tap buttons to the page's own camera
 *   and barcode scan. A personal document or a dispensing label gets NO retry hint. When the capture then shows product
 *   evidence (e.g. a barcode was decoded) the notice is replaced by #pcAiReady; nothing is sent until the user asks again.
 *   captureFacts(P, text, codes) -> {gtins, regs}   what the page holds for the capture (P = LQPC)
 * Company phones (owner decision pending): window.LENSIQ_PC_COMPANY_PHONES = "remove" treats them like any phone;
 * default "keep" (LQPCGuard.DEFAULTS).
 *   translateTarget(text, uiLang) -> "th"|"en"|"zh"|null   null = the label is already in the page language
 *   regAgree(aiRegs, deviceNorms) -> rows with agree flags
 * Test hook: window.__LQ_PCAI = {st, ask(forceText), paint()}.
 */
(function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m;
  else { /** @type {any} */ (root).LQPCAI = m; m.mount(root); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const GROUP = "pc";
  const FEATURES = ["pc_fields", "pc_claims", "pc_translate"];
  const LABELS = {
    pc_fields: { th: "อ่านข้อมูลบนฉลาก", en: "reading the label fields", zh: "读取标签字段" },
    pc_claims: { th: "หาคำโฆษณาเกินจริง", en: "finding over-claims", zh: "查找夸大宣传" },
    pc_translate: { th: "แปลฉลาก", en: "translating the label", zh: "翻译标签" }
  };

  /** @param {{rule_id: string}[]} ai @param {{rule_id: string}[]} device */
  function agreement(ai, device) {
    const a = [...new Set((ai || []).map(s => s.rule_id))], d = [...new Set((device || []).map(s => s.rule_id))];
    return { both: a.filter(x => d.includes(x)), aiOnly: a.filter(x => !d.includes(x)), deviceOnly: d.filter(x => !a.includes(x)) };
  }
  /** Which mode goes out. Image only for pc_fields, only when chosen, and never with personal data on the label.
   * @param {{mode: string, image: {block: boolean}, features: string[]}} o */
  function decide(o) {
    if (o.mode !== "image" || !o.features.includes("pc_fields")) return { send: "text" };
    if (!o.image || o.image.block) return { offer: "text" }; // no check result = no photo
    return { send: "image" };
  }
  /** Notice key for an aiGate reason ("" = allowed). @param {string} reason */
  function gateNote(reason) {
    return reason === "ok" ? "" : reason === "dispensing" ? "dispOff" : reason === "personal-doc" ? "personalDoc" : "noProduct";
  }
  /** Barcodes with a valid check digit and registration-number shapes the page already read for this capture.
   * @param {any} P LQPC @param {any} text @param {any[]} [codes] decoded barcodes ({rawValue, format}) */
  function captureFacts(P, text, codes) {
    const gtins = P && P.barcodeInfo ? (codes || []).map(c => P.barcodeInfo(c.rawValue, c.format)).filter(c => c && c.gtin && c.gtinValid).map(c => String(c.gtin)) : [];
    const regs = P && P.findRegNumbers ? P.findRegNumbers(String(text || "")).filter((/** @type {any} */ r) => r.ok && r.note !== "uncertain").map((/** @type {any} */ r) => String(r.norm)) : [];
    return { gtins: [...new Set(gtins)].slice(0, 8), regs: [...new Set(regs)].slice(0, 8) };
  }
  const SCRIPT = { th: /[ก-๙]/gu, latin: /[A-Za-z]/gu, cjk: /[぀-ヿ一-鿿가-힯]/gu };
  /** @param {any} text @param {any} ui page language */
  function translateTarget(text, ui) {
    const t = String(text || ""), L = ui === "en" || ui === "zh" ? ui : "th";
    const n = k => (t.match(SCRIPT[k]) || []).length;
    const counts = { th: n("th"), latin: n("latin"), cjk: n("cjk") };
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (!top || top[1] < 4) return null;
    const own = L === "th" ? "th" : L === "en" ? "latin" : "cjk";
    // a Chinese page still gets Korean / Japanese labels translated: the cjk count covers kana and hangul too
    if (top[0] === own && !(L === "zh" && /[぀-ヿ가-힯]/u.test(t))) return null;
    return L;
  }
  const regKey = s => String(s || "").normalize("NFKC").toUpperCase().replace(/[^0-9A-Zก-๙]/g, "");
  /** @param {{number: string, source?: string}[]} ai @param {string[]} device */
  function regAgree(ai, device) {
    const d = new Set((device || []).map(regKey));
    return (ai || []).map(r => ({ ...r, agree: d.has(regKey(r.number)) }));
  }

  /* ======================================================================================================== */
  function mount(W) {
    if (typeof document === "undefined") return;
    const start = () => { if (document.querySelector("#tab-pc")) ui(W); };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  }

  function ui(W) {
    const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m));
    const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
    const lang = () => (W.LQI18N && (W.LQI18N.lang === "en" || W.LQI18N.lang === "zh") ? W.LQI18N.lang : "th");
    const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    const raw = s => `<span translate="no">${esc(s)}</span>`;
    /** @type {any} */
    const st = { busy: false, text: "", res: null, removed: [], notice: "", why: "", offer: null, via: "", preview: null, ready: false, whyCapture: false };
    W.__LQ_PCAI = { st };
    // closed test (lensiq-tester.js): with the tester gate on, the step exists only for a visitor who entered the code
    const api = () => !!(W.LQApi && W.LQApi.enabled && W.LQApi.enabled() && W.LQAI && W.LQPCGuard && (!W.LQTester || W.LQTester.unlocked()));
    const pcl = () => (W.__LQ_PCL && W.__LQ_PCL.st) || {};
    const KIND = () => ({ name: T("md.pc.ai.k.name", "ชื่อ"), hn: T("md.pc.ai.k.hn", "เลขผู้ป่วย (HN)"), phone: T("md.pc.ai.k.phone", "เบอร์โทร"),
      id: T("md.pc.ai.k.id", "เลขบัตรประชาชน"), email: T("md.pc.ai.k.email", "อีเมล"), dob: T("md.pc.ai.k.dob", "วันเกิด"), address: T("md.pc.ai.k.address", "ที่อยู่") });
    const NOTE = () => ({
      guard: T("md.pc.ai.n.guard", "ไม่ได้ส่งภาพ เพราะบนฉลากอาจมีชื่อหรือข้อมูลส่วนตัว ส่งเฉพาะข้อความที่ลบส่วนที่พบแล้ว"),
      faceTextOnly: T("md.pc.ai.n.face", "ไม่ได้ส่งภาพ เพราะตัวหาใบหน้าบนเครื่องนี้ทำงานไม่ได้ ส่งเฉพาะข้อความแทน"),
      cancelled: T("md.pc.ai.n.back", "ไม่ได้ส่งภาพ (คุณกดกลับ) ส่งเฉพาะข้อความแทน"),
      empty: T("md.pc.ai.n.empty", "ยังไม่มีข้อความจากฉลากให้ส่ง อ่านฉลากก่อน"),
      declined: T("md.pc.ai.n.declined", "ไม่ได้ส่งอะไรออกไป คุณยังเห็นผลจากในเครื่องตามเดิม"),
      dispOff: T("md.pc.ai.n.dispOff", "ข้อความนี้ดูเหมือนฉลากยาที่จ่ายให้ผู้ป่วยหรือใบสั่งยา จึงไม่ส่งให้ AI (ทั้งข้อความและภาพ) ผลตรวจในเครื่องด้านบนยังใช้ได้ตามเดิม"),
      personalDoc: T("md.pc.ai.n.personalDoc",
        "ข้อความนี้ดูเหมือนเอกสารส่วนบุคคล (เช่น ใบปะหน้าพัสดุ ใบสั่งซื้อ ใบเสร็จ ใบรับรองแพทย์ ใบนัด หรือจดหมาย) ไม่ใช่ฉลากสินค้า จึงปิด AI สำหรับภาพนี้ ไม่ส่งทั้งข้อความและภาพ ผลตรวจในเครื่องด้านบนยังใช้ได้ตามเดิม"
      ),
      noProduct: T("md.pc.ai.n.noProduct",
        "ข้อความนี้ดูไม่เหมือนฉลากสินค้า (ไม่พบเลขทะเบียน บาร์โค้ด ส่วนประกอบ หรือข้อมูลอื่นบนฉลาก) จึงปิด AI สำหรับภาพนี้ ไม่ส่งทั้งข้อความและภาพ ผลตรวจในเครื่องด้านบนยังใช้ได้ตามเดิม"
      )
    });
    /** Barcodes and registration numbers this device read for the capture (never the photo). */
    const facts = () => captureFacts(W.LQPC, pcl().text, pcl().codes);
    /** THE decision for both modes: product-label evidence, no personal-document sign, not a dispensing label. @param {string} text */
    const gate = text => W.LQPCGuard.aiGate(text, facts(), { dispensingAI: dispPolicy() });
    /** @param {string} reason aiGate reason @param {boolean} [capture] the capture itself was refused (not an edit in the preview) */
    const refuse = (reason, capture) => { st.notice = NOTE()[gateNote(reason)] || NOTE().noProduct; st.why = reason; st.ready = false; st.whyCapture = !!capture; };
    const gopt = () => (W.LENSIQ_PC_COMPANY_PHONES === "remove" ? { companyPhones: "remove" } : undefined);
    const dispPolicy = () => (W.LENSIQ_PC_DISPENSING_AI === "off" || W.LENSIQ_PC_DISPENSING_AI === "text-preview" ? W.LENSIQ_PC_DISPENSING_AI
      : W.LQPCGuard.DEFAULTS.dispensingAI || "off");
    /** The mandatory text preview. Resolves the exact text to send, or null (not sent). @param {any} g redact() result @param {boolean} open */
    /** The original on-device OCR output of the label: the only source text may come from (option b). */
    const ocrText = () => (W.__LQ_PC && W.__LQ_PC.st && W.__LQ_PC.st.ocr ? String(W.__LQ_PC.st.ocr.text || "") : "");
    function previewText(g, open) {
      const ocr = ocrText();
      // words that are not on the label (e.g. typed into the OCR text box above) are shown struck through and never sent
      const f = W.LQPCGuard.provenance(g.text, ocr);
      return new Promise(resolve => { st.preview = { text: g.text, ocr, removed: g.removed, open: open || f.dropped.length > 0, warn: "", resolve }; paint(); });
    }
    function closePreview(/** @type {string|null} */ v) {
      const p = st.preview;
      if (!p) return;
      st.preview = null;
      p.resolve(v);
    }
    function previewSend() {
      const p = st.preview, ta = /** @type {HTMLTextAreaElement|null} */ (document.querySelector("#pcAiPrevEdit"));
      if (!p) return;
      const typed = ta ? ta.value : p.text;
      // option b: anything not on the label is dropped (the view already shows it struck through)
      const v = W.LQPCGuard.provenance(typed, p.ocr).text;
      if (!v.trim()) { p.text = typed; p.warn = T("md.pc.ai.prevEmpty", "ไม่มีข้อความให้ส่ง"); paint(); return; }
      const again = W.LQPCGuard.redact(v, gopt());
      if (again.count) { // the user typed or left personal data: remove it and show the text again (never sent unseen)
        p.text = again.text; p.removed = p.removed.concat(again.removed); p.open = true;
        p.warn = T("md.pc.ai.prevAgain", "พบข้อมูลส่วนตัวเพิ่มในข้อความที่แก้ จึงลบออกแล้ว ตรวจอีกครั้งก่อนส่ง"); paint(); return;
      }
      // the edited text is decided again: still a product label, no personal-document sign, not a dispensing label
      const g2 = gate(v);
      if (!g2.allow) { closePreview(null); refuse(g2.reason); return; }
      closePreview(v);
    }
    const ph = (/** @type {string} */ t) => esc(t).split(esc(W.LQPCGuard.PLACEHOLDER)).join(`<mark data-removed>${esc(W.LQPCGuard.PLACEHOLDER)}</mark>`);
    /** Preview text: removed parts marked; words NOT on the label struck through (not sent); POSSIBLE names underlined
     *  (not removed; the user decides). @param {string} t @param {string} [ocr] */
    const marked = (t, ocr) => {
      const dropped = W.LQPCGuard.provenance(t, ocr == null ? (st.preview ? st.preview.ocr : "") : ocr).dropped.map((/** @type {any} */ d) => ({ ...d, k: "d" }));
      const maybe = (W.LQPCGuard.possibleNames ? W.LQPCGuard.possibleNames(t) : []).filter((/** @type {any} */ m) => !dropped.some((/** @type {any} */ d) => m.start < d.end && d.start < m.end))
        .map((/** @type {any} */ m) => ({ ...m, k: "m" }));
      const spans = dropped.concat(maybe).sort((a, b) => a.start - b.start);
      const tipM = esc(T("md.pc.ai.maybeTitle", "ตรวจ: อาจเป็นชื่อคน")), tipD = esc(T("md.pc.ai.notSent", "ไม่ส่ง: ไม่มีบนฉลาก"));
      let out = "", at = 0;
      for (const x of spans) {
        out += ph(t.slice(at, x.start)) + (x.k === "d" ? `<del data-dropped title="${tipD}">${esc(t.slice(x.start, x.end))}</del>`
          : `<mark data-maybe title="${tipM}" style="background:transparent;color:inherit;border-bottom:2px dashed currentColor">${esc(t.slice(x.start, x.end))}</mark>`);
        at = x.end;
      }
      return out + ph(t.slice(at));
    };
    const droppedHint = (/** @type {string} */ t) => (st.preview && W.LQPCGuard.provenance(t, st.preview.ocr).dropped.length
      ? T("md.pc.ai.droppedHint", "ข้อความที่ขีดฆ่าจะไม่ถูกส่ง เพราะไม่มีบนฉลากที่อ่านได้ ส่งได้เฉพาะข้อความจากฉลาก") : "");
    const maybeHint = (/** @type {string} */ t) => (W.LQPCGuard.possibleNames && W.LQPCGuard.possibleNames(t).length
      ? T("md.pc.ai.maybeHint", "ส่วนที่ขีดเส้นประอาจเป็นชื่อคนที่ระบบไม่ได้ลบ ตรวจ ถ้าใช่ให้ลบออกในช่องด้านล่างก่อนส่ง") : "");

    async function toImage(blob) {
      const url = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(blob); });
      let w = 0, h = 0;
      if (typeof createImageBitmap === "function") { const b = await createImageBitmap(blob); w = b.width; h = b.height; if (b.close) b.close(); }
      return { mime: "image/jpeg", base64: String(url).split(",")[1] || "", width: w, height: h };
    }

    /** @param {boolean} [forceText] */
    async function ask(forceText) {
      if (st.busy || !api()) return;
      const text = String(pcl().text || "").trim();
      st.offer = null; st.notice = ""; st.via = ""; st.why = ""; st.ready = false;
      const disp = W.LQPCGuard.isDispensingLabel(text);
      // no product-label evidence, signs of a personal document, or a dispensing label (setting "off"): no consent screen,
      // nothing sent (text or photo), the on-device results stay
      const g0 = gate(text);
      if (!g0.allow) { refuse(g0.reason, true); st.res = null; paint(); return; }
      const g = W.LQPCGuard.redact(text, gopt()), img = W.LQPCGuard.imageCheck(text, gopt());
      st.busy = true; paint();
      try {
        const c = await W.LQAI.ensureConsentGroup(GROUP, FEATURES, LABELS, forceText ? { mode: "text" } : undefined);
        if (!c) { st.notice = NOTE().declined; return; }
        const d = decide({ mode: c.mode, image: img, features: c.info.features });
        if (d.offer) { st.offer = { c, g, img }; return; } // image blocked: the user chooses text only (after the preview) or nothing
        // mandatory text preview: open when anything was removed, the text looks like a dispensing label, or nothing is
        // remembered; collapsed (one tap away) only for a clean product text with a remembered choice
        const v = await previewText(g, g.count > 0 || disp || !c.remembered);
        if (v == null) { if (!st.notice) st.notice = NOTE().declined; return; }
        let images = null, mode = d.send, via = "";
        if (mode === "image") {
          const up = W.__LQ_PC && W.__LQ_PC.prepareUpload ? await W.__LQ_PC.prepareUpload() : { textOnly: true, reason: "error" };
          if (up && up.blob) images = [await toImage(up.blob)];
          else { mode = "text"; via = up && up.textOnly ? "faceTextOnly" : "cancelled"; }
        }
        await sendAll(c, mode, v, g.removed, images, via);
      } finally { st.busy = false; paint(); }
    }
    /** @param {any} c @param {string} mode @param {string} text EXACTLY what the preview showed @param {any[]} removed */
    async function sendAll(c, mode, text, removed, images, via) {
      st.via = via || "";
      if (!text.trim() && !images) { st.notice = NOTE().empty; return; }
      const feats = c.info.features, P = pcl(), out = {}, fx = facts();
      const script = W.__LQ_PC && W.__LQ_PC.st ? W.__LQ_PC.st.script : "th";
      const tgt = translateTarget(text, lang());
      const jobs = [];
      if (feats.includes("pc_fields")) jobs.push(W.LQAI.send("pc_fields", c.info, mode, mode === "image" ? { text, script, images, ...fx } : { text, script, ...fx }).then(r => { out.fields = r; }));
      if (feats.includes("pc_claims") && text.trim()) jobs.push(W.LQAI.send("pc_claims", c.info, "text", { text,
        category: (P.local && P.local.category) || undefined, ...fx }).then(r => { out.claims = r; }));
      if (feats.includes("pc_translate") && tgt && text.trim()) jobs.push(W.LQAI.send("pc_translate", c.info, "text", { text, target: tgt, ...fx }).then(r => { out.translate = r; }));
      await Promise.all(jobs);
      st.res = { ...out, mode, sentText: text };
      st.removed = removed;
      st.text = String(P.text || "");
    }
    async function acceptOffer() {
      if (!st.offer || st.busy) return;
      const { c, g } = st.offer;
      st.offer = null; st.busy = true; paint();
      try {
        const v = await previewText(g, true);
        if (v == null) { if (!st.notice) st.notice = NOTE().declined; return; }
        await sendAll(c, "text", v, g.removed, null, "guard");
      } finally { st.busy = false; paint(); }
    }
    W.__LQ_PCAI.ask = ask;

    function paint() {
      const slot = document.querySelector("#pcAiSlot");
      if (!slot) return;
      if (!api() || !String(pcl().text || "").trim()) { slot.innerHTML = ""; return; }
      // refused for lack of product evidence, and the capture now shows it (a barcode was decoded, another side was read):
      // the refusal goes, the user is told AI can be asked now. Nothing is sent here.
      if (st.why === "no-product" && st.whyCapture && !st.busy && gate(String(pcl().text || "").trim()).allow) { st.notice = ""; st.why = ""; st.ready = true; }
      const cs = W.LQAI.consentState(GROUP);
      const modeName = m => (m === "image" ? T("md.pc.ai.mImage", "ภาพถ่ายสินค้า (เบลอใบหน้าก่อนส่ง)") : T("md.pc.ai.mText", "ข้อความเท่านั้น"));
      let h = `<div class="pc-ai" id="pcAi"><h4>${esc(T("md.pc.ai.h", "ขอความเห็นจาก AI (ไม่บังคับ)"))}</h4>` +
        `<p class="hint" id="pcAiNeeds">${esc(T("md.pc.ai.needs",
          "AI ใช้ได้เฉพาะกับฉลากสินค้า และต้องเป็นด้านที่มีเลขทะเบียน รายการส่วนประกอบ หรือบาร์โค้ด ด้านหน้ากล่องที่มีแต่ชื่อสินค้ามักไม่พอ"
        ))}</p>` +
        `<p class="hint">${esc(T("md.pc.ai.lead", "ส่งเฉพาะเมื่อคุณยินยอม เลือกได้ว่าจะส่งข้อความที่อ่านได้ (ค่าเริ่มต้น) หรือภาพถ่ายสินค้าที่เบลอใบหน้าแล้ว ระบบลบชื่อ เลขผู้ป่วย เบอร์โทร และเลขบัตรออกก่อนส่ง ผลจาก AI เป็นค่าประมาณ ไม่แทนผลในเครื่องหรือแหล่งข้อมูลทางการ"))}</p>`;
      if (cs.state) h += `<p class="hint" id="pcAiState" data-state="${esc(cs.state)}" data-mode="${esc(cs.mode)}">${esc(cs.state === "remembered"
        ? T("md.pc.ai.remembered", "จำการเลือกไว้ในเครื่องนี้: {m}", { m: modeName(cs.mode) }) : T("md.pc.ai.session", "การเลือกครั้งนี้: {m} (จนกว่าจะปิดหน้านี้)", { m: modeName(cs.mode) }))}</p>`;
      h += `<div class="md-row"><button class="btn primary" type="button" id="pcAiGo"${st.busy ? " disabled" : ""}>${esc(st.busy ? T("md.pc.ai.busy", "กำลังขอความเห็นจาก AI…")
        : T("md.pc.ai.go", "ขอความเห็นจาก AI"))}</button>` +
        (cs.mode === "image" ? `<button class="btn ghost" type="button" id="pcAiText"${st.busy ? " disabled" : ""}>${esc(T("md.pc.ai.textOnce", "ส่งเฉพาะข้อความครั้งนี้"))}</button>` : "") +
        (cs.state ? `<button class="btn ghost small" type="button" id="pcAiWithdraw">${esc(T("md.pc.ai.withdraw", "ถอนความยินยอม / เลิกจำการเลือก"))}</button>` : "") + `</div>`;
      if (st.offer) {
        const k = KIND();
        h += `<div class="md-cand" id="pcAiOffer"><p class="md-status" data-kind="warn">` +
          `${esc(st.offer.g.count ? T("md.pc.ai.offerH", "ไม่ส่งภาพนี้: บนฉลากมีชื่อหรือข้อมูลส่วนตัว {n} จุด", { n: st.offer.g.count })
            : T("md.pc.ai.offerLabel", "ไม่ส่งภาพนี้: ดูเหมือนฉลากยาที่จ่ายให้ผู้ป่วยหรือใบสั่งยา ซึ่งอาจมีชื่อคนที่ระบบหาไม่พบ"))}</p>` +
          (st.offer.g.count ? `<ul class="md-list">${st.offer.g.removed.map(r => `<li>${esc(k[r.kind] || r.kind)}: ${raw(r.text)}</li>`).join("")}</ul>` : "") +
          `<p class="hint">${esc(T("md.pc.ai.offerT", "ส่งเฉพาะข้อความโดยลบส่วนเหล่านี้ออกได้ หรือไม่ส่งเลย"))}</p><div class="md-row">` +
          `<button class="btn primary" type="button" id="pcAiOfferGo">${esc(st.offer.g.count ? T("md.pc.ai.offerGo", "ส่งเฉพาะข้อความ (ลบ {n} จุดแล้ว)", { n: st.offer.g.count })
            : T("md.pc.ai.offerGo0", "ส่งเฉพาะข้อความ"))}</button>` +
          `<button class="btn ghost" type="button" id="pcAiOfferNo">${esc(T("md.pc.ai.offerNo", "ไม่ส่ง"))}</button></div></div>`;
      }
      if (st.preview) {
        const p = st.preview, k = KIND();
        h += `<div class="md-cand" id="pcAiPreview" data-open="${p.open ? 1 : 0}"><p class="md-status"${p.removed.length ? ' data-kind="warn"' : ""}>` +
          `${esc(T("md.pc.ai.prevH", "ตรวจข้อความที่จะส่งก่อน ยังไม่มีการส่งจนกว่าจะกด \"ส่งข้อความนี้\""))}</p>` +
          `<p class="hint">${esc(T("md.pc.ai.ocrOnly", "ส่งได้เฉพาะข้อความที่อ่านจากฉลากเท่านั้น ลบหรือแก้คำที่อ่านผิดได้ แต่คำที่พิมพ์เพิ่มจะไม่ถูกส่ง"))}</p>` +
          `<details id="pcAiPrevDetails"${p.open ? " open" : ""}><summary>${esc(T("md.pc.ai.prevShow", "ดูและแก้ข้อความที่จะส่ง"))}</summary>` +
          `<p class="hint">${esc(T("md.pc.ai.prevHint", "ส่วนที่ไฮไลต์ถูกลบออกบนเครื่องนี้แล้ว แก้หรือลบเพิ่มได้ก่อนส่ง ข้อความในช่องนี้คือสิ่งที่จะส่งทั้งหมด"))}</p>` +
          (p.removed.length ? `<p class="hint">${esc(T("md.pc.ai.removed", "ลบออกก่อนส่ง {n} จุด (อยู่ในเครื่องนี้เท่านั้น):", { n: p.removed.length }))}</p>` +
            `<ul class="md-list" id="pcAiPrevRemoved">${p.removed.map((/** @type {any} */ x) =>
              `<li data-kind="${esc(x.kind)}">${esc(k[x.kind] || x.kind)}: ${raw(x.text)}</li>`).join("")}</ul>` : "") +
          `<div id="pcAiPrevView" translate="no" style="white-space:pre-wrap;overflow-wrap:anywhere">${marked(p.text)}</div>` +
          `<p class="md-status" data-kind="warn" id="pcAiPrevMaybe"${maybeHint(p.text) ? "" : " hidden"}>${esc(maybeHint(p.text))}</p>` +
          `<p class="md-status" data-kind="warn" id="pcAiPrevDropped"${droppedHint(p.text) ? "" : " hidden"}>${esc(droppedHint(p.text))}</p>` +
          (facts().gtins.length ? `<p class="hint" id="pcAiPrevCodes">${esc(T("md.pc.ai.prevCodes",
            "เลขบาร์โค้ดของสินค้าที่อ่านได้ ({n} รหัส) จะส่งไปที่เซิร์ฟเวอร์ LENSIQ พร้อมข้อความ เพื่อยืนยันว่าเป็นฉลากสินค้า ไม่ส่งต่อให้ผู้ให้บริการ AI", { n: facts().gtins.length }))}</p>` : "") +
          `<label class="md-field"><span>${esc(T("md.pc.ai.prevEditL", "แก้ข้อความที่จะส่ง"))}</span>` +
          `<textarea id="pcAiPrevEdit" rows="6" translate="no" spellcheck="false"></textarea></label></details>` +
          (p.warn ? `<p class="md-status" data-kind="warn" id="pcAiPrevWarn">${esc(p.warn)}</p>` : "") +
          `<div class="md-row"><button class="btn primary" type="button" id="pcAiPrevSend">${esc(T("md.pc.ai.prevSend", "ส่งข้อความนี้"))}</button>` +
          `<button class="btn ghost" type="button" id="pcAiPrevCancel">${esc(T("md.pc.ai.prevCancel", "ไม่ส่ง"))}</button></div></div>`;
      }
      if (st.notice) h += `<p class="md-status" data-kind="warn" id="pcAiNotice"${st.why ? ` data-reason="${esc(st.why)}"` : ""}>${esc(st.notice)}</p>`;
      // the next step, ONLY when the refusal is "no product evidence" (never for a personal document or a dispensing label)
      if (st.notice && st.why === "no-product" && st.whyCapture) h += `<div class="md-cand" id="pcAiGuide"><p class="hint"><strong>${esc(T("md.pc.ai.guideH", "ทำอย่างไรต่อ"))}</strong> ` +
        `${esc(T("md.pc.ai.guideT", "ถ่ายด้านของฉลากที่มีเลขทะเบียน (เช่น เลข อย.) หรือรายการส่วนประกอบ หรือสแกนบาร์โค้ดของสินค้า แล้วกดขอความเห็นจาก AI อีกครั้ง"))}</p>` +
        `<div class="md-row"><button class="btn" type="button" id="pcAiGuideBar">${esc(T("md.pc.ai.guideBar", "สแกนบาร์โค้ดในภาพนี้"))}</button>` +
        `<button class="btn ghost" type="button" id="pcAiGuideShot">${esc(T("md.pc.ai.guideShot", "ถ่ายอีกด้านของฉลาก"))}</button></div></div>`;
      if (st.ready && !st.notice) h += `<p class="md-status" data-kind="ok" id="pcAiReady">${esc(T("md.pc.ai.ready",
        "พบข้อมูลฉลากสินค้าแล้ว กด \"ขอความเห็นจาก AI\" ได้ ยังไม่มีการส่งอะไรจนกว่าคุณจะกด"
      ))}</p>`;
      const r = st.res && st.text === String(pcl().text || "") ? st.res : null;
      if (r) h += results(r);
      h += `</div>`;
      slot.innerHTML = h;
      const ta = /** @type {HTMLTextAreaElement|null} */ (slot.querySelector("#pcAiPrevEdit"));
      if (ta && st.preview) ta.value = st.preview.text;
    }
    W.__LQ_PCAI.paint = paint;

    function fbLine(x) { return `<p class="md-status" data-kind="warn" data-fb="${esc(x.reason)}">${esc(x.message)}</p>`; }
    function by(x) { return `<p class="hint" data-by>${esc(T("md.pc.ai.estimate", "ค่าประมาณจาก AI อาจผิดได้"))} · ${esc(x.checkedBy || "")}</p>`; }
    function results(r) {
      const k = KIND(), lg = lang();
      let h = `<div id="pcAiOut" data-mode="${esc(r.mode)}">`;
      h += `<p class="hint" id="pcAiSent">${esc(r.mode === "image" ? T("md.pc.ai.sentImage", "ส่งแล้ว: ข้อความที่อ่านได้ และภาพสินค้าที่เบลอใบหน้าแล้วซึ่งคุณกดยืนยัน")
        : T("md.pc.ai.sentText", "ส่งแล้ว: เฉพาะข้อความที่อ่านได้ ไม่ส่งภาพ"))}</p>`;
      if (st.via && NOTE()[st.via]) h += `<p class="md-status" data-kind="warn" id="pcAiVia" data-via="${esc(st.via)}">${esc(NOTE()[st.via])}</p>`;
      if (st.removed.length) h += `<div id="pcAiRemoved"><p class="hint">${esc(T("md.pc.ai.removed", "ลบออกก่อนส่ง {n} จุด (อยู่ในเครื่องนี้เท่านั้น):", { n: st.removed.length }))}</p>` +
        `<ul class="md-list">${st.removed.map(x => `<li data-kind="${esc(x.kind)}">${esc(k[x.kind] || x.kind)}: ${raw(x.text)}</li>`).join("")}</ul></div>`;
      // label fields
      if (r.fields) {
        h += `<h5>${esc(T("md.pc.ai.fieldsH", "ข้อมูลบนฉลากที่ AI อ่านได้"))}</h5>`;
        if (!r.fields.ok) h += fbLine(r.fields);
        else {
          const j = r.fields.json, P = W.LQPC, dev = P && P.findRegNumbers ? P.findRegNumbers(String(pcl().text || "")).map(x => x.norm) : [];
          const rows = [];
          const add = (key, th, v) => { if (v != null && String(v).trim()) rows.push(`<dt>${esc(T(key, th))}</dt><dd>${raw(v)}</dd>`); };
          add("md.pc.ai.f.brand", "ยี่ห้อ", j.brand); add("md.pc.ai.f.name", "ชื่อสินค้า", j.product_name);
          add("md.pc.ai.f.ing", "ส่วนประกอบสำคัญ", (j.active_ingredients || []).map(x => [x.name_on_pack, x.strength, x.unit].filter(Boolean).join(" ")).join(" · "));
          add("md.pc.ai.f.form", "รูปแบบ", j.dosage_form); add("md.pc.ai.f.maker", "ผู้ผลิต", j.manufacturer); add("md.pc.ai.f.lot", "เลขที่ผลิต / ล็อต", j.lot);
          add("md.pc.ai.f.exp", "วันหมดอายุ (ตามที่ AI อ่าน)", j.expiry);
          h += `<dl class="md-kv" id="pcAiFields">${rows.join("")}</dl>`;
          const regs = regAgree(j.registration, dev);
          if (regs.length) h += `<ul class="md-list" id="pcAiRegs">${regs.map(x => `<li data-source="${esc(x.source)}" data-agree="${x.agree ? 1 : 0}">${raw(x.number)} · ` +
            `${esc(x.agree ? T("md.pc.ai.regAgree", "ตรงกับเลขที่อ่านได้บนเครื่องนี้") : x.source === "ocr" ? T("md.pc.ai.regOcr", "อยู่ในข้อความที่อ่านได้")
              : T("md.pc.ai.regModel", "AI อ่านได้ แต่ไม่อยู่ในข้อความที่อ่านบนเครื่อง เทียบกับกล่องเอง"))}</li>`).join("")}</ul>`;
          h += by(r.fields);
        }
      }
      // over-claims: AI signals apart from the on-device rules, with agreement
      if (r.claims) {
        h += `<h5>${esc(T("md.pc.ai.claimsH", "สัญญาณเสี่ยงคำโฆษณาเกินจริงที่ AI พบ (แยกจากผลในเครื่อง)"))}</h5>`;
        if (!r.claims.ok) h += fbLine(r.claims);
        else {
          const sig = r.claims.json.signals || [], dev = ((pcl().local && pcl().local.claims) || []).filter(c => !c.absence);
          const a = agreement(sig, dev);
          h += `<p class="md-status" id="pcAiAgree" data-both="${a.both.length}" data-ai="${a.aiOnly.length}" data-dev="${a.deviceOnly.length}">${esc(T("md.pc.ai.agree",
            "ตรงกับตัวตรวจในเครื่อง {b} กฎ · AI พบเพิ่ม {a} กฎ · ตัวตรวจในเครื่องพบแต่ AI ไม่พบ {d} กฎ", { b: a.both.length, a: a.aiOnly.length, d: a.deviceOnly.length }))}</p>`;
          const C = W.LQClaims;
          if (sig.length) h += `<ul class="md-list" id="pcAiClaims">${sig.map(s => `<li data-rule="${esc(s.rule_id)}" data-agree="${a.both.includes(s.rule_id) ? 1 : 0}">` +
            `<q translate="no">${esc(s.evidence)}</q> · ${esc((C && C.explain && C.explain(s.rule_id)[lg]) || s.rule_id)} · ${esc(a.both.includes(s.rule_id)
              ? T("md.pc.ai.both", "ตัวตรวจในเครื่องพบด้วย") : T("md.pc.ai.aiOnly", "AI พบอย่างเดียว"))}</li>`).join("")}</ul>`;
          else h += `<p class="hint" id="pcAiClaimsNone">${esc(T("md.pc.ai.claimsNone", "AI ไม่พบคำที่เข้าข่ายกฎ (ไม่ใช่คำรับรอง)"))}</p>`;
          if (a.deviceOnly.length) h += `<p class="hint" id="pcAiDevOnly">${esc(T("md.pc.ai.devOnly", "ตัวตรวจในเครื่องพบแต่ AI ไม่พบ:"))} ${raw(a.deviceOnly.join(", "))}</p>`;
          h += by(r.claims);
        }
      }
      if (r.translate) {
        h += `<h5>${esc(T("md.pc.ai.trH", "คำแปลฉลากโดย AI"))}</h5>`;
        if (!r.translate.ok) h += fbLine(r.translate);
        else {
          h += `<dl class="md-kv" id="pcAiTr">${(r.translate.json.lines || []).map(l => `<dt>${raw(l.source)}</dt><dd translate="no">${esc(l.translation)}</dd>`).join("")}</dl>` +
            `<p class="hint">${esc(T("md.pc.ai.trNote", "คำแปลอาจผิด ฉลากต้นฉบับและเภสัชกรสำคัญกว่าเสมอ"))}</p>` + by(r.translate);
        }
      }
      return h + `</div>`;
    }

    document.addEventListener("click", e => {
      const t = /** @type {any} */ (e.target);
      if (!t || !t.closest) return;
      if (t.closest("#pcAiGo")) ask(false);
      else if (t.closest("#pcAiText")) ask(true);
      else if (t.closest("#pcAiWithdraw")) { W.LQAI.withdraw(GROUP); paint(); const b = /** @type {HTMLElement | null} */ (document.querySelector("#pcAiGo")); if (b) b.focus(); }
      else if (t.closest("#pcAiOfferGo")) acceptOffer();
      else if (t.closest("#pcAiOfferNo")) { st.offer = null; st.why = ""; st.notice = NOTE().declined; paint(); }
      else if (t.closest("#pcAiPrevSend")) previewSend();
      // one tap to the page's own controls (nothing is sent): the barcode scan of the current picture, or the camera
      else if (t.closest("#pcAiGuideBar")) { const b = /** @type {HTMLElement | null} */ (document.querySelector("#pcBar")); if (b) b.click(); }
      else if (t.closest("#pcAiGuideShot")) {
        const b = /** @type {HTMLElement | null} */ (document.querySelector("#pcCamBtn"));
        if (b) { b.click(); b.focus(); if (b.scrollIntoView) b.scrollIntoView({ block: "center" }); }
      }
      else if (t.closest("#pcAiPrevCancel")) { closePreview(null); st.why = ""; st.notice = NOTE().declined; }
    });
    document.addEventListener("input", e => { // the highlighted view follows the edits; the edit survives a repaint
      const t = /** @type {any} */ (e.target);
      if (!t || t.id !== "pcAiPrevEdit" || !st.preview) return;
      st.preview.text = t.value;
      const v = document.querySelector("#pcAiPrevView");
      if (v) v.innerHTML = marked(t.value);
      const h = /** @type {HTMLElement|null} */ (document.querySelector("#pcAiPrevMaybe"));
      if (h) { const x = maybeHint(t.value); h.textContent = x; h.hidden = !x; }
      const d = /** @type {HTMLElement|null} */ (document.querySelector("#pcAiPrevDropped"));
      if (d) { const x = droppedHint(t.value); d.textContent = x; d.hidden = !x; }
    });
    W.addEventListener("lq-pc-card", paint);
    W.addEventListener("lq-lang", paint);
    W.addEventListener("lq-tester", paint);
    W.addEventListener("pagehide", () => { st.res = null; st.removed = []; st.offer = null; st.text = ""; st.ready = false; closePreview(null); });
  }

  return { agreement, decide, gateNote, captureFacts, translateTarget, regAgree, mount, GROUP, FEATURES, LABELS };
});
