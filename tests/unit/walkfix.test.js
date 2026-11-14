"use strict";
// tests/unit/walkfix.test.js — buyer walkthrough 2026-11-14 (~/LENSIQ-field/review/walkthrough-2026-11-14/DEFECTS.md),
// static checks for the product / accuracy fixes. FIXED TEST: written and locked (~/LENSIQ-field/evals/walk-fix/, sha256 in
// evals-locks/walk-fix.sha256) BEFORE the fixes on branch walk-fix. Browser checks: tests/e2e/walkfix.e2e.mjs and
// tests/e2e/walkfix-webkit.e2e.mjs. Synthetic data only; no network.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const read = f => readFileSync(join(ROOT, f), "utf8");
const THAI = /[฀-๿]/;
const CJK = /[一-鿿]/g;

/** value of "key": "..." in an i18n dictionary file (en-/zh-) */
function dictVal(file, key) {
  const src = read(file);
  const m = src.match(new RegExp('"' + key.replace(/\./g, "\\.") + '":\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  return m ? JSON.parse('"' + m[1] + '"') : null;
}
/** Thai default text of the element with data-i18n="key" in an html file (inner text, tags stripped, spaces folded) */
function thVal(file, key) {
  const src = read(file);
  const m = src.match(new RegExp('data-i18n="' + key.replace(/\./g, "\\.") + '"[^>]*>([\\s\\S]*?)</'));
  return m ? m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim() : null;
}
/** every en-/zh- dictionary a page loads (zh scripts in the page + zh-common; en = sibling) */
function dictsOf(page) {
  const src = read(page);
  const zh = ["i18n/zh-common.js", ...[...src.matchAll(/src="(i18n\/zh-[a-z0-9-]+\.js)/g)].map(m => m[1])];
  return { zh, en: zh.map(f => f.replace("/zh-", "/en-")) };
}
const inDicts = (files, key) => files.some(f => existsSync(join(ROOT, f)) && dictVal(f, key) != null);
const nums = s => (String(s).match(/\d+/g) || []).map(Number);

const FORM_OPTIONS = [...read("index.html").matchAll(/<option value="([a-z]*)"/g)].map(m => m[1]).filter(Boolean);

// ---------------------------------------------------------------- W-002 / W-017: quote + demo from every product page
const PRODUCTS = [
  { page: "exam.html", interest: "exam", demo: /href="exam-(?:lab|dashboard)\.html\?demo=1"/ },
  { page: "attendance.html", interest: "attendance", demo: /href="attendance\.html\?mode=employee&(?:amp;)?demo=1"/ },
  { page: "gate.html", interest: "gate", demo: /href="(?:village|parking)\.html\?demo=1"/ },
  { page: "crowd.html", interest: "crowd", demo: /href="crowd\.html\?demo=1"/ }
];

test("W-002: each sellable product page links to the quote form (product preselected) and to its ?demo=1 sample, TH/EN/ZH", () => {
  for (const p of PRODUCTS) {
    const src = read(p.page), d = dictsOf(p.page);
    const q = src.match(new RegExp(`<a [^>]*href="index\\.html\\?interest=${p.interest}#contact"[^>]*data-i18n="([\\w.-]+)"[^>]*>([^<]+)</a>`));
    assert.ok(q, p.page + ": quote link to index.html?interest=" + p.interest + "#contact");
    assert.match(q[2], /ขอใบเสนอราคา/, p.page + ": quote button text");
    const dm = src.match(new RegExp(`<a [^>]*${p.demo.source.replace(/^href=/, "href=")}[^>]*data-i18n="([\\w.-]+)"[^>]*>([^<]+)</a>`));
    assert.ok(dm, p.page + ": demo link " + p.demo);
    assert.match(dm[2], /ดูเดโม/, p.page + ": demo button text");
    for (const k of [q[1], dm[1]]) {
      assert.ok(inDicts(d.en, k), `${p.page}: EN text for ${k}`);
      assert.ok(inDicts(d.zh, k), `${p.page}: ZH text for ${k}`);
    }
  }
});

test("W-017: every ?interest= link on any page names an option of the quote form; category CTAs preselect their product", () => {
  const { readdirSync } = require("node:fs");
  const html = readdirSync(ROOT).filter(f => f.endsWith(".html"));
  const bad = [];
  for (const f of html) for (const m of read(f).matchAll(/index\.html\?interest=([a-z]+)/g)) if (!FORM_OPTIONS.includes(m[1])) bad.push(f + ": " + m[1]);
  for (const m of read("tools/cat-pages.mjs").matchAll(/interest=([a-z]+)/g)) if (!FORM_OPTIONS.includes(m[1])) bad.push("tools/cat-pages.mjs: " + m[1]);
  assert.deepEqual(bad, [], "interest values with no form option");
  for (const [cat, want] of [["cat-education.html", "exam"], ["cat-security.html", "gate"], ["cat-hr.html", "attendance"], ["cat-marketing.html", "crowd"]])
    assert.match(read(cat), new RegExp(`href="index\\.html\\?interest=${want}#contact"`), cat);
});

// ---------------------------------------------------------------- W-004 / W-025 / W-026: Attendance = PIN/QR time clock, face optional
test("W-004: attendance.html — PIN / QR is the first tab, the employee-mode h1 is a PIN/QR time clock (face optional), face kept", () => {
  const src = read("attendance.html");
  const tabs = [...src.matchAll(/<button class="tab[^"]*" data-t="(\w+)"/g)].map(m => m[1]);
  assert.equal(tabs[0], "pin", "first tab: " + tabs.join(","));
  for (const t of ["checkin", "register", "records", "check"]) assert.ok(tabs.includes(t), "face tab kept: " + t);
  const h1 = src.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)[1];
  const emp = h1.match(/<span class="emp-only" data-i18n="([\w.]+)">([^<]+)<\/span>/);
  assert.ok(emp, "employee-mode h1 span");
  assert.match(emp[2], /PIN/); assert.match(emp[2], /QR/); assert.match(emp[2], /ใบหน้า/);
  for (const f of ["i18n/en-attendance.js", "i18n/zh-attendance.js"]) {
    const v = dictVal(f, emp[1]);
    assert.ok(v && /PIN/.test(v) && /QR/.test(v), f + ": " + v);
  }
  assert.match(dictVal("i18n/en-attendance.js", emp[1]), /optional/i);
  assert.match(dictVal("i18n/zh-attendance.js", emp[1]), /可选/);
  const intro = thVal("attendance.html", "attendance.hr.pinIntro");
  assert.ok(intro && !/ไม่ผ่าน/.test(intro), "the PIN pane is not framed as the fallback: " + intro);
  assert.ok(!/fails/i.test(dictVal("i18n/en-attendance.js", "attendance.hr.pinIntro")), "EN pinIntro not a fallback");
});

test("W-025: menu / category card title for attendance is the PIN/QR time clock in TH/EN/ZH (face optional)", () => {
  const m = read("nav.js").match(/\{ href: "attendance\.html", title: "([^"]+)", desc: "([^"]+)" \}/);
  assert.ok(m, "nav entry");
  assert.match(m[1], /PIN/); assert.match(m[1], /QR/);
  assert.ok(!/^เช็คชื่อด้วยใบหน้า$/.test(m[1]), m[1]);
  for (const f of ["i18n/en-common.js", "i18n/zh-common.js"]) {
    for (const k of ["nav.attendance.title", "foot.attendance"]) {
      const v = dictVal(f, k);
      assert.ok(v && /PIN/.test(v) && /QR/.test(v), `${f} ${k}: ${v}`);
    }
  }
  assert.match(read("cat-hr.html"), /data-i18n="nav\.attendance\.title">[^<]*PIN[^<]*</, "cat-hr card title");
});

// ---------------------------------------------------------------- W-005 / W-006 / W-032: numbers follow the registry
test("W-005: gate.html plate-finder and plate-check lines use the registry numbers (labels v3) in TH/EN/ZH", () => {
  const F = JSON.parse(read("docs/accuracy-figures.json"));
  const fig = k => Number((F.figures || F)[k] ? ((F.figures || F)[k].value) : NaN);
  const top = [fig("gateTopX"), fig("gateTopN")], none = [fig("gateNoneN"), fig("gateNoneDev"), fig("gateNoneHoN")];
  assert.deepEqual(top, [14, 32]); assert.deepEqual(none, [19, 11, 8]);
  const l3 = [thVal("gate.html", "gate.acc.l3"), dictVal("i18n/en-gate.js", "gate.acc.l3"), dictVal("i18n/zh-gate.js", "gate.acc.l3")];
  const l7 = [thVal("gate.html", "gate.acc.l7"), dictVal("i18n/en-gate.js", "gate.acc.l7"), dictVal("i18n/zh-gate.js", "gate.acc.l7")];
  for (const s of l3) { const n = nums(s); assert.ok(n.includes(14) && n.includes(32) && !n.includes(13), "l3: " + s); }
  for (const s of l7) { const n = nums(s); assert.ok(n.includes(19) && n.includes(11) && n.includes(8) && !n.includes(10) && !n.includes(9), "l7: " + s); }
  assert.ok(!/13 จาก 32|0 จาก 9\b/.test(read("gate.html")));
});

test("W-006: gate.html pilot target = PILOT-GATE §5 (≥ 200 reads, night ≥ 40, motorcycles ≥ 30; day ≥ 95%, night ≥ 85%) in TH/EN/ZH", () => {
  const pg = read("docs/pilot/PILOT-GATE.md");
  assert.match(pg, /≥ 200 \(กลางคืน ≥ 40, มอเตอร์ไซค์ ≥ 30\)/);
  const l6 = [thVal("gate.html", "gate.acc.l6"), dictVal("i18n/en-gate.js", "gate.acc.l6"), dictVal("i18n/zh-gate.js", "gate.acc.l6")];
  for (const s of l6) {
    const n = nums(s);
    for (const want of [200, 40, 30, 95, 85]) assert.ok(n.includes(want), `l6 has ${want}: ${s}`);
    assert.ok(!n.includes(100), "no old 100-car bar: " + s);
  }
});

test("W-032: the Crowd onboarding guide gives the same undercount range as LAUNCH-READINESS (26–59%)", () => {
  assert.match(read("docs/LAUNCH-READINESS.md"), /26–59%/);
  const g = read("docs/sales/ONBOARDING-CROWD.md");
  assert.ok(!/26–58/.test(g), "old 26–58 range");
  assert.match(g, /26–59%/);
});

// ---------------------------------------------------------------- W-009 / W-024: no repository paths or internal codes on customer pages
test("W-009: gate / village / parking pages and their dictionaries show no repository path (docs/…)", () => {
  for (const f of ["gate.html", "village.html", "parking.html", "i18n/en-gate.js", "i18n/zh-gate.js", "i18n/en-gate-village.js",
    "i18n/zh-gate-village.js", "i18n/en-gate-parking.js", "i18n/zh-gate-parking.js"]) assert.ok(!/docs\//.test(read(f)), f);
});

test("W-024: category cards for Attendance / HR / customers and the Exam dashboard carry no internal codes (F5/F6, PILOT-PLAN, .md, §)", () => {
  const D = require(join(ROOT, "tools", "cat-data.cjs"));
  const bad = /F\d\/F\d|PILOT-PLAN|\.md\b|§|OP-\d/;
  for (const [k, v] of [["REASONS.attendance", D.REASONS.attendance], ["REASONS.customers", D.REASONS.customers], ["CLAIMS.hrPilot", D.CLAIMS.hrPilot]])
    for (const l of ["th", "en", "zh"]) assert.ok(!bad.test(v[l]), `${k}.${l}: ${v[l]}`);
  for (const f of ["cat-hr.html", "cat-marketing.html"]) assert.ok(!/F5\/F6|PILOT-PLAN/.test(read(f)), f);
  const ln = [thVal("exam-dashboard.html", "exam.db.linkNote"), dictVal("i18n/en-exam.js", "exam.db.linkNote"), dictVal("i18n/zh-exam.js", "exam.db.linkNote")];
  for (const s of ln) assert.ok(s && !/docs\/|\.md\b/.test(s), "exam.db.linkNote: " + s);
});

// ---------------------------------------------------------------- W-010 / W-011: Crowd heading and event presets
test("W-010: the Crowd accuracy panel heading says 'preliminary' once, with no English inside the Thai heading", () => {
  const sum = read("crowd.html").match(/<summary>([\s\S]*?)<\/summary>/g).find(s => /cr\.acc2\.h/.test(s));
  const txt = sum.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  assert.equal((txt.match(/เบื้องต้น/g) || []).length, 1, txt);
  assert.ok(!/[A-Z]{3,}/.test(txt), txt);
  const en = dictVal("i18n/en-crowd.js", "cr.acc2.h") + " " + dictVal("i18n/en-crowd.js", "cr.acc2.pre");
  const zh = dictVal("i18n/zh-crowd.js", "cr.acc2.h") + " " + dictVal("i18n/zh-crowd.js", "cr.acc2.pre");
  assert.equal((en.match(/preliminary/gi) || []).length, 1, en);
  assert.equal((zh.match(/初步/g) || []).length, 1, zh);
});

test("W-011: Crowd zone roles and the conversion default use event wording (entrance, booth / stage, sign-ups)", () => {
  const js = read("crowd.js");
  const role = js.match(/const roleName = r => r === "pass" \? T\("cr\.role\.pass", "([^"]+)"\) : r === "stop" \? T\("cr\.role\.stop", "([^"]+)"\)/);
  assert.ok(role, "roleName");
  assert.ok(!/ร้าน|ตู้โชว์/.test(role[1] + role[2]), "no shop wording: " + role[1] + " / " + role[2]);
  assert.match(role[2], /บูธ/); assert.match(role[2], /เวที/);
  for (const [f, re] of [["i18n/en-crowd.js", /shop|window/i], ["i18n/zh-crowd.js", /店|橱窗/]]) {
    for (const k of ["cr.role.pass", "cr.role.stop", "cr.demo.stop"]) assert.ok(!re.test(dictVal(f, k)), `${f} ${k}: ${dictVal(f, k)}`);
  }
  assert.match(js, /convKind: "signup"/, "sign-ups by default");
  const sel = read("crowd.html").match(/<select name="convKind"[^>]*>([\s\S]*?)<\/select>/);
  assert.ok(sel, "convKind select");
  assert.match(sel[1].match(/<option[^>]*>/)[0], /value="signup"/, "sign-ups listed first");
  assert.ok(!/ตู้โชว์/.test(js.match(/T\("cr\.demo\.stop", "([^"]+)"\)/)[1]), "demo zone name");
});

// ---------------------------------------------------------------- W-012: one status vocabulary, matching each page's status
test("W-012: solutions.html badges match each linked page's status (cat-data); Crowd is experimental; tag class = data-status", () => {
  const D = require(join(ROOT, "tools", "cat-data.cjs"));
  const html = read("solutions.html");
  const cards = [...html.matchAll(/<article class="sl-card" data-status="(\w+)" id="sol-([\w]+)">([\s\S]*?)<\/article>/g)];
  assert.ok(cards.length > 50);
  const label = { "pilot-ready": D.STATUS["pilot-ready"].th, experimental: D.STATUS.experimental.th, demo: D.STATUS.demo.th };
  const rank = { demo: 0, experimental: 1, "pilot-ready": 2 };
  const bad = [], prCodes = new Set(), otherCodes = new Set();
  for (const [, code, id, body] of cards) {
    const tag = body.match(/<span class="sl-tag (\w+)" data-i18n="([\w.]+)">([^<]+)<\/span>/);
    if (!tag) { bad.push(id + ": no tag"); continue; }
    if (tag[1] !== code) bad.push(`${id}: tag class ${tag[1]} != data-status ${code}`);
    const href = (body.match(/class="sl-go" href="([a-z0-9-]+)\.html/) || [])[1];
    if (code === "soon") { if (href) bad.push(id + ": coming soon with a page link"); continue; }
    const st = href && D.PAGES[href] && D.PAGES[href].st;
    if (!st || !(st in rank)) { bad.push(`${id}: linked page ${href} has no product status`); continue; }
    // the card names the status it shows; it may be weaker than the page (e.g. face check-in), never stronger
    const shown = Object.keys(label).find(k => label[k] === tag[3].trim());
    if (!shown) bad.push(`${id}: tag text «${tag[3]}» is not a category status`);
    else if (rank[shown] > rank[st]) bad.push(`${id}: shows ${shown} but ${href} is ${st}`);
    // amendment 2: the filter code is internal; what counts is that pilot-ready cards and the other cards never share a code
    // (docs/claim-rules.json "crowd-not-available-now" forbids code "now" on the Crowd cards, so the codes may be swapped)
    if (shown) (shown === "pilot-ready" ? prCodes : otherCodes).add(code);
    if (href === "crowd" && shown !== "experimental") bad.push(id + ": Crowd must show experimental");
  }
  assert.deepEqual(bad, []);
  assert.ok(prCodes.size === 1 && otherCodes.size === 1 && ![...prCodes].some(c => otherCodes.has(c)), `one code per group: ${[...prCodes]} / ${[...otherCodes]}`);
  const fbtn = c => (html.match(new RegExp(`data-f="${c}"[^>]*>([^<]+)<`)) || [])[1] || "";
  assert.equal(fbtn([...prCodes][0]).trim(), label["pilot-ready"], "filter button of the pilot-ready group");
  assert.match(fbtn([...otherCodes][0]), new RegExp(label.experimental), "filter button of the experimental / demo group");
  assert.ok(!/ใช้ได้แล้ว<\/span>/.test(html), "no 'available now' badge");
  for (const f of ["i18n/en-solutions.js", "i18n/zh-solutions.js"]) {
    assert.equal(dictVal(f, "sl.st.pilot"), D.STATUS["pilot-ready"][f.includes("/en-") ? "en" : "zh"], f + " sl.st.pilot");
  }
});

// ---------------------------------------------------------------- W-019 / W-020 / W-021 / W-023 / W-034: Exam (lab) demo and wording
test("W-019 / W-020: the dashboard demo uses lab signals only and the same room as the candidate demo", () => {
  const src = read("lensiq-demo-data.js");
  const lab = src.match(/D\.seed\("lq-exam-lab", \{ room: "([A-Z0-9]+)", seat: "([^"]+)" \}\)/);
  const room = src.match(/const ROOM = "([A-Z0-9]+)"/);
  assert.ok(lab && room, "seeds");
  assert.equal(lab[1], room[1], "same demo room on both pages");
  const seats = src.match(/D\.seed\("lq-exam-db", \{ room: ROOM, who: NAME, seats: "(\d+)-(\d+)" \}\)/);
  assert.ok(seats && /^\d+$/.test(lab[2]) && +lab[2] >= +seats[1] && +lab[2] <= +seats[2], "the candidate seat is on the dashboard map: " + lab[2]);
  const block = src.slice(src.indexOf('page === "exam-dashboard"'), src.indexOf("Attendance: employee time clock"));
  const rows = block.match(/const rows = \[([\s\S]*?)\];/)[1];
  assert.ok(!/"hall"/.test(rows), "no hall-mode source in the sample rows");
  for (const s of ["lean", "aisle", "empty", "early", "extra", "neighbour"]) assert.ok(!new RegExp(`"${s}"`).test(rows), "hall signal " + s);
});

test("W-021: the candidate demo does not say the camera is running", () => {
  const js = read("exam-lab.js");
  assert.match(js, /demo\.exam\.mon/, "exam-lab.js swaps the monitor text in demo mode");
  for (const f of ["i18n/en-demo.js", "i18n/zh-demo.js"]) {
    const v = dictVal(f, "demo.exam.mon");
    assert.ok(v && !/is running|正在运行|运行中/.test(v), f + ": " + v);
  }
});

test("W-023: the Exam lab plan names one unit (a computer lab) in TH / EN / ZH, page and one-pager", () => {
  const th = thVal("exam.html", "exam.l.p2n");
  assert.match(th, /฿990 \/ เดือน \/ ห้องแล็บคอมพิวเตอร์/, th);
  assert.match(dictVal("i18n/en-exam.js", "exam.l.p2n"), /฿990 \/ month \/ computer lab/);
  assert.match(dictVal("i18n/zh-exam.js", "exam.l.p2n"), /计算机机房/);
  const op = read("docs/ONE-PAGER-EXAM.md");
  assert.match(op, /990 บาท\/เดือน\/ห้องแล็บคอมพิวเตอร์/);
  assert.match(op, /990 THB \/ month per computer lab/);
});

test("W-034: the Exam one-pager and deck open with the lab problem, not the hall problem", () => {
  for (const f of ["docs/ONE-PAGER-EXAM.md", "docs/sales/DECK-EXAM.md"]) {
    const s = read(f), i = s.indexOf("## ปัญหา");
    assert.ok(i >= 0, f);
    const first = s.slice(i).split("\n").find(l => l.startsWith("- "));
    assert.ok(!/ห้องสอบใหญ่/.test(first), f + ": " + first);
    assert.match(first, /ห้องคอมพิวเตอร์|ห้องแล็บ|สอบออนไลน์/, f + ": " + first);
  }
});

// ---------------------------------------------------------------- W-008 / W-033 / W-038: demo scripts match the demo
test("W-008 / W-038: village demo pre-fills a sample operator; panel and script say to press 'อ่านป้ายตอนนี้' and warn about the leading-digit question", () => {
  const src = read("lensiq-demo-data.js");
  const v = src.slice(src.indexOf('page === "village"'), src.indexOf('page === "parking"'));
  assert.match(v, /D\.seed\("lq-gate-village-cfg", \{[^}]*operator: GUARD/, "sample operator");
  assert.match(v, /อ่านป้ายตอนนี้/, "demo panel names the read button");
  for (const f of ["i18n/en-demo.js", "i18n/zh-demo.js"]) assert.ok(/Read plate now|Read now/i.test(dictVal(f, "demo.vg.p")) || /立即识别/.test(dictVal(f, "demo.vg.p")), f);
  const g = read("docs/sales/DEMO-SCRIPT-GATE.md");
  assert.match(g, /อ่านป้ายตอนนี้/); assert.match(g, /เลขนำหน้าไม่แน่ชัด/);
  assert.ok(!/ตอนนี้กรอกเองสดบนหน้า/.test(g), "stale 'type it live' line");
});

test("W-033: Attendance and Crowd demo scripts no longer tell the presenter to fall back to screenshots", () => {
  const a = read("docs/sales/DEMO-SCRIPT-ATTENDANCE.md"), c = read("docs/sales/DEMO-SCRIPT-CROWD.md");
  assert.ok(!/เดือนจะว่าง/.test(a) && !/ให้ใช้ภาพหน้าจอสำรอง/.test(a), "attendance script");
  assert.ok(!/ไม่มีฉากคนเล็กหรือคน 15\+/.test(c), "crowd script");
});

// ---------------------------------------------------------------- W-027 / W-028 / W-029: customer onboarding guides
const GUIDES = ["EXAM", "ATTENDANCE", "GATE", "CROWD"].map(p => "docs/sales/customer/ONBOARDING-" + p + ".md");
test("W-027 / W-028 / W-029: customer onboarding guides in TH / EN / ZH, LINE support, owner placeholders, no internal paths or codes", () => {
  for (const f of GUIDES) {
    assert.ok(existsSync(join(ROOT, f)), f);
    const s = read(f);
    const iEn = s.indexOf("\n## English"), iZh = s.indexOf("\n## 中文");
    assert.ok(s.includes("\n## ภาษาไทย") && iEn > 0 && iZh > iEn, f + ": sections ภาษาไทย / English / 中文 in that order");
    const th = s.slice(0, iEn), en = s.slice(iEn, iZh), zh = s.slice(iZh);
    for (const [n, part] of [["th", th], ["en", en], ["zh", zh]]) {
      assert.ok(part.length > 1500, `${f} ${n}: too short (${part.length})`);
      assert.match(part, /@632yliiw/, `${f} ${n}: LINE support`);
      assert.match(part, /\[เจ้าของจะแจ้ง\]/, `${f} ${n}: owner placeholder for e-mail / phone`);
    }
    assert.ok((th.match(/[฀-๿]/g) || []).length > 800, f + ": Thai section in Thai");
    assert.ok((zh.match(CJK) || []).length > 500, f + ": Chinese section in Chinese");
    for (const [n, part] of [["en", en], ["zh", zh]]) assert.ok(!THAI.test(part.replace(/\[เจ้าของจะแจ้ง\]/g, "")), `${f} ${n}: no Thai outside the placeholder`);
    const BAD = [/docs\//, /\.md\b/, /\bOP-\d/, /PILOT-/, /§/, /READINESS/, /\[อีเมลสนับสนุน\]/, /\[LINE OA\]/, /\[เบอร์โทร\]/, /to confirm/i,
      /ต้องยืนยัน/, /ห้ามแต่ง/, /เจ้าของกรอก/, /DRAFT/, /\bL\d{1,2}\b/];
    for (const re of BAD) assert.ok(!re.test(s), `${f}: internal text ${re}`);
  }
  const crowd = read(GUIDES[3]);
  assert.match(crowd, /26–59%/); assert.match(crowd, /ยังไม่เหมาะกับฝูงชนหนาแน่น/); assert.match(crowd, /not yet suitable for dense crowds/); assert.match(crowd, /尚不适用于密集人群/);
  const gate = read(GUIDES[2]);
  for (const n of ["200", "40", "30"]) assert.ok(gate.includes(n), "gate pilot bar " + n);
  const att = read(GUIDES[1]);
  assert.match(att, /PIN/); assert.match(att, /QR/);
});
