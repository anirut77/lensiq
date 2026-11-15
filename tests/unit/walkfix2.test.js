"use strict";
// tests/unit/walkfix2.test.js — second customer walk-through 2026-11-16 (~/LENSIQ-field/review/walkthrough-2026-11-16/DEFECTS.md),
// static checks. FIXED TEST: written and locked (~/LENSIQ-field/evals/walk-fix-2/, sha256 in evals-locks/walk-fix-2.sha256)
// BEFORE the fixes on branch walk-fix-2. Browser checks: tests/e2e/walkfix2.e2e.mjs (Chrome), walkfix2-webkit.e2e.mjs (iPhone).
//   D-02  PIN / QR cards link to the PIN / QR time clock (attendance.html?mode=employee): cat-hr attendance card (generated),
//         solutions hr1; the home "organisation" use case offers the PIN / QR link and names the face page as face
//   D-03  help.html shows the quote LINE OA from the single source (data-seller="quote_line"), in TH / EN / ZH; the demo banner
//         wording (owner decision) is left exactly as it is
//   D-05  no sentence boundary glued by a Thai line break (gate, price notes on every page, crowd in/out hint, omr intro)
//   D-06  crowd.html: one status word (ทดลอง / Experimental / 实验性), no English "(PRELIMINARY)" inside Thai, no dangling link text
//   D-07  solutions edu2 card: liveness only with "off by default" and "not measured" (TH / EN / ZH)
//   D-08  exam.html first note uses the category status pilot-ready, not "demo" (TH / EN / ZH)
//   D-09  exam.html "why it does not decide": reasons 2 and 3 name a source with a year (TH / EN / ZH)
//   D-10  omr.html: status Experimental, accuracy "not measured" with source synthetic, a demo link (TH / EN / ZH)
//   D-11  help.html: a "getting started" section per product (Exam, Attendance, Gate, Crowd) in TH / EN / ZH, linking each page
//   D2-011 the try-on and PDF-converter server status is asked only behind config switches that ship off
//   W-031 the Gate sign (gate-notice.html poster) also exists in Chinese, and the Gate pages say TH / EN / ZH
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const EMP = "attendance.html?mode=employee";
const THAI = /[฀-๿]/;
/** value of a key in an i18n/*.js dictionary file */
function dict(file, key) {
  const src = read(file), k = JSON.stringify(key).slice(1, -1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = src.match(new RegExp(`"${k}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  return m ? JSON.parse(`"${m[1]}"`) : null;
}
/** the Thai default text of the element carrying data-i18n="key" in an html file, as a browser lays it out: a line break
 *  between two Thai characters disappears (worst case, as measured on WebKit / Chrome in the walk-through), other runs of
 *  white space become one space; tags are dropped */
function thText(file, key) {
  const src = read(file), k = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = src.match(new RegExp(`<(\\w+)[^>]*data-i18n="${k}"[^>]*>([\\s\\S]*?)</\\1>`));
  return m ? layout(m[2]) : null;
}
const layout = s => s.replace(/<[^>]+>/g, "").replace(/([฀-๿])[ \t]*\n\s*(?=[฀-๿])/g, "$1").replace(/\s+/g, " ").trim();
const cards = (html, re) => [...html.matchAll(re)].map(m => ({ id: m[1], body: m[0] }));

test("D-02: PIN / QR cards open the PIN / QR time clock", () => {
  const hr = read("cat-hr.html").match(/<article class="pd-card cat-tool" data-page="attendance"[\s\S]*?<\/article>/)[0];
  const hrefs = [...hr.matchAll(/href="(attendance\.html[^"]*)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
  assert.ok(hrefs.length >= 1, "cat-hr attendance card has links");
  assert.deepEqual(hrefs.filter(h => h !== EMP), [], "every cat-hr attendance link opens the PIN / QR time clock: " + hrefs);
  const sol = read("solutions.html");
  const hr1 = cards(sol, /<article class="sl-card" data-status="\w+" id="sol-(hr1)">[\s\S]*?<\/article>/g)[0].body;
  const h1 = [...hr1.matchAll(/href="(attendance\.html[^"]*)"/g)].map(m => m[1].replace(/&amp;/g, "&"));
  assert.deepEqual(h1.filter(h => h !== EMP), [], "every solutions hr1 attendance link opens the PIN / QR time clock: " + h1);
  assert.ok(!/data-i18n="sl\.pg\.attendance"/.test(hr1), "hr1 no longer labels its page link as face check-in");
  // home page, use case "organisation": the PIN / QR time clock is offered; a bare link there names the face page as face
  const org = read("index.html").match(/<h3 data-i18n="home\.uc\.org">[\s\S]*?<\/article>/)[0];
  assert.ok(org.includes(`href="${EMP}"`), "home organisation use case links the PIN / QR time clock");
  for (const m of org.matchAll(/<a href="attendance\.html"[^>]*data-i18n="([\w.]+)"[^>]*>([^<]*)<\/a>/g)) {
    assert.match(m[2], /ใบหน้า/, "bare attendance link on the home page names face (TH): " + m[2]);
    assert.match(dict("i18n/en-common.js", m[1]) || "", /face/i, "EN " + m[1]);
    assert.match(dict("i18n/zh-common.js", m[1]) || "", /人脸|面部|刷脸/, "ZH " + m[1]);
  }
});

test("D-03: help.html shows the quote LINE OA from the single source; demo banner wording untouched (owner decision)", () => {
  const help = read("help.html");
  assert.ok(!/data-seller="line"/.test(help), "help.html still uses the empty LENSIQ_SELLER.line placeholder");
  for (const id of ["h-support", "en-h-support", "zh-h-support"]) {
    const sec = help.match(new RegExp(`<section id="${id}">[\\s\\S]*?</section>`))[0];
    assert.match(sec, /data-seller="quote_line"/, id + ": LINE from LENSIQ_SELLER.quote_line");
  }
  assert.ok(help.includes("<b>ประกาศสำหรับเดโม — ยังไม่มีบริการแบบชำระเงินเปิดให้ใช้</b>ทุกอย่างบนเว็บไซต์นี้ใช้ได้ฟรี"),
    "the TH demo banner (free / paid wording) is an owner decision and stays exactly as it was");
});

test("D-05: no sentence glued together by a Thai line break", () => {
  const files = ["gate.html", "crowd.html", "omr.html", "exam.html", "attendance.html", "index.html", "parking.html", "village.html", "pricing.html"];
  const glued = ["ภาพป้ายไทยผลกับ", "ยังไม่บังคับใช้เรา", "อุปกรณ์แพ็กเกจ", "ทิศตรงข้าม\"คง", "ทิศตรงข้าม“คง", "ทันทีครู"];
  const bad = [];
  for (const f of files) {
    const text = layout(read(f));
    for (const g of glued) if (text.includes(g)) bad.push(`${f}: …${g}…`);
  }
  assert.deepEqual(bad, []);
  assert.match(thText("gate.html", "gate.assist"), /ภาพป้ายไทย\S*\s+ผลกับภาพถ่ายจริง/);
  assert.match(thText("omr.html", "om.lead"), /ทันที\s+ครู/);
});

test("D-06: crowd.html — one status word, no English inside Thai, no dangling link text", () => {
  const html = read("crowd.html");
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const badges = [...main.matchAll(/<b class="beta" data-i18n="([\w.]+)">([^<]*)<\/b>/g)];
  assert.ok(badges.length >= 2, "crowd status badges");
  for (const [, key, th] of badges) {
    assert.equal(th.trim(), "ทดลอง", `badge ${key}: «${th}»`);
    assert.equal(dict("i18n/en-crowd.js", key) || dict("i18n/en-zones.js", key), "Experimental", "EN " + key);
    assert.equal(dict("i18n/zh-crowd.js", key) || dict("i18n/zh-zones.js", key), "实验性", "ZH " + key);
  }
  assert.ok(!/PRELIMINARY/.test(main), "English (PRELIMINARY) inside the Thai text");
  for (const m of main.matchAll(/<a [^>]*href="cameras\.html#accuracy"[^>]*>([^<]*)<\/a>/g)) {
    assert.notEqual(m[1].trim(), "ความแม่นยำที่วัดได้", "the accuracy link reads as a dangling phrase");
  }
});

test("D-07: the solutions face check-in card claims liveness only as off by default and not measured", () => {
  const th = thText("solutions.html", "sl.c.edu2.p"), en = dict("i18n/en-solutions.js", "sl.c.edu2.p"), zh = dict("i18n/zh-solutions.js", "sl.c.edu2.p");
  assert.ok(!/มีการตรวจความมีชีวิต/.test(th), "TH: " + th);
  const rules = [
    [th, /มีชีวิต|คนจริง/, /ปิดไว้เป็นค่าเริ่มต้น|ปิดเป็นค่าเริ่มต้น/, /ยังไม่ได้วัด/],
    [en, /liveness|live person|real person/i, /off by default/i, /not (yet )?measured/i],
    [zh, /活体|真人/, /默认关闭/, /尚未测量|未经测量/]
  ];
  for (const [t, live, off, unmeasured] of rules) {
    assert.ok(t, "text present");
    if (live.test(t)) { assert.match(t, off, t); assert.match(t, unmeasured, t); }
  }
});

test("D-08: exam.html first note uses the category status (pilot-ready), not 'demo'", () => {
  const th = thText("exam.html", "exam.l.betaB"), en = dict("i18n/en-exam.js", "exam.l.betaB"), zh = dict("i18n/zh-exam.js", "exam.l.betaB");
  assert.ok(th.startsWith("พร้อมนำร่อง") && !/เดโม/.test(th), "TH: " + th);
  assert.ok(en.startsWith(dict("i18n/en-cat.js", "cat.st.pilot-ready")) && !/demo/i.test(en), "EN: " + en);
  assert.ok(zh.startsWith(dict("i18n/zh-cat.js", "cat.st.pilot-ready")) && !/演示/.test(zh), "ZH: " + zh);
});

test("D-09: exam.html reasons 2 and 3 each name a source with a year (TH / EN / ZH)", () => {
  for (const key of ["exam.l.why2", "exam.l.why3"]) {
    for (const t of [thText("exam.html", key), dict("i18n/en-exam.js", key), dict("i18n/zh-exam.js", key)]) {
      assert.ok(t, key);
      assert.match(t, /(19|20)\d\d/, `${key}: no year: ${t}`);
      assert.match(t, /[A-Z][A-Za-z]+/, `${key}: no named source: ${t}`);
    }
  }
});

test("D-10: omr.html states status, accuracy with its source, and offers a demo (TH / EN / ZH)", () => {
  const html = read("omr.html");
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  const st = main.match(/<b class="[^"]*\bbeta\b[^"]*" data-i18n="([\w.]+)">([^<]*)<\/b>/);
  assert.ok(st && st[2].trim() === "ทดลอง", "status label ทดลอง");
  assert.equal(dict("i18n/en-omr.js", st[1]), "Experimental");
  assert.equal(dict("i18n/zh-omr.js", st[1]), "实验性");
  const acc = main.match(/<[^>]+data-i18n="([\w.]+)"[^>]*>([^<]*ยังไม่ได้วัด[^<]*)</);
  assert.ok(acc && /สังเคราะห์/.test(acc[2]), "accuracy line: not measured, source synthetic");
  assert.match(dict("i18n/en-omr.js", acc[1]) || "", /not (yet )?measured[\s\S]*synthetic|synthetic[\s\S]*not (yet )?measured/i);
  assert.match(dict("i18n/zh-omr.js", acc[1]) || "", /尚未[\s\S]*合成|合成[\s\S]*尚未/);
  assert.match(main, /href="omr\.html\?demo=1"/, "demo link");
  assert.match(read("omr.js"), /demo/, "omr.js handles demo mode");
});

test("D-11: help.html has a getting-started section per product in TH / EN / ZH", () => {
  const help = read("help.html");
  const links = ["exam.html", EMP, "gate.html", "crowd.html"];
  const names = { th: [/Exam|คุมสอบ/, /ลงเวลา/, /Gate|ป้ายทะเบียน/, /Crowd|นับคน/], en: [/Exam/, /Attendance|time clock/i, /Gate/, /Crowd/], zh: [/Exam|监考/, /考勤|打卡/, /Gate|车牌/, /Crowd|人数/] };
  for (const [lang, id] of [["th", "h-start"], ["en", "en-h-start"], ["zh", "zh-h-start"]]) {
    const m = help.match(new RegExp(`<section id="${id}">([\\s\\S]*?)</section>`));
    assert.ok(m, `${lang}: section #${id}`);
    for (const l of links) assert.ok(m[1].includes(`href="${l}"`), `${lang}: links ${l}`);
    for (const re of names[lang]) assert.match(m[1], re, `${lang}: names ${re}`);
    if (lang !== "th") assert.ok(!THAI.test(m[1].replace(/<[^>]+>/g, "")), `${lang}: Thai left in #${id}`);
  }
});

test("D2-011: try-on and converter server status only behind switches that ship off", () => {
  const cfg = read("lensiq-config.js");
  assert.match(cfg, /window\.LENSIQ_TRYON\s*=\s*window\.LENSIQ_TRYON\s*===\s*true/);
  assert.match(cfg, /window\.LENSIQ_CONVERT_SERVER\s*=\s*window\.LENSIQ_CONVERT_SERVER\s*===\s*true/);
  const pb = read("photobooth.js"), cv = read("converter.js");
  for (const m of pb.matchAll(/fetch\("\/api\/tryon\/status"/g)) assert.match(pb.slice(Math.max(0, m.index - 200), m.index), /LENSIQ_TRYON/, "photobooth status fetch is behind LENSIQ_TRYON");
  for (const m of cv.matchAll(/fetch\("\/api\/convert(?:\/status)?"/g)) assert.match(cv.slice(Math.max(0, m.index - 300), m.index), /LENSIQ_CONVERT_SERVER/, "converter server call is behind LENSIQ_CONVERT_SERVER");
});

test("W-031: the Gate sign exists in Chinese too", () => {
  const html = read("gate-notice.html");
  const poster = html.match(/<div class="gn-poster[\s\S]*?\n {2}<\/div>/)[0];
  const zh = poster.match(/<div[^>]*lang="zh(?:-Hans)?"[^>]*>([\s\S]*?)<\/div>/);
  assert.ok(zh, "poster has a Chinese block");
  assert.match(zh[1], /车牌识别/, "Chinese heading");
  assert.ok(!THAI.test(zh[1].replace(/<[^>]+>/g, "")), "no Thai in the Chinese block");
  assert.match(read("gate-notice.js"), /purpose_zh/);
  for (const k of ["gate.pdpa.p", "gn.lead"]) assert.match(dict("i18n/zh-gate.js", k) || "", /中文/, "ZH " + k);
  for (const k of ["gate.pdpa.p", "gn.lead"]) assert.match(dict("i18n/en-gate.js", k) || "", /Chinese/, "EN " + k);
  assert.match(thText("gate.html", "gate.pdpa.p") || "", /จีน/, "TH gate.pdpa.p");
  assert.match(thText("gate-notice.html", "gn.lead") || "", /จีน/, "TH gn.lead");
});
