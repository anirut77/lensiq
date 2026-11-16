/* fortune-print.js — the paper report for every fortune result (owner order 2026-11-16, testers item B "print layout").
 * ONE renderer, used by the print button today and by the paid PDF report later:
 *
 *   LQPrint.render(model, { size: "A4" | "A5" | "80mm" | "auto", paid: false })  ->  HTML string (pure; also runs in Node)
 *   LQPrint.fromDom(rootEl, { lang, page, include })                              ->  model read from a result on screen
 *   LQPrint.mount(model, opts)                                                    ->  #lqPrint in the page (browser)
 *   LQPrint.print({ button, size, include })                                      ->  builds the report and opens the print dialog
 *
 * The model is plain data, so the paid PDF can build one straight from its composer (no screen DOM needed):
 *   { page, lang, title, date, name?, birth?, link, sections: [{ level: 1|2|3, heading, blocks: [...] }] }
 *   blocks: { t: "p", text, caution? } | { t: "list", ordered?, items: [{ label?, text, sw?: [{hex, name}] }] }
 *           | { t: "table", caption?, rows: [[{ text, head?, sw? }]] } | { t: "figure", src | svg, alt?, w? }
 *           | { t: "advice", icons: ["colour"|"worship"|"respect"|"direction"], sw: [{hex, name}], note? }
 *
 * Paper (fortune-print.css): a running header on every page (LENSIQ mark, report title, the person's name only when they
 * typed one AND ticked "include", date), section headings that never end a page (heading + first block kept together,
 * break-after: avoid), list items / table rows never split, short lists in two columns, every icon and colour swatch with a
 * text label (reads in black and white), a footer with the disclaimer line on every page and "หน้า X / Y" (CSS @page margin
 * box). A4 and A5 portrait come from the same rules (narrow paper drops to one column); 80 mm receipt (kiosk) is its own style.
 * No buttons, menus, banners, help controls, forms, the camera photo or the in-page menu ever reach the paper.
 * Crisis: render() / mount() / print() refuse while the crisis flag, the calm session or distress words are on the page
 * (LQShare.allowed = LQFortuneCrisis.allow + distress), and a model marked crisis renders nothing.
 * Loaded lazily by fortune-share.js (with fortune-print.css) once a result is on screen and the page was used; never in the
 * first page load (speed budget unchanged). Tests: tests/unit/fortune-print.test.js, tests/e2e/fortune-print-report-*.e2e.mjs.
 * Docs: docs/FORTUNE-PRINT-REPORT.md. */
