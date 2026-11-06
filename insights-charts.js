/* insights-charts.js — กราฟ SVG/HTML ของแดชบอร์ดรวม (เส้น แท่ง แท่งนอน sparkline scatter) + tooltip ที่ใช้ได้ทั้งเมาส์ แตะ และคีย์บอร์ด
   เบราว์เซอร์เท่านั้น: window.LQInsightsCharts ; tooltip ใช้ #iqTip ในหน้า */
(/** @param {any} root */ function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./insights-data.js"), require("./insights-analysis.js"));
  else root.LQInsightsCharts = factory(root.LQInsightsData, root.LQInsightsAnalysis);
})(typeof self !== "undefined" ? self : this, function (M_data, M_analysis) {
"use strict";
  const { iqSum, iqMean, iqT: TT } = M_data;
  const { iqFin } = M_analysis;
  if (typeof document === "undefined") return {};
  const $ = s => document.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent, text) => {
    const n = tag.startsWith("svg:") ? document.createElementNS(NS, tag.slice(4)) : document.createElement(tag);
    for (const k in attrs) { if (k === "class") n.setAttribute("class", attrs[k]); else n.setAttribute(k, attrs[k]); }
    if (text != null) n.textContent = text;
    parent?.append(n); return n;
  };

  const nf = n => Math.round(n).toLocaleString("th-TH");
  const compact = n => Math.abs(n) >= 10000 ? (n / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 }) + "K" : nf(n);
  const baht = n => { const v = Math.abs(n) >= 100000 ? compact(n) : Math.round(n).toLocaleString("th-TH"); return M_analysis.iqLang && M_analysis.iqLang() === "zh" ? v + " 泰铢" : "฿" + v; };
  const fmtVal = (v, f) => v == null ? "–" : f === "baht" ? baht(v) : f === "pct" ? Math.round(v * 100) + "%" : f === "pct1" ? (v * 100).toFixed(1) + "%" : f === "score" ? Math.round(v) + "/100" : compact(v);

  // ---------- tooltip (เมาส์ แตะ และคีย์บอร์ด) ----------
  const tip = $("#iqTip");
  let tipOwner = null;
  function showTip(owner, title, rows, x, y) {
    tipOwner = owner;
    tip.replaceChildren();
    el("div", { class: "tt-h" }, tip, title);
    rows.forEach(([name, val, cls]) => { const r = el("div", { class: "tt-r" }, tip); if (cls) el("i", { class: "key " + cls }, r); el("b", {}, r, val); el("span", {}, r, name); });
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px";
    tip.style.top = (y - h - 14 < 8 ? y + 18 : y - h - 14) + "px";
  }
  const hideTip = owner => { if (!owner || owner === tipOwner) { tip.hidden = true; tipOwner = null; } };
  document.addEventListener("pointerdown", e => { if (tipOwner && !tipOwner.contains(e.target)) hideTip(); });
  addEventListener("scroll", () => hideTip(), { passive: true });

  /* แกน Y ค่ากลม ๆ */
  function niceTicks(max, n = 4) {
    if (!(max > 0)) return [0, 1];
    const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p, step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    const out = []; for (let v = 0; v <= max + step * 0.999; v += step) out.push(+v.toFixed(6));
    if (out.length < 2) out.push(step);
    return out;
  }

  /* ตัวช่วยโต้ตอบตามแกน X: เมาส์/แตะเลือกตำแหน่งที่ใกล้ที่สุด, ลูกศรซ้ายขวาเมื่อโฟกัส */
  function bindIndex(svg, n, xOf, onIdx) {
    let cur = -1;
    const at = e => { const r = svg.getBoundingClientRect(), x = e.clientX - r.left; let best = 0; for (let i = 1; i < n; i++) if (Math.abs(xOf(i) - x) < Math.abs(xOf(best) - x)) best = i; return best; };
    const go = (i, e) => { cur = i; const r = svg.getBoundingClientRect(); onIdx(i, e ? e.clientX : r.left + xOf(i), r.top + 8); };
    svg.addEventListener("pointermove", e => go(at(e), e));
    svg.addEventListener("pointerdown", e => go(at(e), e));
    svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { onIdx(-1); hideTip(svg); } });
    svg.addEventListener("keydown", e => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); go(Math.max(0, Math.min(n - 1, (cur < 0 ? (e.key === "ArrowRight" ? -1 : n) : cur) + (e.key === "ArrowRight" ? 1 : -1)))); }
      if (e.key === "Escape") { onIdx(-1); hideTip(svg); }
    });
    svg.addEventListener("focus", () => { if (cur < 0) go(n - 1); });
    svg.addEventListener("blur", () => { onIdx(-1); hideTip(svg); });
  }

  /* วาดใหม่เมื่อความกว้างเปลี่ยน */
  const ro = new ResizeObserver(entries => entries.forEach(en => { const box = /** @type {any} */ (en.target); const w = Math.round(en.contentRect.width); if (w && w !== box._w) { box._w = w; box._draw?.(w); } }));
  function responsive(box, draw) { box._draw = draw; box._w = 0; ro.observe(box); const w = Math.round(box.getBoundingClientRect().width); if (w) { box._w = w; draw(w); } }

  /* กราฟแท่งแนวตั้ง 1 ชุดข้อมูล (ตามเวลา) */
  function columnChart(box, { labels, values, fmt, name }) {
    responsive(box, W => {
      box.replaceChildren();
      const H = 150, L = 40, R = 6, T = 10, B = 24, n = values.length;
      const ticks = niceTicks(Math.max(...values, 0)), max = ticks.at(-1);
      const band = (W - L - R) / n, bw = Math.max(2, Math.min(24, band * 0.68));
      const x = i => L + band * i + band / 2, y = v => T + (1 - v / max) * (H - T - B);
      const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "iq-svg", role: "img", tabindex: 0, "aria-label": `${name}: ${labels.map((l, i) => `${l} ${fmtVal(values[i], fmt)}`).join(", ")}` }, box);
      ticks.forEach(v => { el("svg:line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? "base" : "grid" }, svg); el("svg:text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "tick" }, svg, fmt === "baht" ? compact(v) : compact(v)); });
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L) / 54))));
      labels.forEach((l, i) => { if ((n - 1 - i) % every === 0) el("svg:text", { x: x(i), y: H - 6, "text-anchor": n > 1 && i === n - 1 && x(i) + 24 > W ? "end" : "middle", class: "tick" }, svg, l); });
      const bars = values.map((v, i) => {
        const top = y(v), h = y(0) - top, r = Math.min(4, h, bw / 2), x0 = x(i) - bw / 2;
        if (h <= 0) return null;
        return el("svg:path", { class: "bar s1", d: `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${y(0)}Z` }, svg);
      });
      bindIndex(svg, n, x, (i, cx, cy) => {
        bars.forEach((b, k) => b && b.classList.toggle("on", k === i));
        if (i < 0) return;
        const r = svg.getBoundingClientRect();
        showTip(svg, labels[i], [[name, fmtVal(values[i], fmt), "s1"]], r.left + x(i), r.top + y(values[i]));
      });
    });
  }

  /* กราฟเส้นหลายชุด (แกน Y เดียว หน่วยเดียวกัน) + crosshair + ป้ายปลายเส้น */
  function lineChart(box, { labels, series }) {
    responsive(box, W => {
      box.replaceChildren();
      const narrow = W < 520, H = narrow ? 210 : 260, L = 40, R = narrow ? 12 : 92, T = 12, B = 26, n = labels.length;
      const ticks = niceTicks(Math.max(1, ...series.flatMap(s => s.values))), max = ticks.at(-1);
      const x = i => n === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (n - 1), y = v => T + (1 - v / max) * (H - T - B);
      const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "iq-svg", role: "img", tabindex: 0, "aria-label": TT("iq.ch.trend", "แนวโน้มรวม {s} (ดูตัวเลขทั้งหมดในตารางด้านล่าง)", { s: series.map(s => TT("iq.ch.sum", "{n} รวม {v}", { n: s.name, v: nf(iqSum(s.values)) })).join(", ") }) }, box);
      ticks.forEach(v => { el("svg:line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? "base" : "grid" }, svg); el("svg:text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "tick" }, svg, compact(v)); });
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 58))));
      labels.forEach((l, i) => { if ((n - 1 - i) % every === 0) el("svg:text", { x: x(i), y: H - 6, "text-anchor": n > 1 && i === n - 1 && x(i) + 24 > W ? "end" : "middle", class: "tick" }, svg, l); });
      series.forEach(s => {
        el("svg:path", { class: "line " + s.cls, d: s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("") }, svg);
        el("svg:circle", { class: "dot " + s.cls, cx: x(n - 1), cy: y(s.values[n - 1]), r: 4 }, svg);
      });
      if (!narrow) { // ป้ายปลายเส้น — เลี่ยงชนกันด้วยการเว้นระยะขั้นต่ำ (มีเส้นนำถ้าเลื่อน)
        const ends = series.map(s => ({ s, y0: y(s.values[n - 1]), y: y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
        const GAP = 16, maxY = H - B - 4;
        for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < GAP) ends[i].y = ends[i - 1].y + GAP;
        if (ends.length && ends.at(-1).y > maxY) { ends.at(-1).y = maxY; for (let i = ends.length - 2; i >= 0; i--) ends[i].y = Math.min(ends[i].y, ends[i + 1].y - GAP); }
        ends.forEach(e => {
          if (Math.abs(e.y - e.y0) > 1) el("svg:line", { x1: x(n - 1) + 6, x2: W - R + 4, y1: e.y0, y2: e.y, class: "leader" }, svg);
          el("svg:text", { x: W - R + 8, y: e.y + 4, class: "endlab" }, svg, `${e.s.short} ${nf(e.s.values[n - 1])}`);
        });
      }
      const cross = el("svg:line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" }, svg);
      const dots = series.map(s => el("svg:circle", { r: 4, class: "dot " + s.cls, visibility: "hidden" }, svg));
      bindIndex(svg, n, x, (i, cx) => {
        const vis = i < 0 ? "hidden" : "visible";
        cross.setAttribute("visibility", vis); dots.forEach(d => d.setAttribute("visibility", vis));
        if (i < 0) return;
        cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
        dots.forEach((d, k) => { d.setAttribute("cx", x(i)); d.setAttribute("cy", y(series[k].values[i])); });
        const r = svg.getBoundingClientRect();
        showTip(svg, labels[i], series.map(s => [s.name, nf(s.values[i]), s.cls]), r.left + x(i), r.top + T);
      });
    });
  }

  /* แท่งแนวนอนแบบ HTML (หมวดหมู่) ค่าอยู่ปลายแท่ง */
  function hbars(box, rows, fmt, name) {
    box.replaceChildren();
    const max = Math.max(...rows.map(r => r.value), 0) || 1;
    const list = el("div", { class: "hb", role: "list", "aria-label": name }, box);
    rows.forEach(r => {
      const row = el("div", { class: "hb-row", role: "listitem", tabindex: 0 }, list);
      el("div", { class: "hb-l" }, row, r.label);
      const tr = el("div", { class: "hb-t" }, row);
      const bar = el("div", { class: "hb-b s1" }, tr); bar.style.width = Math.max(1.5, r.value / max * 100) + "%";
      el("div", { class: "hb-v" }, row, fmtVal(r.value, fmt));
      const show = e => { const b = row.getBoundingClientRect(); showTip(row, r.label, [[name, fmtVal(r.value, fmt), "s1"], ...(r.sub ? [[r.sub, ""]] : [])], e?.clientX ?? b.left + b.width / 2, b.top); };
      row.addEventListener("pointerenter", show); row.addEventListener("pointerdown", show); row.addEventListener("focus", () => show());
      row.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hideTip(row); }); row.addEventListener("blur", () => hideTip(row));
    });
  }

  function tableView(parent, head, rows) {
    const d = el("details", { class: "iq-table" }, parent);
    el("summary", {}, d, TT("iq.ch.table", "ดูเป็นตาราง"));
    const wrap = el("div", { class: "tw" }, d), t = el("table", {}, wrap), tr = el("tr", {}, el("thead", {}, t));
    head.forEach((h, i) => el("th", { class: i ? "n" : "" }, tr, h));
    const tb = el("tbody", {}, t);
    rows.forEach(r => { const row = el("tr", {}, tb); r.forEach((c, i) => el("td", { class: i ? "n" : "" }, row, c)); });
  }

  function sparkline(parent, values, name) {
    const v = (values || []).map(x => iqFin(x) ? x : null), pts = v.filter(x => x != null);
    if (pts.length < 2) return;
    const W = 120, H = 28, max = Math.max(...pts), min = Math.min(0, ...pts), n = v.length;
    const x = i => n === 1 ? W / 2 : 2 + (W - 4) * i / (n - 1), y = val => H - 3 - (max > min ? (val - min) / (max - min) : 0.5) * (H - 6);
    const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "spark", "aria-hidden": "true", focusable: "false" }, parent);
    let d = "", pen = false;
    v.forEach((val, i) => { if (val == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`; pen = true; });
    el("svg:path", { d, class: "sp-l" }, svg);
    const li = v.map((q, i) => q == null ? -1 : i).filter(i => i >= 0).pop();
    el("svg:circle", { cx: x(li), cy: y(v[li]), r: 2.5, class: "sp-d" }, svg);
    parent.setAttribute("data-spark", name || "");
  }

  function scatter(parent, c) {
    const [X, Y] = [[], []]; c.x.forEach((v, i) => { if (iqFin(v) && iqFin(c.y[i])) { X.push(v); Y.push(c.y[i]); } });
    const W = 150, H = 104, L = 8, B = 8, T = 6, R = 6;
    const x0 = Math.min(...X), x1 = Math.max(...X), y0 = Math.min(...Y), y1 = Math.max(...Y);
    const sx = v => L + (x1 > x0 ? (v - x0) / (x1 - x0) : 0.5) * (W - L - R), sy = v => H - B - (y1 > y0 ? (v - y0) / (y1 - y0) : 0.5) * (H - T - B);
    const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, class: "iq-svg sc", role: "img", "aria-label": TT("iq.ch.scatter", "แผนภาพการกระจาย {x} กับ {y} {n} จุด", { x: TT(c.xName, c.xName), y: TT(c.yName, c.yName), n: c.n }) }, parent);
    el("svg:line", { x1: L, x2: W - R, y1: H - B, y2: H - B, class: "base" }, svg); el("svg:line", { x1: L, x2: L, y1: T, y2: H - B, class: "base" }, svg);
    X.forEach((v, i) => el("svg:circle", { cx: sx(v), cy: sy(Y[i]), r: 3.5, class: "dot s1 sc-d" }, svg));
    // เส้นแนวโน้ม (least squares)
    const mx = iqMean(X), my = iqMean(Y); let sxy = 0, sxx = 0; X.forEach((v, i) => { sxy += (v - mx) * (Y[i] - my); sxx += (v - mx) ** 2; });
    if (sxx > 0) { const b = sxy / sxx, a = my - b * mx; el("svg:line", { x1: sx(x0), x2: sx(x1), y1: sy(a + b * x0), y2: sy(a + b * x1), class: "sc-fit" }, svg); }
  }
  return { NS, el, nf, compact, baht, fmtVal, showTip, hideTip, niceTicks, bindIndex, responsive, columnChart, lineChart, hbars, tableView, sparkline, scatter };
});
