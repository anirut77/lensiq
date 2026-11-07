// tests/unit/i18n-rt.test.js — lensiq-i18n-rt.js (run-time Chinese for text the camera pages write in Thai):
// exact phrases, {placeholder} templates, Thai runs inside mixed strings, dates/prices, unknown names kept, and a
// coverage guard: ≥ 98% of the Thai characters in every camera page's string literals must translate.
// (A new Thai message without an i18n/zh-rt-<page>.js entry shows up here; add the entry.)
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const vm = require("node:vm");

const ROOT = join(__dirname, "..", "..");
const PAGES = ["store", "booth", "signage", "attendance", "customers", "checkout", "qc", "driver", "neuro", "converter"];
const SHARED = ["lensiq-camera.js", "lensiq-detect.js", "lensiq-agg.js", "lensiq-facevault.js", "lensiq-stats.js", "lensiq-config.js", "lensiq-sitecheck.js"];
const TH = /[ก-ฺเ-๎]/g; // Thai letters (not the ฿ sign)

function load(dicts = PAGES) {
  const win = {};
  win.window = win;
  const ctx = vm.createContext(win);
  for (const p of dicts) vm.runInContext(readFileSync(join(ROOT, "i18n", `zh-rt-${p}.js`), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "i18n", "zh-rt-common.js"), "utf8"), ctx);
  vm.runInContext(readFileSync(join(ROOT, "i18n", "zh-rt-sitecheck.js"), "utf8"), ctx); // on-site check + camera health (store/attendance/driver/qc)
  vm.runInContext(readFileSync(join(ROOT, "lensiq-i18n-rt.js"), "utf8"), ctx);
  return win.LQI18N_RTX;
}

// string literals (quotes + template chunks) of a JS source, comments skipped — enough for this code base
function jsStrings(src) {
  const out = []; let i = 0; const n = src.length;
  const prev = () => { let j = i - 1; while (j >= 0 && /\s/.test(src[j])) j--; return src[j] || ""; };
  function tpl() { let b = ""; while (i < n) { const c = src[i]; if (c === "\\") { b += src[i + 1]; i += 2; continue; } if (c === "`") { i++; out.push(b); return; } if (c === "$" && src[i + 1] === "{") { out.push(b); b = ""; i += 2; code(1); continue; } b += c; i++; } out.push(b); }
  function code(depth) {
    while (i < n) {
      const c = src[i];
      if (c === "/" && src[i + 1] === "/") { while (i < n && src[i] !== "\n") i++; continue; }
      if (c === "/" && src[i + 1] === "*") { const e = src.indexOf("*/", i + 2); i = e < 0 ? n : e + 2; continue; }
      if (c === "'" || c === '"') { const q = c; i++; let b = ""; while (i < n && src[i] !== q && src[i] !== "\n") { if (src[i] === "\\") { b += src[i + 1]; i += 2; } else b += src[i++]; } i++; out.push(b); continue; }
      if (c === "`") { i++; tpl(); continue; }
      if (c === "/" && /[(,=:[!&|?{};+\-*%<>~^]|^$/.test(prev())) { i++; let cls = false; while (i < n && src[i] !== "\n") { const d = src[i]; if (d === "\\") { i += 2; continue; } if (d === "[") cls = true; else if (d === "]") cls = false; else if (d === "/" && !cls) break; i++; } i++; continue; }
      if (depth && c === "{") depth++;
      else if (depth && c === "}") { depth--; if (!depth) { i++; return; } }
      i++;
    }
  }
  code(0);
  return out.filter(s => /[฀-๿]/.test(s));
}

test("exact phrases, templates and Thai runs inside mixed strings", () => {
  const R = load();
  assert.equal(R.tr("หยุดวิเคราะห์แล้ว ข้อมูลสรุปถูกบันทึกไว้"), "已停止分析，汇总数据已保存");
  assert.equal(R.tr("กล้อง 3"), "摄像头 3");
  assert.equal(R.tr("  ปิดกล้อง  "), "  关闭摄像头  ", "surrounding whitespace kept");
  assert.equal(R.tr("เข้า 5 · ออก 3"), "进 5 · 出 3");
  assert.equal(R.tr("Hz 9.8 — OK"), "Hz 9.8 — OK", "text without Thai unchanged");
  assert.equal(R.tr(""), "");
});

test("Thai dates, times and prices", () => {
  const R = load();
  assert.equal(R.tr("เริ่มนับ 6 พ.ย. 2569 21:42"), "开始清点 2026年11月6日 21:42");
  assert.equal(R.tr("21:42 น."), "21:42");
  assert.equal(R.tr("14 กุมภาพันธ์ 2568"), "2025年2月14日");
  assert.equal(R.tr("รวม ฿1,234.50"), "合计 1,234.50 泰铢");
});

test("unknown words (names, user data) stay Thai instead of being half-translated", () => {
  const R = load();
  assert.equal(R.tr("สมชาย ใจดี"), "สมชาย ใจดี"); // contains ชาย (= 男) but is not made only of known phrases
  assert.equal(R.tr("ปิดกล้องแล้วเปิดกล้อง"), "摄像头已关闭开启摄像头", "a run made only of known phrases is translated");
});

test("dictionaries pushed after load and templates with several placeholders", () => {
  const R = load([]);
  R.add({ "มี {n} คน รอ {t}": "{n} 人，等待 {t}", "ทดสอบเพิ่ม": "追加测试" });
  assert.equal(R.tr("มี 4 คน รอ 2 นาที"), "4 人，等待 2 分钟");
  assert.equal(R.tr("ทดสอบเพิ่ม"), "追加测试");
});

for (const p of [...PAGES, "shared"]) {
  test(`coverage: Thai string literals of ${p === "shared" ? "shared camera modules" : p + ".js"} translate (≥ 98%)`, () => {
    const R = load();
    const files = p === "shared" ? SHARED : [p + ".js"];
    let th = 0, left = 0; const miss = [];
    for (const f of files) for (const s of jsStrings(readFileSync(join(ROOT, f), "utf8"))) {
      const a = (s.match(TH) || []).length, z = R.tr(s), b = (z.match(TH) || []).length;
      th += a; left += b; if (b) miss.push(z.slice(0, 60));
    }
    assert.ok(th > 0 || p === "converter", "found Thai literals");
    assert.ok(left <= 0.02 * th, `${left}/${th} Thai characters untranslated — add to i18n/zh-rt-${p === "shared" ? "common" : p}.js: ${miss.slice(0, 5).join(" | ")}`);
  });
}

test("every camera page loads the run-time translator and its dictionaries", () => {
  for (const p of PAGES) {
    const html = readFileSync(join(ROOT, p + ".html"), "utf8");
    assert.match(html, /<script src="lensiq-i18n-rt\.js[^"]*"><\/script>/, p);
    assert.match(html, /<script src="i18n\/zh-rt-common\.js[^"]*"><\/script>/, p);
    assert.match(html, new RegExp(`<script src="i18n/zh-rt-${p}\\.js[^"]*"></script>`), p);
  }
});