(function (root) {
  "use strict";
  const NODE = typeof module !== "undefined" && module.exports && typeof require === "function";
  const share = () => (NODE ? require("./fortune-share.js") : root.LQShare) || null;
  const langOf = l => (l === "en" || l === "zh" ? l : "th");

  /* ---------- words (TH / EN / ZH) ---------- */
  const W = {
    th: { report: "รายงานคำทำนาย", paid: "รายงานฉบับเต็ม", forName: "สำหรับ", born: "เกิด", made: "สร้างจาก", page: "หน้า",
      icon: { colour: "สีมงคล", worship: "การบูชา", respect: "การเคารพ", direction: "ทิศมงคล" }, colour: "สี" },
    en: { report: "Reading report", paid: "Full report", forName: "For", born: "Born", made: "Made with", page: "Page",
      icon: { colour: "Colour", worship: "Worship", respect: "Respect", direction: "Direction" }, colour: "Colour" },
    zh: { report: "解读报告", paid: "完整报告", forName: "姓名", born: "出生", made: "生成自", page: "页",
      icon: { colour: "颜色", worship: "供奉", respect: "敬重", direction: "方位" }, colour: "颜色" },
  };
  // "หน้า X / Y" in the page's language (CSS @page margin box; Chrome prints it, other browsers leave it out)
  const PAGE_NO = {
    th: '"หน้า " counter(page) " / " counter(pages)',
    en: '"Page " counter(page) " / " counter(pages)',
    zh: '"第 " counter(page) " / " counter(pages) " 页"',
  };
  const SIZES = {
    A4: { cls: "a4", page: "size:A4 portrait;margin:12mm 14mm 13mm" },
    A5: { cls: "a5", page: "size:A5 portrait;margin:10mm 10mm 11mm" },
    "80mm": { cls: "r80", page: "size:80mm 297mm;margin:4mm 3mm 7mm" },
    auto: { cls: "auto", page: "margin:12mm 13mm 13mm" },
  };
  const FONT = {
    // the device's own Thai UI font with ligatures off: its text stays copyable / searchable in the PDF (decision of the
    // share-print branch, kept); Chinese and English use the system sans
    th: "Tahoma,'Leelawadee UI',Thonburi,'Noto Sans Thai',Loma,Garuda,sans-serif",
    en: "'Helvetica Neue',Helvetica,Arial,'Liberation Sans',sans-serif",
    zh: "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans CJK SC','Noto Sans SC',sans-serif",
  };
  // the LENSIQ mark (same drawing as nav.js); dark square + white corners print in black and white as they are
  const MARK = '<svg class="lqp-mark-svg" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="7" fill="#111"/>' +
    '<path d="M8 12V8h4M24 12V8h-4M8 20v4h4M24 20v4h-4" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="16" cy="16" r="3.6" fill="#fff"/></svg>';
  // icons: the same hand-drawn shapes as fortune-read.js (MIT, own work), stroke = currentColor (black on paper)
  const ICON_PATH = {
    colour: '<path d="M12 3.5c-4.9 0-8.5 3.6-8.5 8.1 0 4.4 3.6 8.4 8.2 8.4 1.2 0 1.8-.7 1.8-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.6 1.6-1.6h1.9c2.7 0 4.5-1.9 4.5-4.4 0-3.7-3.8-6.5-8.5-6.5z"/><circle cx="7.6" cy="11.3" r="1.2"/><circle cx="10.4" cy="7.6" r="1.2"/><circle cx="14.8" cy="7.8" r="1.2"/>',
    worship: '<path d="M12 5c1.9 2.1 2.6 4.5 2 7.6-.4 1.9-1.1 3.2-2 4.4-.9-1.2-1.6-2.5-2-4.4C9.4 9.5 10.1 7.1 12 5z"/><path d="M10 16.8c-2.7-.4-4.9-2.1-6-4.8 2.4-.4 4.4.1 5.8 1.3M14 16.8c2.7-.4 4.9-2.1 6-4.8-2.4-.4-4.4.1-5.8 1.3"/><path d="M5 19.5h14"/>',
    respect: '<path d="M11.2 20V9.6c0-1.5-.6-2.9-1.6-4l-.8-.9c-.5-.5-1.3-.2-1.3.5v6.1L5.4 14c-.6.9-.7 2-.2 3l1.6 3"/><path d="M12.8 20V9.6c0-1.5.6-2.9 1.6-4l.8-.9c.5-.5 1.3-.2 1.3.5v6.1l2.1 2.7c.6.9.7 2 .2 3l-1.6 3"/>',
    direction: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2l-1.9 4.7-3.7 1.9 1.9-4.7z"/><path d="M12 3.5v1.6M12 18.9v1.6M3.5 12h1.6M18.9 12h1.6"/>',
  };
  const icon = k => '<svg class="lqp-ico-svg" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' + (ICON_PATH[k] || "") + "</svg>";

  /* ---------- the renderer (pure) ---------- */
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
  const RGB = /^rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*[\d.]+\s*)?\)$/i;
  const safeColour = c => (HEX.test(String(c || "").trim()) || RGB.test(String(c || "").trim()) ? String(c).trim() : "");
  /** a colour swatch is never colour alone: the chip (outlined, kept in colour where the printer can) + its name */
  function swatch(s, lang) {
    const name = String((s && s.name) || "").trim() || W[lang].colour;
    const col = safeColour(s && s.hex);
    return '<span class="lqp-sw"><i class="lqp-chip" aria-hidden="true"' + (col ? ' style="background-color:' + esc(col) + '"' : "") + "></i>" + esc(name) + "</span>";
  }
  const sws = (list, lang) => (list || []).map(s => swatch(s, lang)).join(" ");
  const lenOf = s => String(s || "").length;
  /** short items read better side by side: two columns when every item is short (A5 keeps them only when very short) */
  function colsClass(items, lang) {
    const n = items.length, max = Math.max(0, ...items.map(it => lenOf(it.label) + lenOf(it.text) + 6 * ((it.sw || []).length)));
    const lim = lang === "zh" ? { two: 26, tiny: 12 } : { two: 64, tiny: 30 };
    if (n < 4 || max > lim.two) return "";
    return max <= lim.tiny ? " lqp-cols lqp-cols-tiny" : " lqp-cols";
  }
  function block(b, lang) {
    if (!b || !b.t) return "";
    if (b.t === "p") return '<p class="lqp-p' + (b.caution ? " lqp-caution" : "") + '">' + esc(b.text) + (b.sw && b.sw.length ? " " + sws(b.sw, lang) : "") + "</p>";
    if (b.t === "list") {
      const items = (b.items || []).filter(it => it && (it.text || it.label || (it.sw && it.sw.length)));
      if (!items.length) return "";
      const tag = b.ordered ? "ol" : "ul";
      return "<" + tag + ' class="lqp-list' + colsClass(items, lang) + '">' + items.map(it => "<li>" + (it.label ? "<b>" + esc(it.label) + "</b> " : "") + esc(it.text || "") +
        (it.sw && it.sw.length ? " " + sws(it.sw, lang) : "") + "</li>").join("") + "</" + tag + ">";
    }
    if (b.t === "table") {
      const rows = (b.rows || []).filter(r => r && r.length);
      if (!rows.length) return "";
      const width = Math.max(...rows.map(r => r.length));
      const cell = c => {
        const tag = c.head ? "th" : "td";
        return "<" + tag + ">" + esc(c.text || "") + (c.sw && c.sw.length ? (c.text ? " " : "") + sws(c.sw, lang) : "") + "</" + tag + ">";
      };
      let head = 0; while (head < rows.length && rows[head].every(c => c.head)) head++;
      const tr = r => "<tr>" + r.map(cell).join("") + "</tr>";
      return '<table class="lqp-tbl' + (width >= 5 ? " lqp-tbl-wide" : "") + '">' + (b.caption ? "<caption>" + esc(b.caption) + "</caption>" : "") +
        (head ? "<thead>" + rows.slice(0, head).map(tr).join("") + "</thead>" : "") + "<tbody>" + rows.slice(head).map(tr).join("") + "</tbody></table>";
    }
    if (b.t === "figure") {
      const src = String(b.src || "");
      const ok = /^data:image\/(?:png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src) || /^(?:[\w./-]+|https?:\/\/[\w.-]+\/[\w./%-]*)\.(?:png|jpe?g|webp|gif|svg)(?:\?[\w=&.-]*)?$/i.test(src);
      if (ok) return '<figure class="lqp-fig"><img src="' + esc(src) + '" alt="' + esc(b.alt || "") + '"' + (b.w ? ' style="width:' + Math.min(170, Math.max(10, +b.w || 0)) + 'mm"' : "") + ">" +
        (b.alt ? "<figcaption>" + esc(b.alt) + "</figcaption>" : "") + "</figure>";
      return "";
    }
    if (b.t === "advice") {
      const ic = (b.icons || []).filter(k => ICON_PATH[k]).map(k => '<span class="lqp-ico">' + icon(k) + esc(W[lang].icon[k]) + "</span>").join("");
      const parts = ic + sws(b.sw, lang);
      if (!parts) return "";
      return '<div class="lqp-adv">' + parts + (b.note ? '<span class="lqp-belief">' + esc(b.note) + "</span>" : "") + "</div>";
    }
    return "";
  }
  const HTAG = { 1: ["h2", "lqp-part"], 2: ["h3", "lqp-h"], 3: ["h4", "lqp-subh"] };
  /** the @page rule for a paper size (page numbers in the margin box, in the report's language and font) */
  function pageCSS(size, lang) {
    const S = SIZES[size] || SIZES.auto, small = size === "80mm" ? "6.5pt" : "8pt";
    return "@page{" + S.page + ";@bottom-right{content:" + PAGE_NO[lang] + ";font-family:" + FONT[lang] + ";font-size:" + small + ";color:#222;vertical-align:top;padding-top:1.5mm}}";
  }
  /**
   * The paper report as one HTML string: <div class="lqp lqp--<size>"> with a <style> for @page, a table frame whose header
   * and footer repeat on every printed page, and the sections. Text is escaped; colours are checked; images must be data:
   * images or site files. Returns "" for a crisis model.
   * @param {any} model @param {{size?: string, paid?: boolean}} [opts]
   */
  function render(model, opts) {
    opts = opts || {}; model = model || {};
    if (model.crisis) return "";
    const lang = langOf(model.lang), w = W[lang], S = SHARE_WORDS(lang);
    const size = SIZES[opts.size] ? opts.size : "auto";
    const title = String(model.title || S.title || "LENSIQ");
    const date = model.date instanceof Date || !model.date ? S.dateText(model.date) : String(model.date);
    const name = String(model.name || "").trim(), birth = String(model.birth || "").trim();
    const who = [name ? w.forName + " " + name : "", birth ? w.born + " " + birth : ""].filter(Boolean).join(" · ");
    const head = '<div class="lqp-head"><span class="lqp-mark">' + MARK + '<span class="lqp-mark-word">LENSIQ</span></span>' +
      '<span class="lqp-hd-title">' + esc(title) + (who ? ' <span class="lqp-hd-name">· ' + esc(who) + "</span>" : "") + "</span>" +
      '<span class="lqp-hd-date">' + esc(date) + "</span></div>";
    const foot = '<div class="lqp-foot"><p class="lqp-line">' + esc(S.line) + "</p>" +
      (model.link ? '<p class="lqp-src">' + esc(w.made) + " LENSIQ · " + esc(model.link) + "</p>" : "") + "</div>";
    let body = '<div class="lqp-titleblock"><h1 class="lqp-title">' + esc(title) + '</h1><p class="lqp-kind">' + esc(opts.paid ? w.paid : w.report) +
      (who ? " · " + esc(who) : "") + " · " + esc(date) + "</p></div>";
    let pending = []; // headings waiting for their first block (a heading never stands alone at the end of a page)
    const heads = () => { const h = pending.join(""); pending = []; return h; };
    for (const s of model.sections || []) {
      const blocks = (s.blocks || []).map(b => block(b, lang)).filter(Boolean);
      const lv = HTAG[s.level] ? s.level : 2, [tag, cls] = HTAG[lv];
      if (s.heading) pending.push("<" + tag + ' class="' + cls + '" data-lqp-h>' + esc(s.heading) + "</" + tag + ">");
      if (!blocks.length) continue;
      body += '<section class="lqp-sec lqp-sec-' + lv + '"><div class="lqp-lead">' + heads() + blocks[0] + "</div>" + blocks.slice(1).join("") + "</section>";
    }
    // a heading with nothing under it is left out (never a heading as the last line of the report)
    return '<div class="lqp lqp--' + SIZES[size].cls + (opts.paid ? " lqp--paid" : "") + '" lang="' + (lang === "zh" ? "zh-Hans" : lang) + '" data-lqp-size="' + esc(size) + '"' +
      (opts.paid ? " data-lqp-paid" : "") + ' style="font-family:' + esc(FONT[lang]) + '">' +
      '<style data-lqp-page>' + pageCSS(size, lang) + "</style>" +
      '<table class="lqp-frame" role="presentation"><thead><tr><td>' + head + "</td></tr></thead><tfoot><tr><td>" + foot + "</td></tr></tfoot>" +
      '<tbody><tr><td class="lqp-body">' + body + "</td></tr></tbody></table></div>";
  }
  // words shared with the share card (disclaimer line, page names, date format) come from fortune-share.js
  function SHARE_WORDS(lang) {
    const SP = share();
    return {
      line: SP ? SP.LINE[lang] : "",
      title: "",
      dateText: d => (SP ? SP.dateText(d instanceof Date ? d : new Date(), lang) : new Date().toISOString().slice(0, 10)),
    };
  }

  const api = { W, PAGE_NO, SIZES, FONT, ICON_PATH, render, pageCSS, langOf, CSS_FILE: "fortune-print.css" };

  /* ================================ browser ================================ */
  if (typeof document === "undefined" || (NODE && !root.document)) {
    api.print = () => false;
    if (NODE) module.exports = api;
    return;
  }
  const doc = document;
  const allowed = () => { const SP = share(); return SP && SP.allowed ? SP.allowed(doc) : false; };

  /* ---------- reading a result on screen into the model ---------- */
  const SKIP = "button,select,input,textarea,form,nav,script,style,template,noscript,dialog,video,audio,iframe,summary,label,legend," +
    ".lq-toc,[data-lq-toc],[data-lq-sp-bar],[data-lq-sp-opt],[data-lq-sp],.rp-actions,.no-print,[data-lq-no-print],.lq-sp-dlg,.lq-helpbar," +
    ".lq-camhelp,.lq-disc-mini,.lq-helpline,[role=tablist],[role=tab],[role=toolbar],[role=menu],[role=dialog],[role=banner],.sr-only,.visually-hidden," +
    ".toast,.lq-demo-banner,.banner,.fa-consent,.fa-ai-badge,button.lq-more";
  const SHOW_HIDDEN = ".lq-more-body,.lq-notice-more,details";
  const BLOCK_TAGS = /^(P|DIV|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|MAIN|UL|OL|DL|TABLE|H[1-6]|FIGURE|BLOCKQUOTE|DETAILS|CANVAS|IMG|PRE|HR|FIGCAPTION)$/;
  const txt = s => String(s || "").replace(/\s+/g, " ").trim();
  const isSwatchEl = e => {
    if (!e || e.nodeType !== 1 || e.closest("svg") || txt(e.textContent)) return false;
    if (e.classList.contains("lq-sw-chip")) return true;
    const st = e.getAttribute("style") || "", cls = typeof e.className === "string" ? e.className : "";
    return /background|--c\s*:|--sw\s*:/.test(st) || /(^|[\s_-])(sw|swatch|chip|dot)([\s_-]|$)/.test(cls);
  };
  function hiddenEl(e) {
    if (e.hidden && e.getAttribute("role") !== "tabpanel" && !e.matches(SHOW_HIDDEN)) return true;
    let cs; try { cs = getComputedStyle(e); } catch (x) { return false; }
    if (cs.display === "none" && !e.matches(SHOW_HIDDEN) && !e.closest(SHOW_HIDDEN) && e.getAttribute("role") !== "tabpanel") return true;
    return cs.visibility === "hidden" && !e.closest(SHOW_HIDDEN);
  }
  const skipEl = (e, photo) => e.matches(SKIP) || (photo && e.matches(photo)) || (e.getAttribute("aria-hidden") === "true" && !/^(CANVAS|IMG)$/.test(e.tagName) && !isSwatchEl(e)) || hiddenEl(e);
  const isBlock = e => {
    if (BLOCK_TAGS.test(e.tagName)) return true;
    try { const d = getComputedStyle(e).display; return !!d && !/^inline|^contents$|^none$/.test(d); } catch (x) { return false; }
  };
  /** visible text of an inline run, without skipped parts; swatches found inside come back as {hex, name} */
  function inlineOf(e, ctx) {
    let out = ""; const sw = [];
    const walk = n => {
      if (n.nodeType === 3) { out += n.textContent; return; }
      if (n.nodeType !== 1) return;
      if (isSwatchEl(n)) {
        let c = ""; try { c = getComputedStyle(n).backgroundColor; } catch (x) { /* none */ }
        sw.push({ hex: toHex(c), name: "" }); return;
      }
      if (n.tagName === "BR") { out += " "; return; }
      if (n.tagName === "svg" || skipEl(n, ctx.photo)) return;
      for (const k of n.childNodes) walk(k);
    };
    for (const k of e.childNodes) walk(k);
    const text = ctx.clean(txt(out));
    // one swatch in a short text: that text is its label (the screen's own); otherwise each swatch gets its colour name
    if (sw.length === 1 && text && text.length <= 40) return { text: "", sw: [{ hex: sw[0].hex, name: text }] };
    return { text, sw: sw.map(s => ({ hex: s.hex, name: colourName(s.hex, ctx.lang) || W[ctx.lang].colour })) };
  }
  function toHex(c) {
    const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/.exec(c || "");
    if (!m || (m[4] != null && +m[4] < 0.2)) return "";
    return "#" + [m[1], m[2], m[3]].map(x => (+x).toString(16).padStart(2, "0")).join("");
  }
  const COLOURS = [
    ["#dc2626", "แดง", "red", "红色"], ["#ea580c", "ส้ม", "orange", "橙色"], ["#eab308", "เหลือง", "yellow", "黄色"], ["#d4af37", "ทอง", "gold", "金色"],
    ["#16a34a", "เขียว", "green", "绿色"], ["#38bdf8", "ฟ้า", "light blue", "浅蓝色"], ["#1d4ed8", "น้ำเงิน", "blue", "蓝色"], ["#7c3aed", "ม่วง", "purple", "紫色"],
    ["#ec4899", "ชมพู", "pink", "粉色"], ["#784824", "น้ำตาล", "brown", "棕色"], ["#111111", "ดำ", "black", "黑色"], ["#fafafa", "ขาว", "white", "白色"],
    ["#8c8c8c", "เทา", "grey", "灰色"], ["#f0e6c8", "ครีม", "cream", "米色"], ["#c0c0c0", "เงิน", "silver", "银色"],
  ];
  function colourName(hex, lang) {
    if (!HEX.test(hex || "")) return "";
    const v = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)), c = v(hex), li = { th: 1, en: 2, zh: 3 }[lang];
    let best = null, bd = Infinity;
    for (const k of COLOURS) { const d = v(k[0]).reduce((a, x, i) => a + (x - c[i]) ** 2, 0); if (d < bd) { bd = d; best = k; } }
    return best ? best[li] : "";
  }
  function canvasSrc(c) {
    try { if (c.width > 40 && c.height > 30) return c.toDataURL("image/png"); } catch (e) { /* tainted */ }
    return "";
  }
  const pxToMm = px => Math.round(px * 25.4 / 96);
  /**
   * Read a result on screen into the model. Every group is taken in full (folded parts, closed tabs, <details>), in screen
   * order; headings start sections (a tab panel takes its tab's name as its heading). Never taken: controls, forms, menus,
   * banners, help controls, the in-page menu, the camera photo. With include off (the default) the names, birth data and
   * anything the person typed are taken out of every text (fortune-share.js scrub, the share card's rule).
   * @param {Element|Element[]} rootEl @param {{lang?: string, page?: string, photo?: string, include?: boolean, personal?: any}} [o]
   */
  function fromDom(rootEl, o) {
    o = o || {};
    const SP = share(), lang = langOf(o.lang || String(doc.documentElement.lang || "th").slice(0, 2));
    const per = o.personal || { names: [], birth: "", ages: [], typed: [] };
    const values = [].concat(per.typed || [], per.names || [], per.ages || [], String(per.birth || "").split(/\s+/).filter(x => x.length >= 3));
    const clean = o.include || !SP || !SP.scrub ? (s => s) : (s => (s ? SP.scrub(s, values, false) : s));
    const ctx = { lang, photo: o.photo || "", clean };
    const line = SP ? txt(SP.LINE[lang]) : "";
    const sections = [];
    let cur = { level: 2, heading: "", blocks: [] }; sections.push(cur);
    const seen = new Set();
    const start = (level, heading) => { cur = { level, heading, blocks: [] }; sections.push(cur); };
    const add = b => {
      if (b.t === "p") {
        if (!b.text && !(b.sw && b.sw.length)) return;
        if (b.text && (b.text === line || (seen.has(b.text) && b.text.length > 12))) return;
        if (b.text) seen.add(b.text);
      }
      cur.blocks.push(b);
    };
    const para = (e, extra) => { const r = inlineOf(e, ctx); add(Object.assign({ t: "p", text: r.text, sw: r.sw }, extra || {})); };
    const listOf = e => {
      const items = [];
      for (const li of e.children) {
        if (li.tagName !== "LI" || skipEl(li, ctx.photo)) continue;
        const first = li.firstElementChild, lead = first && /^(B|STRONG)$/.test(first.tagName) && li.firstChild === first ? ctx.clean(txt(first.textContent)) : "";
        const r = inlineOf(li, ctx);
        let text = r.text; if (lead && text.startsWith(lead)) text = text.slice(lead.length).trim();
        const adv = li.querySelector(".lq-advice");
        const sw = r.sw.concat(adv ? swOf(adv) : []);
        if (text || lead || sw.length) items.push({ label: lead, text, sw });
      }
      return items;
    };
    const swOf = box => [...box.querySelectorAll(".lq-sw")].map(s => ({ hex: toHex(getComputedStyle(s.querySelector(".lq-sw-chip") || s).backgroundColor) || s.getAttribute("data-hex") || "", name: ctx.clean(txt(s.textContent)) }));
    const advice = e => {
      const icons = [...e.querySelectorAll("svg[data-icon]")].map(s => s.getAttribute("data-icon"));
      const b = e.querySelector(".lq-belief");
      add({ t: "advice", icons, sw: swOf(e), note: b ? txt(b.textContent) : "" });
    };
    const table = e => {
      const rows = [];
      for (const tr of e.querySelectorAll("tr")) {
        if (skipEl(tr, ctx.photo)) continue;
        const r = [...tr.children].filter(c => /^T[HD]$/.test(c.tagName)).map(c => { const x = inlineOf(c, ctx); return { text: x.text, head: c.tagName === "TH", sw: x.sw }; });
        if (r.length && r.some(c => c.text || c.sw.length)) rows.push(r);
      }
      const cap = e.querySelector("caption");
      if (rows.length) add({ t: "table", caption: cap ? ctx.clean(txt(cap.textContent)) : "", rows });
    };
    const figure = e => {
      let src = "";
      if (e.tagName === "CANVAS") src = canvasSrc(e);
      else if (e.tagName === "IMG") { const s = e.getAttribute("src") || ""; if (/^data:image\//.test(s) || /^[\w./-]+\.(?:png|jpe?g|webp|gif|svg)(?:\?[\w=&.-]*)?$/i.test(s)) src = s; }
      if (!src) return;
      const r = e.getBoundingClientRect();
      if (r.width && r.width < 40) return; // small decorations
      add({ t: "figure", src, alt: ctx.clean(txt(e.getAttribute("alt") || e.getAttribute("aria-label") || "")), w: r.width ? Math.min(90, pxToMm(r.width)) : 60 });
    };
    const walk = e => {
      if (e.nodeType === 3) { const t = ctx.clean(txt(e.textContent)); if (t) add({ t: "p", text: t }); return; }
      if (e.nodeType !== 1 || skipEl(e, ctx.photo)) return;
      const tag = e.tagName;
      if (/^H[1-6]$/.test(tag)) { const h = ctx.clean(txt(e.textContent)); if (h) start(+tag[1] <= 2 ? 1 : tag === "H3" ? 2 : 3, h); return; }
      if (e.getAttribute("role") === "tabpanel") {
        const lb = e.getAttribute("aria-labelledby"), t = lb ? doc.getElementById(lb) : null, h = t ? ctx.clean(txt(t.textContent)) : "";
        if (h) start(1, h);
      }
      if (e.classList.contains("lq-advice")) { advice(e); return; }
      if (e.classList.contains("lq-sw")) { add({ t: "p", text: "", sw: swOf({ querySelectorAll: () => [e] }) }); return; }
      if (tag === "UL" || tag === "OL") { const items = listOf(e); if (items.length) add({ t: "list", ordered: tag === "OL", items }); return; }
      if (tag === "DL") {
        const items = []; let k = "";
        for (const c of e.children) { if (c.tagName === "DT") k = ctx.clean(txt(c.textContent)); else if (c.tagName === "DD") { items.push({ label: k, text: ctx.clean(txt(c.textContent)) }); k = ""; } }
        if (items.length) add({ t: "list", items }); return;
      }
      if (tag === "TABLE") { table(e); return; }
      if (tag === "CANVAS" || tag === "IMG") { figure(e); return; }
      if (tag === "svg") return; // inline icons on screen; the report draws its own
      if (tag === "HR") return;
      const kids = [...e.childNodes].filter(n => n.nodeType === 1 ? !skipEl(n, ctx.photo) : n.nodeType === 3 && txt(n.textContent));
      const hasBlock = kids.some(n => n.nodeType === 1 && (isBlock(n) || /^(CANVAS|IMG)$/.test(n.tagName) || n.querySelector("canvas, img, h1, h2, h3, h4, ul, ol, table, p, div, section")));
      if (!hasBlock) { if (isBlock(e) || tag === "P" || tag === "SPAN") para(e, e.classList.contains("lq-caution") ? { caution: true } : null); return; }
      for (const n of kids) walk(n);
    };
    const roots = Array.isArray(rootEl) ? rootEl : [rootEl];
    for (const r of roots) if (r) for (const n of r.childNodes) walk(n);
    const out = sections.filter(s => s.blocks.length || s.heading);
    return {
      page: o.page || (SP && SP.page) || "", lang,
      title: SP ? SP.pageName(o.page || SP.page, lang) : "LENSIQ",
      date: new Date(), link: o.link || "",
      name: o.include && per.names && per.names[0] ? per.names[0] : "",
      birth: o.include && per.birth ? per.birth : "",
      sections: out,
    };
  }

  /* ---------- the print view in the page ---------- */
  function cssReady() {
    return new Promise(res => {
      const me = [...doc.scripts].find(s => /fortune-print\.js/.test(s.src)), v = me && /\?v=(\d+)/.exec(me.src);
      const href = "fortune-print.css" + (v ? "?v=" + v[1] : "");
      let l = doc.getElementById("lqp-css");
      if (l) { if (l.sheet) res(true); else { l.addEventListener("load", () => res(true), { once: true }); l.addEventListener("error", () => res(false), { once: true }); } return; }
      l = doc.createElement("link"); l.id = "lqp-css"; l.rel = "stylesheet"; l.href = href;
      l.onload = () => res(true); l.onerror = () => res(false);
      doc.head.appendChild(l);
    });
  }
  let cssP = null;
  api.ready = () => (cssP = cssP || cssReady());
  function unmount() {
    const pv = doc.getElementById("lqPrint"); if (pv) pv.remove();
    if (doc.body) doc.body.classList.remove("lq-printing");
  }
  /** put the paper report in the page as #lqPrint (shown only in print media); refuses in the crisis state */
  function mount(model, opts) {
    unmount();
    if (!allowed()) return null;
    const html = render(model, opts);
    if (!html) return null;
    const box = doc.createElement("div"); box.innerHTML = html;
    const pv = /** @type {HTMLElement} */ (box.firstElementChild);
    pv.id = "lqPrint";
    doc.body.appendChild(pv);
    doc.body.classList.add("lq-printing");
    if (opts && opts.size === "80mm") fitReceipt(pv);
    return pv;
  }
  /** the receipt is one long page: its height follows the content (kiosk roll paper) */
  function fitReceipt(pv) {
    const st = pv.querySelector("style[data-lqp-page]"); if (!st) return;
    const measure = () => {
      const h = pv.getBoundingClientRect().height;
      if (!h) return;
      const mm = Math.max(60, Math.ceil(h * 25.4 / 96 * 1.08) + 14);
      st.textContent = st.textContent.replace(/size:80mm [\d.]+mm/, "size:80mm " + mm + "mm");
    };
    const media = root.matchMedia ? root.matchMedia("print") : null;
    if (media && media.matches) measure();
    pv.__lqpFit = measure;
  }
  api.fitReceipt = () => { const pv = doc.getElementById("lqPrint"); if (pv && pv.__lqpFit) pv.__lqpFit(); };
  api.fromDom = fromDom;
  api.mount = mount;
  api.unmount = unmount;
  /** build the report of the result the button belongs to (or the one on screen) and open the print dialog */
  api.build = function (o) {
    o = o || {};
    const SP = share();
    if (!SP || !allowed()) return null;
    const r = SP.resultFor ? SP.resultFor(o.button || null) : null;
    if (!r) return null;
    const P = SP.config() || {};
    const src = (r.printRoot && doc.querySelector(r.printRoot)) || doc.querySelector(r.root);
    if (!src) return null;
    const include = o.include != null ? !!o.include : SP.includeChecked ? SP.includeChecked(r) : false;
    const model = fromDom(src, { lang: SP.lang(), page: SP.page, photo: P.photo || "", include, personal: SP.personal ? SP.personal() : null, link: SP.link ? SP.link() : "" });
    return mount(model, { size: o.size || "auto", paid: false });
  };
  api.print = function (o) {
    o = o || {};
    if (!allowed()) return false;
    if (!api.build(o)) return false;
    try { root.print(); } catch (e) { /* no print dialog */ }
    return true;
  };
  root.addEventListener("beforeprint", () => { api.fitReceipt(); });
  root.LQPrint = api;
})(typeof window !== "undefined" ? window : globalThis);
