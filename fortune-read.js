/* fortune-read.js — one shared reading layout for every fortune page (owner order 2026-11-14, Part A).
 *   A1  LINE: the one-line notice that replaced the old fun-only label (TH from the owner, EN / ZH translations)
 *   A2  readings regrouped under short headings, in short paragraphs, main point first; the words never change
 *       (plan() only cuts the composer's paragraphs at a space / sentence end, rejoined they are identical)
 *   A3  a short summary per group, the rest behind a real <button> "อ่านเพิ่มเติม / Read more / 阅读更多"
 *       (aria-expanded, aria-controls, keyboard by being a button, 44 px), an in-page menu for long readings
 *   A4  advice items (colour to wear, what to worship, whom to respect, direction) get small icons drawn for LENSIQ
 *       (inline SVG, MIT, see LICENSES/THIRD_PARTY.md and docs/CREDITS-MEDIA.md), colour swatches with the real colour
 *       and a text label, and the label "ตามความเชื่อ โปรดใช้วิจารณญาณ"; all marked data-lq-remedy (hidden in the crisis state)
 *   A5  every notice is one short line, the rest behind "อ่านเพิ่มเติม"; the help line and the crisis card are NEVER folded
 * A paragraph that carries an unfavourable / caution lead (straight or gentle) is always shown in full: the meaning a
 * discipline's rules produce is never tucked away. Tests: tests/unit/fortune-layout.test.js, tests/e2e/fortune-layout.e2e.mjs.
 * Loaded on every fortune page before fortune-ai.js; Node: require("./fortune-read.js") for the pure parts. */
