"use strict";
// tests/unit/fortune-print-photo.test.js — FIXED TEST SET, owner order 2026-11-17 (decision 82 addition): face reading and palm
// reading print the annotated photo exactly as seen on screen, re-drawn at print resolution from the landmarks in memory, with
// its legend and the headline result on the same page; "include my photo in the report" ON by default, OFF = a neutral outline.
// Locked before the build (~/LENSIQ-field/evals/print-report/, evals-locks/print-report.sha256). Browser half:
// tests/e2e/fortune-print-photo.e2e.mjs.
//   F1  renderer: a "photofig" block = one <figure class="lqp-photofig"> holding the image, the headline result, the caption
//       and every legend entry as text with its non-colour cue; the consent line when the page gives one; text escaped
//   F2  stylesheet: the figure never splits (break-inside: avoid); a compact 80 mm form; the image never wider than the paper
//   F3  the "include my photo in the report" label in TH / EN / ZH (TH exactly "ใส่รูปถ่ายในรายงาน")
//   F4  faceread.js and palm.js register a print figure for their result and draw it from the landmarks with options
//       (size, photo on / off), not from a copy of the screen canvas
//   F5  no image of a real person in the repo's test fixtures for this feature (synthetic only, licence recorded)
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const LP = require("../../fortune-print.js");
const SP = require("../../fortune-share.js");
const CSS = fs.readFileSync(path.join(ROOT, "fortune-print.css"), "utf8");
const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const fig = extra => Object.assign({ t: "photofig", src: PNG, w: 90, alt: "ภาพใบหน้าพร้อมเส้นแบ่งสามส่วน",
  headline: "ธาตุน้ำ 94% · ใบหน้ากลม", caption: "แถบ = สามส่วนของใบหน้า · เส้น = ห้าอวัยวะ · ป้าย = จุดสำคัญ",
  legend: [{ label: "คิ้ว", cue: "เส้นทึบ" }, { label: "ตา", cue: "เส้นประจุด" }, { label: "จมูก <ทรัพย์>", cue: "เส้นประยาว" }] }, extra || {});
const model = b => ({ lang: "th", title: "อ่านโหงวเฮ้ง", sections: [{ level: 2, heading: "ผล", blocks: [b] }] });

test("F1 renderer: photofig keeps image, headline, caption and legend (with cues) in one figure; consent line; escaped", () => {
  for (const size of ["A4", "A5", "80mm"]) {
    const html = LP.render(model(fig()), { size });
    const m = /<figure class="lqp-photofig[^"]*"[^>]*>([\s\S]*?)<\/figure>/.exec(html);
    assert.ok(m, size + ": one photofig figure");
    const f = m[1];
    assert.ok(/<img[^>]+src="data:image\/png;base64,/.test(f), "image inside the figure");
    assert.ok(f.includes("ธาตุน้ำ 94% · ใบหน้ากลม"), "headline inside the figure");
    assert.ok(f.includes("แถบ = สามส่วนของใบหน้า"), "caption inside the figure");
    for (const [l, c] of [["คิ้ว", "เส้นทึบ"], ["ตา", "เส้นประจุด"], ["จมูก &lt;ทรัพย์&gt;", "เส้นประยาว"]]) {
      assert.ok(f.includes(l) && f.includes(c), "legend entry with its cue: " + l);
    }
    assert.ok(!f.includes("<ทรัพย์>"), "legend text escaped");
  }
  const withConsent = LP.render(model(fig({ consent: "ถ่ายภาพคนอื่นได้เฉพาะเมื่อเจ้าตัวรู้และยินยอมแล้วเท่านั้น" })), { size: "A4" });
  assert.ok(/<figure class="lqp-photofig[\s\S]*ถ่ายภาพคนอื่นได้เฉพาะเมื่อเจ้าตัวรู้และยินยอมแล้วเท่านั้น[\s\S]*<\/figure>/.test(withConsent), "consent line kept with the figure");
  assert.ok(!/javascript:|onerror=/.test(LP.render(model(fig({ src: "javascript:alert(1)" })), { size: "A4" })), "only image data URLs");
});

test("F2 stylesheet: the figure never splits; compact on 80 mm; never wider than the paper", () => {
  const rule = sel => { const m = new RegExp("(?:^|[}\\s,])" + sel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*[,{][^}]*\\}", "m").exec(CSS); return m ? m[0] : ""; };
  assert.ok(/break-inside:\s*avoid/.test(rule(".lqp-photofig")), "photofig break-inside: avoid");
  assert.ok(/max-width:\s*100%/.test(rule(".lqp-photofig img")), "image never wider than the paper");
  assert.ok(/\.lqp--r80 \.lqp-photofig/.test(CSS), "compact 80 mm form");
});

test("F3 'include my photo in the report' label in TH / EN / ZH", () => {
  assert.equal(SP.L.th.photoPrint, "ใส่รูปถ่ายในรายงาน");
  assert.ok(/photo/i.test(SP.L.en.photoPrint || "") && /^[\x20-\x7E]+$/.test(SP.L.en.photoPrint), "EN label");
  assert.ok(/[一-鿿]/.test(SP.L.zh.photoPrint || "") && /照片/.test(SP.L.zh.photoPrint), "ZH label");
});

test("F4 faceread and palm register a print figure drawn from the landmarks with options", () => {
  for (const [f, root] of [["faceread.js", "#frResult"], ["palm.js", "#plResult"]]) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    assert.ok(new RegExp("LQPrintFig[\\s\\S]{0,80}" + root.replace("#", "#?")).test(src), f + " registers a print figure for " + root);
    assert.ok(/function drawResultImage\([^)]*opts/.test(src), f + ": drawResultImage takes options (print size, photo on / off)");
    assert.ok(!/toDataURL\([^)]*\)[\s\S]{0,40}resCanvas|resCanvas\.toDataURL/.test(src), f + ": the print figure is not a copy of the screen canvas");
  }
});

test("F5 no image of a real person in this feature's fixtures (synthetic only, licence recorded)", () => {
  const dir = path.join(ROOT, "tests", "fixtures", "print-photo");
  if (!fs.existsSync(dir)) return; // the e2e test uses the synthetic camera (tests/e2e/fake-cams.js); no image files
  const files = fs.readdirSync(dir);
  assert.ok(files.includes("LICENCE.md"), "licence note for the synthetic fixtures");
  for (const f of files) assert.ok(!/\.(jpe?g|png|webp|heic)$/i.test(f) || /synthetic/i.test(f), "only synthetic images: " + f);
});
