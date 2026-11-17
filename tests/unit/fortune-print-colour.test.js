"use strict";
// tests/unit/fortune-print-colour.test.js — FIXED TEST SET, owner decision 82 ก (2026-11-17): the paper report gets tasteful
// colour for colour printers and "save as PDF" (header band, section headings, icons, swatches) and stays fully clear in black
// and white. Locked before the colour was built (~/LENSIQ-field/evals/print-report/, evals-locks/print-report.sha256).
// The browser half (computed colours in the printed report, colour pixels in the PDF) is tests/e2e/fortune-print-colour.e2e.mjs.
// Every existing black-and-white check (tests/unit/fortune-print.test.js, the print-report kit) stays as it is.
//   C1  colour tokens on .lqp: --lqp-ink, --lqp-accent, --lqp-accent-soft, --lqp-caution, --lqp-tint
//   C2  the accent and caution colours are clearly colours (HSL saturation >= 0.35) and still read in black and white
//       (contrast against white >= 4.5:1); ink >= 12:1; the tint is light (relative luminance >= 0.8)
//   C3  B/W legibility: every colour given to text in fortune-print.css has contrast >= 7:1 against white
//   C4  every background in fortune-print.css (other than the swatch chip, which shows the colour itself) is light
//       (luminance >= 0.8), so text on it stays legible in black and white
//   C5  colour never carries meaning on its own: the renderer still writes a text label with every swatch and icon (P7 in
//       fortune-print.test.js) and the caution paragraph keeps its non-colour mark (a dashed rule)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const CSS = fs.readFileSync(path.join(__dirname, "..", "..", "fortune-print.css"), "utf8");

const hex = h => { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
const lum = rgb => { const c = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const sat = rgb => { const [r, g, b] = rgb.map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; return mx === mn ? 0 : (mx - mn) / (l > 0.5 ? 2 - mx - mn : mx + mn); };
const WHITE = [255, 255, 255];
const tokens = (() => { const m = /\.lqp\s*\{([^}]*)\}/.exec(CSS), out = {}; if (m) for (const d of m[1].matchAll(/(--lqp-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})/g)) out[d[1]] = d[2]; return out; })();
const resolve = v => { v = v.trim(); const t = /^var\((--lqp-[\w-]+)\)/.exec(v); if (t) v = tokens[t[1]] || ""; const h = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/.exec(v); return h ? hex(h[0]) : null; };
// declarations "prop:value" in the stylesheet (comments out), with the selector they belong to
const decls = (() => { const out = []; const css = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const m of css.matchAll(/([^{}@]+)\{([^{}]*)\}/g)) for (const d of m[2].split(";")) { const i = d.indexOf(":"); if (i > 0) out.push({ sel: m[1].trim(), prop: d.slice(0, i).trim(), val: d.slice(i + 1).trim() }); }
  return out; })();

test("C1 colour tokens on .lqp", () => {
  for (const k of ["--lqp-ink", "--lqp-accent", "--lqp-accent-soft", "--lqp-caution", "--lqp-tint"]) assert.ok(tokens[k], "missing token " + k);
});

test("C2 accent and caution are colours that still read in black and white; ink is dark; tint is light", () => {
  for (const k of ["--lqp-accent", "--lqp-caution"]) {
    const c = hex(tokens[k] || "#000");
    assert.ok(sat(c) >= 0.35, `${k} ${tokens[k]} is not clearly a colour (saturation ${sat(c).toFixed(2)})`);
    assert.ok(contrast(c, WHITE) >= 4.5, `${k} ${tokens[k]} too light for black and white (${contrast(c, WHITE).toFixed(2)}:1)`);
  }
  assert.ok(contrast(hex(tokens["--lqp-ink"] || "#fff"), WHITE) >= 12, "ink not dark enough");
  assert.ok(lum(hex(tokens["--lqp-tint"] || "#000")) >= 0.8, "tint not light");
  assert.ok(lum(hex(tokens["--lqp-accent-soft"] || "#000")) >= 0.8, "soft accent (backgrounds) not light");
});

test("C3 every text colour in the stylesheet has contrast >= 7:1 against white (black-and-white legibility)", () => {
  const text = decls.filter(d => d.prop === "color" && !/currentColor|inherit/.test(d.val));
  assert.ok(text.length >= 5, "text colours found: " + text.length);
  for (const d of text) {
    const c = resolve(d.val);
    assert.ok(c, `${d.sel}: color ${d.val} not resolvable`);
    assert.ok(contrast(c, WHITE) >= 7, `${d.sel}: color ${d.val} only ${contrast(c, WHITE).toFixed(2)}:1`);
  }
});

test("C4 every background (except the swatch chip) is light", () => {
  const bg = decls.filter(d => /^background(-color)?$/.test(d.prop) && !/^(none|transparent)$/.test(d.val) && !/lqp-chip/.test(d.sel));
  for (const d of bg) {
    const c = resolve(d.val);
    assert.ok(c, `${d.sel}: background ${d.val} not resolvable`);
    assert.ok(lum(c) >= 0.8, `${d.sel}: background ${d.val} is dark (luminance ${lum(c).toFixed(2)})`);
  }
});

test("C5 colour never carries meaning alone: caution keeps its dashed rule; labels stay (renderer)", () => {
  const caution = decls.filter(d => /\.lqp-caution\b/.test(d.sel) && /^border(-left)?$/.test(d.prop));
  assert.ok(caution.some(d => /dashed/.test(d.val)), "caution paragraphs keep a dashed rule");
  const LP = require("../../fortune-print.js");
  const html = LP.render({ lang: "th", title: "t", sections: [{ level: 2, heading: "h", blocks: [{ t: "advice", icons: ["colour"], sw: [{ hex: "#dc2626", name: "แดง" }] }] }] }, { size: "A4" });
  assert.ok(/<i class="lqp-chip"[^>]*><\/i>แดง<\/span>/.test(html), "swatch label");
  assert.ok(/<\/svg>สีมงคล<\/span>/.test(html), "icon label");
});