(function (root) {
  "use strict";
  const LINE = {
    th: "เนื้อหานี้พัฒนาขึ้นจากองค์ความรู้ด้านโหราศาสตร์ เป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณและอ่านอย่างมีสติ เราไม่รับรองความถูกต้องของคำทำนาย",
    en: "This content draws on traditional astrological knowledge and reflects personal belief. Please use your own judgement and read it mindfully. " +
      "We do not guarantee the accuracy of any prediction.",
    zh: "本内容基于传统占星与命理知识，属于个人信仰。请自行判断，理性阅读。我们不保证预测的准确性。",
  };
  const MORE = { th: "อ่านเพิ่มเติม", en: "Read more", zh: "阅读更多" };
  const LESS = { th: "ย่อลง", en: "Show less", zh: "收起" };
  const TOC = { th: "หัวข้อในคำทำนายนี้", en: "In this reading", zh: "本次解读目录" };
  const BELIEF = { th: "ตามความเชื่อ โปรดใช้วิจารณญาณ", en: "According to belief, please use your own judgement", zh: "依据传统说法，请自行判断" };
  const HEADINGS = {
    th: { overview: "ภาพรวม", personality: "ตัวตน", work: "การงาน", money: "การเงิน", love: "ความรัก", social: "ผู้คนรอบตัว", timing: "จังหวะเวลา",
      health: "สุขภาพ", advice: "สิ่งที่ควรทำ", brief: "เรื่องอื่นโดยย่อ" },
    en: { overview: "Overview", personality: "Personality", work: "Work", money: "Money", love: "Love", social: "People around you", timing: "Timing",
      health: "Health", advice: "What to do", brief: "Other areas" },
    zh: { overview: "总览", personality: "性格", work: "事业", money: "财运", love: "感情", social: "人际", timing: "时机", health: "健康", advice: "建议", brief: "其他" },
  };
  const SEP = { th: " ", en: " ", zh: "" };
  const MAXLEN = { th: 220, en: 320, zh: 110 };
  const NOTE_MAX = { th: 140, en: 200, zh: 60 };
  const NEVER_COLLAPSE = [".lq-helpline", ".fa-support", ".lq-support", "[data-lq-crisis-card]"];
  const langOf = l => (l === "en" || l === "zh" ? l : "th");

  /* ---------- A2: cut a paragraph into short parts (rejoined with SEP[lang] = the paragraph, word for word) ---------- */
  // Thai has no sentence mark: cut only at a single space, never before a word that continues the clause, never after one
  // that leads into the next word.
  const TH_CONT_NEXT = /^(?:และ|หรือ|แต่|ซึ่ง|ที่|ๆ|เพื่อ|จึง|ก็|แล้ว|ไม่|ได้|ให้|กับ|ของ|ใน|จาก|คือ|ว่า|เป็น|มาก|ด้วย|อยู่|ไว้|กัน|ไป|มา|[\d(/–\-)])/;
  const TH_CONT_PREV = /(?:คือ|ว่า|และ|หรือ|ของ|ใน|กับ|จาก|ที่|ซึ่ง|เพื่อ|เช่น|ได้แก่|อย่าง|แบบ|โดย|ตาม|ทั้ง|[(/–\-])$/;
  function cutsTh(p) {
    const out = [];
    for (let i = p.indexOf(" "); i >= 0; i = p.indexOf(" ", i + 1)) {
      if (p[i + 1] === " " || p[i - 1] === " ") continue;
      out.push({ at: i, ok: !TH_CONT_NEXT.test(p.slice(i + 1)) && !TH_CONT_PREV.test(p.slice(0, i)) });
    }
    return out;
  }
  function cutsEn(p) { const out = []; const re = /[.!?]["”’)]? (?=["“(]?[A-Z0-9])/g; let m; while ((m = re.exec(p))) out.push({ at: m.index + m[0].length - 1, ok: true }); return out; }
  function split(p, lang, max) {
    lang = langOf(lang); max = max || MAXLEN[lang];
    p = String(p == null ? "" : p);
    if (p.length <= max) return [p];
    if (lang === "zh") {
      const sen = p.match(/[^。！？]*[。！？]+[”」』）)]*|[^。！？]+$/g) || [p];
      const out = []; let cur = "", n = 0;
      for (const s of sen) { if (cur && (cur.length + s.length > max || n >= 2)) { out.push(cur); cur = ""; n = 0; } cur += s; n++; }
      if (cur) out.push(cur);
      return out;
    }
    const cuts = lang === "en" ? cutsEn(p) : cutsTh(p);
    const pieces = Math.ceil(p.length / max), target = p.length / pieces;
    const out = []; let start = 0;
    while (p.length - start > max) {
      const inRange = cuts.filter(c => c.at > start && c.at - start <= max);
      if (!inRange.length) break;
      const good = inRange.filter(c => c.ok);
      const pick = good.find(c => c.at - start >= target * 0.8) || good[good.length - 1] || inRange[inRange.length - 1];
      if (pick.at - start < 12 && inRange.length > 1) { const later = inRange.find(c => c.at - start >= 12); if (later) { out.push(p.slice(start, later.at)); start = later.at + 1; continue; } }
      out.push(p.slice(start, pick.at)); start = pick.at + 1;
    }
    out.push(p.slice(start));
    return out.filter((x, i) => x.length || i === 0);
  }
  /** parts of a section: [{ text, para, visible, caution }]; first part (the main point) and caution paragraphs are shown */
  function plan(paragraphs, lang, opts) {
    lang = langOf(lang);
    const leads = (opts && opts.leads) || [], parts = [];
    (paragraphs || []).forEach((p, k) => {
      const caution = leads.some(l => l && String(p).includes(l));
      const chunks = caution ? [String(p)] : split(p, lang);
      chunks.forEach((t, j) => parts.push({ text: t, para: k, caution, visible: caution || (k === 0 && j === 0) }));
    });
    return parts;
  }

  /* ---------- A5: one short line + the rest ---------- */
  function noticeSplit(text, lang) {
    lang = langOf(lang); text = String(text || "");
    const max = NOTE_MAX[lang];
    if (text.length <= max) return [text, ""];
    let at = -1;
    if (lang === "zh") {
      const m = /[。！？]/g; let x; while ((x = m.exec(text)) && x.index < max) at = x.index + 1;
      if (at < 0) { const c = text.lastIndexOf("，", max); at = c > 0 ? c + 1 : max; }
      return [text.slice(0, at), text.slice(at)];
    }
    const cuts = lang === "en" ? cutsEn(text) : cutsTh(text);
    const ok = cuts.filter(c => c.ok && c.at <= max);
    const pick = ok.find(c => c.at >= 30) || ok[ok.length - 1];
    at = pick ? pick.at : (cuts.filter(c => c.at <= max).pop() || { at: -1 }).at;
    if (at <= 0) return [text, ""];
    return [text.slice(0, at), text.slice(at + 1)];
  }

  /* ---------- A4: colours, advice kinds, icons ---------- */
  const COLOURS = {
    th: [["น้ำเงิน", "#1e40af"], ["กรมท่า", "#1f2a5a"], ["บานเย็น", "#c2185b"], ["เลือดหมู", "#7f1d1d"], ["น้ำตาล", "#795548"], ["เขียว", "#2e7d32"], ["เหลือง", "#fbc02d"],
      ["ชมพู", "#ec6fa8"], ["ม่วง", "#7b1fa2"], ["แดง", "#d32f2f"], ["ส้ม", "#f57c00"], ["แสด", "#ff6f00"], ["ฟ้า", "#4fc3f7"], ["คราม", "#283593"], ["ขาว", "#ffffff"],
      ["ดำ", "#111111"], ["เทา", "#8e8e8e"], ["ครีม", "#f3e5c0"], ["ทอง", "#c9a227"], ["เงิน", "#c0c0c0"]],
    en: [["light blue", "#4fc3f7"], ["sky blue", "#4fc3f7"], ["navy", "#1f2a5a"], ["red", "#d32f2f"], ["pink", "#ec6fa8"], ["orange", "#f57c00"], ["yellow", "#fbc02d"],
      ["cream", "#f3e5c0"], ["beige", "#e8d8b8"], ["green", "#2e7d32"], ["blue", "#1e40af"], ["purple", "#7b1fa2"], ["violet", "#7b1fa2"], ["black", "#111111"],
      ["white", "#ffffff"], ["grey", "#8e8e8e"], ["gray", "#8e8e8e"], ["brown", "#795548"], ["gold", "#c9a227"], ["silver", "#c0c0c0"]],
    zh: [["粉红色", "#ec6fa8"], ["浅蓝色", "#4fc3f7"], ["天蓝色", "#4fc3f7"], ["深蓝色", "#1f2a5a"], ["藏青色", "#1f2a5a"], ["奶油色", "#f3e5c0"], ["咖啡色", "#795548"],
      ["红色", "#d32f2f"], ["粉色", "#ec6fa8"], ["橙色", "#f57c00"], ["黄色", "#fbc02d"], ["米色", "#f3e5c0"], ["绿色", "#2e7d32"], ["蓝色", "#1e40af"], ["紫色", "#7b1fa2"],
      ["黑色", "#111111"], ["白色", "#ffffff"], ["灰色", "#8e8e8e"], ["棕色", "#795548"], ["褐色", "#795548"], ["金色", "#c9a227"], ["银色", "#c0c0c0"]],
  };
  const hexOf = (lang, name) => (COLOURS[lang].find(c => c[0] === name) || [])[1];
  function coloursTh(text) {
    const out = [], names = COLOURS.th.map(c => c[0]);
    const piecesOf = seg => seg.split(/และ|หรือ|กับ|,|\/|、|\(|\)|\s+/).map(x => x.replace(/^สี/, "").replace(/[.,;:)”"]+$/, "").trim()).filter(Boolean);
    for (let i = text.indexOf("สี"); i >= 0; i = text.indexOf("สี", i + 2)) {
      const toks = text.slice(i).split(" ");
      const t0 = toks[0];
      let a = -1, al = 0;
      for (const w of ["คือ", "ได้แก่", "เช่น", "เป็น"]) { const j = t0.lastIndexOf(w); if (j > a) { a = j; al = w.length; } }
      const seg = a >= 0 ? t0.slice(a + al) : t0.slice(2);
      const first = piecesOf(seg);
      if (!first.length || !first.every(x => names.includes(x))) continue;
      first.forEach(x => out.push(x));
      for (const t of toks.slice(1)) {
        const ps = piecesOf(t);
        if (!ps.length) continue;
        if (!ps.every(x => names.includes(x))) break;
        ps.forEach(x => out.push(x));
      }
    }
    return out;
  }
  function coloursEn(text) {
    const out = [], re = /\bcolou?rs?\b([^.!?]*)/gi; let m;
    while ((m = re.exec(text))) {
      let seg = m[1]; const c = seg.indexOf(":");
      if (c >= 0) seg = seg.slice(c + 1); else { const k = seg.search(/\b(?:are|is|include|such as)\b/i); if (k < 0) continue; seg = seg.slice(k).replace(/^\w+(?: as)?/i, ""); }
      for (const piece of seg.split(/,|\/|\band\b|\bor\b/i)) {
        const w = piece.trim().toLowerCase().replace(/[^a-z ]/g, "").trim();
        if (!w) continue;
        const hit = COLOURS.en.find(x => w === x[0] || w.endsWith(" " + x[0]));
        if (!hit) break;
        out.push(hit[0]);
      }
    }
    return out;
  }
  function coloursZh(text) {
    const out = [], re = /(?:颜色|幸运色|色)[是为：:]?([^。！？]*)/g; let m;
    while ((m = re.exec(text))) {
      const seg = m[1];
      for (let i = 0; i < seg.length;) {
        const hit = COLOURS.zh.find(x => seg.startsWith(x[0], i));
        if (hit) { out.push(hit[0]); i += hit[0].length; } else i++;
      }
    }
    return out;
  }
  function colours(text, lang) {
    lang = langOf(lang); text = String(text || "");
    const names = lang === "zh" ? coloursZh(text) : lang === "en" ? coloursEn(text) : coloursTh(text);
    return [...new Set(names)].map(name => ({ name, hex: hexOf(lang, name) })).filter(c => c.hex);
  }
  const KINDS = {
    th: { worship: /บูชา|สักการะ|ไหว้พระ|ไหว้เจ้า|ไหว้ศาล|ทำบุญ|ใส่บาตร|ขอพร|สวดมนต์|ถวาย/, respect: /เคารพ|กตัญญู|ผู้ใหญ่|ผู้มีพระคุณ|บรรพบุรุษ|พ่อแม่|ไหว้(?!พระ|เจ้า|ศาล)/,
      direction: /ทิศ/ },
    en: { worship: /\b(?:worship|pray|prayers?|make merit|making merit|offerings?|temple|shrine|incense)\b/i,
      respect: /\b(?:pay(?:ing)? respects?|respect|elders?|ancestors?|gratitude|parents)\b/i,
      direction: /\b(?:directions?|facing|(?:north|south)(?:east|west)?|east|west)\b/i },
    zh: { worship: /供奉|拜佛|拜神|上香|祈福|寺|庙|烧香|行善|积德|祭/, respect: /孝|敬|尊重|长辈|祖先|感恩|父母/, direction: /方位|方向|朝向|东方|西方|南方|北方|东南|西南|东北|西北/ },
  };
  function adviceKinds(text, lang) {
    lang = langOf(lang); text = String(text || "");
    const out = [];
    if (colours(text, lang).length) out.push("colour");
    for (const k of ["worship", "respect", "direction"]) if (KINDS[lang][k].test(text)) out.push(k);
    return out;
  }
  // icons drawn by hand for LENSIQ (simple shapes; no picture of a deity, a temple or any real place); MIT like the repo
  const SVG = (body, label) => '<svg class="lq-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" ' +
    'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" data-icon="' + label + '">' + body + "</svg>";
  const OWN = "drawn by hand for LENSIQ in fortune-read.js (2026-11-14); simple geometric shapes, no source image";
  const MIT = "MIT (own work, LENSIQ; same licence as the repository)";
  const ICONS = {
    colour: { svg: SVG('<path d="M12 3.5c-4.9 0-8.5 3.6-8.5 8.1 0 4.4 3.6 8.4 8.2 8.4 1.2 0 1.8-.7 1.8-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 ' +
      '0-.9.7-1.6 1.6-1.6h1.9c2.7 0 4.5-1.9 4.5-4.4 0-3.7-3.8-6.5-8.5-6.5z"/>' +
      '<circle cx="7.6" cy="11.3" r="1.2"/><circle cx="10.4" cy="7.6" r="1.2"/><circle cx="14.8" cy="7.8" r="1.2"/>', "colour"), licence: MIT, source: OWN },
    worship: { svg: SVG('<path d="M12 5c1.9 2.1 2.6 4.5 2 7.6-.4 1.9-1.1 3.2-2 4.4-.9-1.2-1.6-2.5-2-4.4C9.4 9.5 10.1 7.1 12 5z"/>' +
      '<path d="M10 16.8c-2.7-.4-4.9-2.1-6-4.8 2.4-.4 4.4.1 5.8 1.3M14 16.8c2.7-.4 4.9-2.1 6-4.8-2.4-.4-4.4.1-5.8 1.3"/><path d="M5 19.5h14"/>', "worship"), licence: MIT, source: OWN },
    respect: { svg: SVG('<path d="M11.2 20V9.6c0-1.5-.6-2.9-1.6-4l-.8-.9c-.5-.5-1.3-.2-1.3.5v6.1L5.4 14c-.6.9-.7 2-.2 3l1.6 3"/>' +
      '<path d="M12.8 20V9.6c0-1.5.6-2.9 1.6-4l.8-.9c.5-.5 1.3-.2 1.3.5v6.1l2.1 2.7c.6.9.7 2 .2 3l-1.6 3"/>', "respect"), licence: MIT, source: OWN },
    direction: { svg: SVG('<circle cx="12" cy="12" r="8.5"/><path d="M14.8 9.2l-1.9 4.7-3.7 1.9 1.9-4.7z"/><path d="M12 3.5v1.6M12 18.9v1.6M3.5 12h1.6M18.9 12h1.6"/>', "direction"),
      licence: MIT, source: OWN },
  };

  /* ---------- DOM ---------- */
  const CSS = ".fa-section{scroll-margin-top:96px}.fa-section>p,.fa-section .lq-more-body>p{margin:.55em 0;line-height:1.75}" +
    ".fa-section .lq-gist{font-weight:500}.fa-section .lq-caution{border-left:3px solid rgba(214,120,0,.55);padding-left:.7em}" +
    ".lq-more-body{display:none}.lq-more-body.lq-open{display:block}" +
    "button.lq-more{display:inline-flex;align-items:center;justify-content:center;min-height:44px;min-width:44px;padding:.35em 1.1em;margin:.25em 0 .5em;" +
    "border-radius:999px;border:1px solid rgba(103,79,242,.45);background:transparent;color:#4b36c9;font:inherit;font-size:.95em;font-weight:600;cursor:pointer;" +
    "max-width:100%;white-space:normal;text-align:center;line-height:1.3}" +
    "button.lq-more:hover{background:rgba(103,79,242,.08)}button.lq-more:focus-visible{outline:3px solid #674ff2;outline-offset:2px}" +
    ".lq-toc{margin:.4em 0 1em;padding:.6em .7em;border:1px solid rgba(103,79,242,.22);border-radius:14px;background:rgba(103,79,242,.04)}" +
    ".lq-toc p{margin:0 0 .4em;font-size:.88em;font-weight:600;opacity:.85}.lq-toc ul{display:flex;flex-wrap:wrap;gap:.4em;list-style:none;margin:0;padding:0}" +
    ".lq-toc a{display:inline-flex;align-items:center;min-height:44px;padding:0 .9em;border-radius:999px;border:1px solid rgba(103,79,242,.3);" +
    "text-decoration:none;color:inherit;font-size:.92em;background:#fff}.lq-toc a:focus-visible{outline:3px solid #674ff2;outline-offset:2px}" +
    ".lq-advice{display:flex;flex-wrap:wrap;align-items:center;gap:.4em .5em;margin:-.15em 0 .8em;font-size:.92em}" +
    ".lq-icon{width:1.35em;height:1.35em;flex:none;color:#674ff2}" +
    ".lq-sw{display:inline-flex;align-items:center;gap:.35em;padding:.15em .6em .15em .3em;border:1px solid rgba(0,0,0,.14);border-radius:999px;background:#fff;color:#222}" +
    ".lq-sw-chip{display:inline-block;width:1.15em;height:1.15em;border-radius:50%;border:1px solid rgba(0,0,0,.3);flex:none}" +
    ".lq-belief{flex-basis:100%;font-size:.84em;opacity:.78}" +
    ".lq-notice .lq-notice-more{display:none}.lq-notice.lq-open .lq-notice-more{display:inline}" +
    ".lq-notice button.lq-more{min-height:44px;padding:.2em .9em;margin:.2em 0 0 .4em;font-size:.88em;vertical-align:middle}" +
    "html[data-lq-crisis] [data-lq-remedy]{display:none!important}" +
    "@media print{.lq-more-body,.lq-notice .lq-notice-more{display:block!important}button.lq-more{display:none!important}}" +
    "@media (prefers-color-scheme:dark){button.lq-more{color:#c9bcff;border-color:rgba(201,188,255,.5)}.lq-toc a{background:transparent}.lq-icon{color:#b9abff}}";
  let uid = 0;
  function ensureStyle(doc) {
    try {
      if (!doc || !doc.head || doc.getElementById("lq-read-style")) return;
      const s = doc.createElement("style"); s.id = "lq-read-style"; s.textContent = CSS; doc.head.appendChild(s);
    } catch (e) { /* no DOM */ }
  }
  const pageLang = () => { try { return langOf(root.LQI18N && root.LQI18N.lang); } catch (e) { return "th"; } };
  const never = el => !!(el && el.closest && el.closest(NEVER_COLLAPSE.join(",")));
  function moreButton(doc, lang, ids, onToggle) {
    const b = doc.createElement("button");
    b.type = "button"; b.className = "lq-more"; b.textContent = MORE[lang];
    b.setAttribute("aria-expanded", "false"); b.setAttribute("aria-controls", ids.join(" ")); b.setAttribute("data-lq-lang", lang);
    b.addEventListener("click", () => {
      const open = b.getAttribute("aria-expanded") !== "true", L = b.getAttribute("data-lq-lang") || lang;
      b.setAttribute("aria-expanded", open ? "true" : "false"); b.textContent = open ? LESS[L] : MORE[L];
      onToggle(open);
    });
    return b;
  }
  function leadsFor(lang) {
    const FA = root.FortuneAI, out = [];
    const flat = x => (Array.isArray(x) ? x.flatMap(flat) : x && typeof x === "object" ? Object.values(x).flatMap(flat) : typeof x === "string" ? [x] : []);
    try {
      if (FA && FA.straight) out.push(...flat(FA.straight.LEADS && FA.straight.LEADS[lang]), ...flat(FA.straight.NATAL_LEADS && FA.straight.NATAL_LEADS[lang]));
      if (FA && FA._internal && FA._internal.cautionLeads) out.push(...flat(FA._internal.cautionLeads(lang)));
    } catch (e) { /* no composer */ }
    return [...new Set(out.map(s => s.replace(/[.。]$/, "")).filter(s => s.length >= 6))];
  }
  const STD_TITLES = () => {
    const FA = root.FortuneAI, t = {};
    try { for (const src of [FA.SECTION_TITLES, FA.en && FA.en.TITLES, FA.zh && FA.zh.TITLES]) if (src) for (const k in src) (t[k] = t[k] || []).push(src[k]); } catch (e) { /* none */ }
    (t.brief = t.brief || []).push("เรื่องอื่น ๆ โดยย่อ");
    return t;
  };
  const ADVICE_FRAME = { th: /ควร|ลอง|วิธีปรับ|สิ่งที่ทำได้|ข้อแนะนำ|เคล็ด|เลือก|ใส่|ใช้กับ|สีที่เข้ากับ|สีมงคล|ทิศที่ส่งเสริม|ไหว้|บูชา|ทำบุญ/,
    en: /\b(?:try|wear|choose|should|tip|remedy|suit|face|pay|make merit|pray)\b/i, zh: /建议|可以|不妨|穿|选择|宜|适合|朝|拜|供奉|孝/ };
  function adviceBox(doc, text, lang) {
    const kinds = adviceKinds(text, lang);
    if (!kinds.length) return null;
    const box = doc.createElement("div"); box.className = "lq-advice"; box.setAttribute("data-lq-remedy", "");
    for (const k of kinds) { const t = doc.createElement("span"); t.innerHTML = ICONS[k].svg; box.appendChild(t.firstChild); }
    for (const c of colours(text, lang)) {
      const s = doc.createElement("span"); s.className = "lq-sw"; s.setAttribute("data-hex", c.hex);
      const chip = doc.createElement("span"); chip.className = "lq-sw-chip"; chip.setAttribute("aria-hidden", "true"); chip.style.backgroundColor = c.hex;
      s.appendChild(chip); s.appendChild(doc.createTextNode(c.name)); box.appendChild(s);
    }
    const b = doc.createElement("span"); b.className = "lq-belief"; b.textContent = BELIEF[lang]; box.appendChild(b);
    return box;
  }
  function group(sec, lang, leads, titles) {
    const doc = sec.ownerDocument;
    if (sec.getAttribute("data-lq-grouped")) return;
    sec.setAttribute("data-lq-grouped", "1");
    if (!sec.id) sec.id = "lq-g-" + (++uid);
    const id = sec.getAttribute("data-section") || "";
    const h = sec.querySelector("h3, h4");
    if (h && HEADINGS[lang][id] && (titles[id] || []).includes(h.textContent.trim())) { h.textContent = HEADINGS[lang][id]; h.removeAttribute("data-i18n"); }
    const ps = [];
    for (const n of [...sec.children]) {
      if (n.tagName === "P") { ps.push(n.textContent); n.remove(); }
      else if (n.tagName === "DETAILS" && n.classList.contains("fa-more")) { for (const p of n.querySelectorAll("p")) ps.push(p.textContent); n.remove(); }
    }
    const parts = plan(ps, lang, { leads });
    const isAdvice = id === "advice";
    let body = null; const ids = [];
    for (const [i, x] of parts.entries()) {
      const p = doc.createElement("p"); p.textContent = x.text;
      if (i === 0) p.className = "lq-gist"; if (x.caution) p.classList.add("lq-caution");
      const box = (isAdvice || ADVICE_FRAME[lang].test(x.text)) ? adviceBox(doc, x.text, lang) : null;
      if (x.visible) { body = null; sec.appendChild(p); if (box) sec.appendChild(box); continue; }
      if (!body) { body = doc.createElement("div"); body.className = "lq-more-body"; body.id = "lq-mb-" + (++uid); ids.push(body.id); sec.appendChild(body); }
      body.appendChild(p); if (box) body.appendChild(box);
    }
    if (ids.length) {
      const bodies = ids.map(x => sec.querySelector("#" + x));
      sec.appendChild(moreButton(doc, lang, ids, open => bodies.forEach(b => b.classList.toggle("lq-open", open))));
    }
  }
  function toc(container, groups, lang, before) {
    const doc = container.ownerDocument;
    const nav = doc.createElement("nav"); nav.className = "lq-toc"; nav.setAttribute("aria-label", TOC[lang]);
    const t = doc.createElement("p"); t.textContent = TOC[lang]; nav.appendChild(t);
    const ul = doc.createElement("ul");
    for (const g of groups) {
      const h = g.querySelector("h3, h4"); if (!h) continue;
      const li = doc.createElement("li"), a = doc.createElement("a");
      a.href = "#" + g.id; a.textContent = h.textContent.trim();
      a.addEventListener("click", e => { e.preventDefault(); try { g.scrollIntoView({ behavior: "smooth", block: "start" }); } catch (x) { g.scrollIntoView(); }
        try { root.history.replaceState(null, "", "#" + g.id); } catch (x) { /* file: */ }
        const f = g.querySelector("h3, h4"); if (f) { f.setAttribute("tabindex", "-1"); f.focus({ preventScroll: true }); } });
      li.appendChild(a); ul.appendChild(li);
    }
    nav.appendChild(ul);
    if (before && before.parentNode) before.parentNode.insertBefore(nav, before); else container.insertBefore(nav, container.firstChild);
    return nav;
  }
  /** after FortuneAI.renderSections (or a page's own sections): group, fold, menu, advice icons, short reminder */
  function enhance(container, res, opts) {
    if (!container || !container.querySelectorAll) return container;
    const doc = container.ownerDocument || root.document; ensureStyle(doc);
    const lang = langOf((res && res.lang) || (opts && opts.lang) || pageLang());
    if (res && res.crisis) return container;
    for (const d of [...container.querySelectorAll("details.fa-more-sections")]) { for (const s of [...d.querySelectorAll(":scope > .fa-section")]) d.parentNode.insertBefore(s, d); d.remove(); }
    const groups = [...container.querySelectorAll(".fa-section")].filter(g => !never(g));
    const leads = leadsFor(lang), titles = STD_TITLES();
    for (const g of groups) group(g, lang, leads, titles);
    for (const li of container.querySelectorAll(".fa-plan li")) { if (li.querySelector(".lq-advice")) continue; const box = adviceBox(doc, li.textContent, lang); if (box) li.appendChild(box); }
    const old = container.querySelector(":scope > nav.lq-toc"); if (old) old.remove();
    if (groups.length >= 4 && !(opts && opts.toc === false)) toc(container, groups, lang, groups[0]);
    for (const r of container.querySelectorAll(".fa-reminder")) noticeify(r, lang);
    return container;
  }
  /** turn a plain-text notice into one short line + the rest behind read more (the help line / crisis card never) */
  function noticeify(el, lang) {
    if (!el || never(el) || el.firstElementChild) return el;
    lang = langOf(lang || (el.closest && el.closest("[lang]") && /^zh/.test(el.closest("[lang]").lang) ? "zh" : null) || pageLang());
    const [line, rest] = noticeSplit(el.textContent.trim(), lang);
    if (!rest) return el;
    const doc = el.ownerDocument;
    el.textContent = "";
    el.classList.add("lq-notice");
    const a = doc.createElement("span"); a.className = "lq-notice-line"; a.textContent = line; el.appendChild(a);
    const more = doc.createElement("span"); more.className = "lq-notice-more"; more.id = "lq-nm-" + (++uid);
    const inner = doc.createElement("span"); inner.textContent = SEP[lang] + rest; more.appendChild(inner);
    el.appendChild(moreButton(doc, lang, [more.id], open => el.classList.toggle("lq-open", open)));
    el.appendChild(more);
    return el;
  }
  /** static notices in the page markup: <x class="lq-notice"> … <span class="lq-notice-more">…</span>: add the button */
  function notices(scope) {
    const doc = (scope && scope.ownerDocument) || (scope && scope.nodeType === 9 ? scope : root.document);
    if (!doc || !doc.querySelectorAll) return;
    ensureStyle(doc);
    const lang = pageLang();
    for (const n of (scope || doc).querySelectorAll(".lq-notice")) {
      if (never(n)) continue;
      const more = n.querySelector(".lq-notice-more"); if (!more) continue;
      let b = [...n.querySelectorAll("button.lq-more")].find(x => x.closest(".lq-notice") === n);
      if (!b) { if (!more.id) more.id = "lq-nm-" + (++uid); b = moreButton(doc, lang, [more.id], open => n.classList.toggle("lq-open", open)); more.parentNode.insertBefore(b, more); }
      else { b.setAttribute("data-lq-lang", lang); b.textContent = b.getAttribute("aria-expanded") === "true" ? LESS[lang] : MORE[lang]; }
    }
  }
  // the reading layout runs through FortuneAI's documented extension point (decorate after every rendered reading; a support
  // card never reaches hooks). Queued here because this file loads before fortune-ai.js.
  const HOOK = { decorate(container, original, shown) { try { enhance(container, shown || original); } catch (e) { /* keep the plain reading */ } } };
  if (root.document) {
    try { if (root.FortuneAI && root.FortuneAI.registerHooks) root.FortuneAI.registerHooks(HOOK); else (root.LQFortuneHooks = root.LQFortuneHooks || []).push(HOOK); } catch (e) { /* none */ }
  }
  if (root.document && root.addEventListener) {
    const doc = root.document, run = () => { try { notices(doc); } catch (e) { /* keep the page */ } };
    if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", run); else run();
    root.addEventListener("lq-lang", run);
  }

  const api = { LINE, MORE, LESS, TOC, BELIEF, HEADINGS, SEP, MAXLEN, NOTE_MAX, NEVER_COLLAPSE, ICONS, COLOURS,
    split, plan, noticeSplit, colours, adviceKinds, enhance, noticeify, notices, ensureStyle };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.LQRead = api;
})(typeof window !== "undefined" ? window : globalThis);
