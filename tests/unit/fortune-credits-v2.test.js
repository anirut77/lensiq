"use strict";
// tests/unit/fortune-credits-v2.test.js — FIXED TEST SET "fortune-credits__v2" (owner decision 2026-11-18: delete, do not move;
// supersedes the 2026-11-17 night brief and the v1 set tests/unit/fortune-credits.test.js, whose locked bytes stay in
// ~/LENSIQ-field/evals/fortune-credits/ and evals-locks/fortune-credits.sha256). Written and locked (~/LENSIQ-field/evals/
// fortune-credits/v2/, evals-locks/fortune-credits__v2.sha256) BEFORE the v2 product change on branch fortune-credits.
// Static half; the rendered half is tests/e2e/fortune-credits-v2.e2e.mjs. Audit input: tests/unit/fortune-credits-v2-assets.json.
//   D1 label    the reading-source label "เรียบเรียงในเครื่อง · สำนวนใหม่ทุกครั้ง" and its variants / EN / ZH equivalents are deleted
//               from every fortune page: its HTML, its own scripts and every dictionary it loads; no replacement
//   D2 block    the "เกี่ยวกับคำอ่านนี้" block (heading, principles paragraph, calculation notes; luckycolor keeps its own colour-source block) is deleted from every fortune page
//               in TH / EN / ZH; no vendor/ path and no tarot image credit on any reading page
//   D3 no move  help.html has no principles section added (no #h-principles, no "หลักการทำนายของเรา", no lazily loaded section);
//               no fortune page or its own scripts links credits.html or help.html#h-principles
//   D4 credits  every vendor asset a fortune page loads is in the licence audit with its notice shipped; credits.html exists only
//               if an audited licence requires on-page attribution, and then is linked only from the site footer (nav.js)
//   D5 terms    terms.html is byte-identical to main at the base (origin/main 5695734)
//               RE-LOCK 2026-11-18 (owner decision 109: ?v= bumps allowed, text unchanged): terms.html, help.html and legal.js,
//               with every "?v=…" query stripped, are byte-identical to the same stripped form of their base bytes
//               (tests/unit/fixtures/d5-base/*.txt = origin/main 5695734; terms copy has the old TERMS_SHA256_MAIN). Controls:
//               a ?v= bump alone passes; one changed word of the terms text fails.
//               RE-LOCK 2026-11-22 (owner decision 223): terms.html as above; help.html and legal.js = base + the exact
//               decision-223 replacements (listed in D5_223, none touching fortune / crisis text), new sha256 pinned.
//               RE-LOCK 226c (2026-11-22, independent review follow-up): help.html FAQ h-hr shown again, only the team-face
//               line hidden, summary without team face (TH / EN / ZH); 15 listed replacements, new pin (equal strength).
// Fortune pages = category 6 of tools/cat-data.cjs (+ compat). Run: node --test tests/unit/fortune-credits-v2.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");

const ROOT = path.join(__dirname, "..", "..");
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");
const exists = f => fs.existsSync(path.join(ROOT, f));
const D = require(path.join(ROOT, "tools", "cat-data.cjs"));
const AUDIT = JSON.parse(fs.readFileSync(path.join(__dirname, "fortune-credits-v2-assets.json"), "utf8"));
const FORT = [...new Set(D.CATEGORIES.find(c => c.n === 6).pages.concat(["compat"]))].filter(p => exists(p + ".html"));
const TERMS_SHA256_MAIN = "d9fcc8c0f5693a20ce3dbc7e3784474519657e94b82377f2f2fd9850f61af103"; // terms.html at origin/main 5695734
// D5 base bytes (origin/main 5695734), committed as fixtures before this re-lock; the sha256 pins each copy
const D5_BASE = {
  "terms.html": TERMS_SHA256_MAIN,
  "help.html": "0a81f9a076a8a5a3402d0ea4044e27b1711b468e760ab8a5e119e629955b5109",
  "legal.js": "75b23b385d63d938fcc08a9ff7d1ec6bb36acd223ebb92757a9a5860578f6bc8"
};
const stripV = s => s.replace(/\?v=[^"'\s>]*/g, "");

/** local scripts and styles of a page: own scripts (not vendor/, not i18n/), dictionaries (+ en- sibling of each zh-), css */
function partsOf(html) {
  const src = [...html.matchAll(/<script[^>]*\bsrc="([^"?#]+)/g)].map(m => m[1]).filter(s => !/^(?:https?:)?\/\//.test(s));
  const own = src.filter(s => !s.startsWith("vendor/") && !s.startsWith("i18n/") && exists(s));
  const dicts = new Set(src.filter(s => s.startsWith("i18n/")));
  for (const d of [...dicts]) { const en = d.replace(/^i18n\/zh-/, "i18n/en-"); if (exists(en)) dicts.add(en); }
  dicts.add("i18n/en-rt-fortune.js");
  const css = [...html.matchAll(/<link[^>]*href="([^"?#]+\.css)/g)].map(m => m[1]).filter(exists);
  return { src, own, dicts: [...dicts].filter(exists), css };
}
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const htmlText = h => h.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ");

const LABEL_ANY = ["สำนวนใหม่ทุกครั้ง", "เรียบเรียงในเครื่อง ไม่ส่งข้อมูลออก", "Composed on this device", "Generated on this device",
  "worded differently each time", "wording varies each time", "本机生成", "本机撰写", "在本机撰写", "每次说法", "每次措辞"];
const LABEL_TH_BARE = /["'>]\s*เรียบเรียงในเครื่อง\s*["'<]/;
const LABEL_KEYS = /\b(?:fk\.src\.local|horoscope\.x\.srcLocal|tarot\.srcLocal|palm\.src\.local|faceread\.src\.local|numbers\.src\.local|fengshui\.src\.local)\b/;
const ABOUT = ["เกี่ยวกับคำอ่านนี้", "About this reading", "关于本解读"];
const PRINCIPLE = ["หลักการ: เมื่อคุณเลือก", "Principle: when you choose", "原则：选择“直说”"];
const TAROT_CREDIT = ["Pamela Colman Smith", "Rider–Waite–Smith", "Rider-Waite", "Wikimedia Commons", "CREDITS.txt", "ภาพไพ่:", "Card images:", "牌面图片"];
const GONE_IDS = ["trCredit", "plEthics", "fsSourcesNote"];

test("fortune pages found (category 6 + compat, 19)", () => {
  for (const p of ["fortune", "faceread", "palm", "horoscope", "tarot", "iching", "bazi", "taksa", "lek7", "numbers", "fengshui", "dream",
    "zodiac", "compat", "astro", "lifegraph", "planner", "luckycolor", "report"]) assert.ok(FORT.includes(p), p);
});

test("D1 label deleted on every fortune page (HTML, own scripts, loaded dictionaries; TH / EN / ZH)", () => {
  const bad = [];
  for (const p of FORT) {
    const html = read(p + ".html"), { own, dicts } = partsOf(html);
    for (const n of LABEL_ANY) if (html.includes(n)) bad.push(`${p}.html: "${n}"`);
    if (LABEL_TH_BARE.test(html)) bad.push(`${p}.html: bare label`);
    for (const f of own.concat(dicts)) {
      const src = stripComments(read(f));
      for (const n of LABEL_ANY) if (src.includes(n)) bad.push(`${p} -> ${f}: "${n}"`);
      if (LABEL_TH_BARE.test(src)) bad.push(`${p} -> ${f}: bare label`);
      if (LABEL_KEYS.test(src)) bad.push(`${p} -> ${f}: label key`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test("D2 'เกี่ยวกับคำอ่านนี้' block deleted; no vendor/ path, no tarot image credit on any reading page (TH / EN / ZH)", () => {
  const bad = [];
  for (const p of FORT) {
    const html = read(p + ".html"), { own, dicts } = partsOf(html), text = htmlText(html);
    for (const n of ABOUT.concat(PRINCIPLE, TAROT_CREDIT)) if (text.includes(n)) bad.push(`${p}.html text: "${n}"`);
    if (/data-i18n="(?:fortune\.common\.about|compat\.aboutH|(?!lucky\.)[a-z]+\.principle|numbers\.src\.principle)"/.test(html)) bad.push(`${p}.html: about / principle key`);
    for (const id of GONE_IDS) if (new RegExp(`id="${id}"`).test(html)) bad.push(`${p}.html: #${id}`);
    if (/vendor\//.test(text)) bad.push(`${p}.html text: vendor/ path`);
    for (const f of own) {
      const src = stripComments(read(f));
      if (/CREDITS\.txt/.test(src)) bad.push(`${p} -> ${f}: CREDITS.txt`);
      if (/\bimageCredit\b/.test(src.replace(/imageCredit\s*:/g, ""))) bad.push(`${p} -> ${f}: shows KB.imageCredit`);
      if (/["']tarot\.credit["']/.test(src)) bad.push(`${p} -> ${f}: tarot.credit`);
      for (const id of GONE_IDS) if (src.includes("#" + id) || src.includes(`"${id}"`)) bad.push(`${p} -> ${f}: #${id}`);
    }
    for (const f of dicts) {
      const src = stripComments(read(f));
      if (/vendor\//.test(src)) bad.push(`${p} -> ${f}: vendor/ path`);
      for (const n of ABOUT.concat(["Pamela Colman Smith", "CREDITS.txt"])) if (src.includes(n)) bad.push(`${p} -> ${f}: "${n}"`);
    }
  }
  assert.deepEqual([...new Set(bad)], []);
});

test("D3 delete, do not move: no principles section on help.html, no fortune-page link to credits or help principles", () => {
  const help = read("help.html");
  assert.doesNotMatch(help, /id="(?:en-|zh-)?h-principles"/, "help.html #h-principles");
  assert.doesNotMatch(help, /หลักการทำนายของเรา|Our reading principles|我们的解读原则/, "help.html principles heading");
  assert.doesNotMatch(help, /<details[^>]*data-src=/, "help.html lazily loaded section");
  assert.ok(!exists("help-principles.js"), "help-principles.js");
  const bad = [];
  for (const p of FORT) {
    const html = read(p + ".html"), { own, dicts } = partsOf(html);
    if (/credits\.html|h-principles|lq-ffoot|fortune\.foot\./.test(html)) bad.push(`${p}.html: link / foot`);
    for (const f of own) if (/credits\.html|h-principles/.test(stripComments(read(f)))) bad.push(`${p} -> ${f}: link`);
    for (const f of dicts) if (/fortune\.foot\./.test(read(f))) bad.push(`${p} -> ${f}: foot key`);
  }
  assert.deepEqual([...new Set(bad)], []);
});

test("D4 licence audit: every vendor asset a fortune page loads is audited, its notice ships; credits page only if required", () => {
  const notices = read("LICENSES/THIRD-PARTY-NOTICES.txt");
  const prefixes = AUDIT.assets.flatMap(a => a.prefixes);
  const refs = new Set();
  for (const p of FORT) {
    const html = read(p + ".html"), { src, own, css } = partsOf(html);
    for (const s of src) if (s.startsWith("vendor/")) refs.add(s);
    for (const f of own.concat(css)) for (const m of stripComments(read(f)).matchAll(/vendor\/[A-Za-z0-9_.\/-]*/g)) refs.add(m[0]);
  }
  assert.ok(refs.size >= 20, "vendor references found: " + refs.size);
  const loose = [...refs].filter(r => !prefixes.some(x => r === x || r.startsWith(x) || x.startsWith(r)));
  assert.deepEqual(loose, [], "vendor assets of fortune pages missing from the licence audit");
  for (const a of AUDIT.assets) {
    assert.ok(a.licence && a.clause && a.clause.length > 20, a.id + ": licence and clause");
    assert.equal(typeof a.onPageAttributionRequired, "boolean", a.id);
    for (const f of a.noticeFiles) assert.ok(exists(f), `${a.id}: notice file ${f}`);
    if (a.noticeNeedle) assert.ok(notices.includes(a.noticeNeedle), `${a.id}: "${a.noticeNeedle}" in LICENSES/THIRD-PARTY-NOTICES.txt`);
  }
  const required = AUDIT.assets.filter(a => a.onPageAttributionRequired);
  if (!required.length) assert.ok(!exists("credits.html"), "no licence requires on-page attribution: credits.html must not exist");
  else {
    assert.ok(exists("credits.html"), "credits.html for " + required.map(a => a.id).join(", "));
    const c = read("credits.html");
    for (const a of required) assert.match(c, new RegExp(`data-credit="${a.id}"`), a.id + " credited");
    const linking = fs.readdirSync(ROOT).filter(f => /\.(?:html|js)$/.test(f) && f !== "credits.html" && read(f).includes("credits.html"));
    assert.deepEqual(linking.filter(f => f !== "nav.js"), [], "credits.html linked only from the site footer (nav.js)");
  }
});

const d5Base = f => {
  const b = fs.readFileSync(path.join(__dirname, "fixtures", "d5-base", f + ".txt"));
  assert.equal(createHash("sha256").update(b).digest("hex"), D5_BASE[f], f + ": base fixture is not the locked base bytes");
  return b.toString("utf8");
};

// RE-LOCK 2026-11-22 (owner decision 223, 223-1 / 223-6): terms.html stays byte-identical to the base (apart from ?v=), exactly
// as before. help.html and legal.js had to change for decision 223 (help: the accuracy FAQ answer in TH / EN / ZH and the
// renamed "ทดสอบหน้างาน" / "On-site test" / "现场测试" in the guard tip; legal.js: only the Thai draft tooltip
// "ค่าร่าง รอทนายความยืนยัน" -> "ค่าร่าง อยู่ระหว่างให้ทนายความตรวจ"). Their new pin: the stripped text must equal the base text
// with EXACTLY these replacements applied (so every other byte, all the fortune parts D5 protected included, is unchanged),
// and its sha256 is pinned. No replaced part touches fortune, crisis or help-number text.
const D5_223 = {
  "help.html": { sha: "fcbdb41e3ce80cafd4ce4b9627946bc4522b97a112a14a3639b8d47b2a70d5ec", pairs: [
    ["      <p>ขึ้นกับมุมกล้อง ความสูง และแสง เราเผยแพร่ผลวัดบนชุดข้อมูลสาธารณะพร้อมข้อจำกัด และฟีเจอร์ที่ยังไม่ได้วัดบนข้อมูลจริงจะมีป้าย Beta ก่อนใช้ตัวเลขตัดสินใจทางธุรกิจ " +
      "แนะนำให้ทดลองหน้างาน 2 สัปดาห์ เทียบกับการนับด้วยคน ค่าประมาณอายุ เพศ และสีหน้าเป็นค่าโดยประมาณสำหรับภาพรวมเท่านั้น</p></div></details>",
     "      <p>ตัวเลขจากกล้องเป็นค่าประมาณ ขึ้นกับมุมกล้อง ความสูง และแสง ทุกหน้าบอกข้อจำกัดสำคัญไว้ แนะนำให้ทดลองหน้างานเทียบกับการนับของคุณก่อนใช้ตัดสินใจทางธุรกิจ\n " +
       "       ขอเอกสารเทคนิคได้จากฝ่ายขาย</p></div></details>"],
    ["        <li>ฝึก รปภ. ยืนยันหรือแก้ทุกป้าย แล้วใช้ \"ตรวจความแม่นยำ\" ตั้งแต่วันแรก</li>",
     "        <li>ฝึก รปภ. ยืนยันหรือแก้ทุกป้าย แล้วใช้ \"ทดสอบหน้างาน\" ตั้งแต่วันแรก</li>"],
    ["      <p>It depends on camera angle, height and lighting. We publish public-dataset results with their " +
    "limitations, and features not yet measured on real data carry a Beta label. Before relying on " +
      "the numbers for business decisions, run a 2-week on-site pilot against a human count. Age, gender and expression estimates are approximate and only meant for overall trends.</p></div></details>",
     "      <p>Camera numbers are estimates that depend on camera angle, height and lighting. Every page states its main limits. Before using them for " +
       "business\n        decisions, run an on-site trial against your own count. The technical sheet is available from sales.</p></div></details>"],
    ["        <li>Train guards to confirm or correct every plate, and use the \"accuracy check\" from day one.</li>",
     "        <li>Train guards to confirm or correct every plate, and use the \"On-site test\" from day one.</li>"],
    ["      <p>这取决于摄像头角度、高度和光线。我们公开在公共数据集上的测量结果及其局限，尚未在真实数据上测量的功能标有 Beta。在依据这些数字做商业决策前，建议进行 2 周现场试点，与人工计数对比。年龄、性别和表情估计仅为近似值，只用于观察整体趋势。</p></div></details>",
     "      <p>摄像头给出的数字是估计值，取决于摄像头角度、高度和光线。每个页面都说明了主要局限。用于商业决策前，建议先在现场试用并与您自己的计数对比。技术资料可向销售索取。</p></div></details>"],
    ["        <li>培训保安确认或更正每个车牌，并从第一天起使用\"准确率检查\"。</li>",
     "        <li>培训保安确认或更正每个车牌，并从第一天起使用\"现场测试\"。</li>"],
    // re-lock 223d (reviewer finding 8) then re-lock 226 (owner decision 226: no status label where a customer looks): the
    // Crowd help summaries carry no status label at all (223d had "(รุ่นทดลอง)" / "(trial version)" / "（试用版）")
    ["<summary>LENSIQ Crowd นับคนและความหนาแน่น (ทดลอง)</summary>", "<summary>LENSIQ Crowd นับคนและความหนาแน่น</summary>"],
    ["<summary>LENSIQ Crowd people counting and density (experimental)</summary>", "<summary>LENSIQ Crowd people counting and density</summary>"],
    ["<summary>LENSIQ Crowd 人数与密度统计（实验性）</summary>", "<summary>LENSIQ Crowd 人数与密度统计</summary>"],
    // re-lock 226c (independent review follow-up, owner decision 226 "off = not shown"; replaces 226b, which hid the whole
    // entry): the interview-kit FAQ h-hr / en-h-hr / zh-h-hr is shown again; its summary no longer names the switched-off team
    // face reading, and only the team-face line is hidden with data-lq-off (its words unchanged); the interview-kit guidance
    // lines (no hiring decision, camera observations off by default and never scored, sensitive questions) are unchanged
    ["<details id=\"h-hr\"><summary>ใช้ชุดสัมภาษณ์และโหงวเฮ้งทีมอย่างไรให้ถูกต้อง</summary>", "<details id=\"h-hr\"><summary>ใช้ชุดสัมภาษณ์อย่างไรให้ถูกต้อง</summary>"],
    ["        <li>โหงวเฮ้งทีมเป็นกิจกรรมละลายพฤติกรรมเท่านั้น", "        <li data-lq-off>โหงวเฮ้งทีมเป็นกิจกรรมละลายพฤติกรรมเท่านั้น"],
    ["<details id=\"en-h-hr\"><summary>How should the interview kit and team face reading be used?</summary>", "<details id=\"en-h-hr\"><summary>How should the interview kit be used?</summary>"],
    ["        <li>Team face reading is an icebreaker only.", "        <li data-lq-off>Team face reading is an icebreaker only."],
    ["<details id=\"zh-h-hr\"><summary>应如何正确使用面试工具包和团队面相？</summary>", "<details id=\"zh-h-hr\"><summary>应如何正确使用面试工具包？</summary>"],
    ["        <li>团队面相仅为破冰活动", "        <li data-lq-off>团队面相仅为破冰活动"],
    // re-lock 226d (independent review of 9ebb0818, owner decision 226 "off = not shown"): the shop-camera consent tip no
    // longer gives the switched-off member / customer recognition as its example; the consent rule itself (explicit consent
    // first, a non-face alternative) is unchanged in TH / EN / ZH
    ["ถ้าใช้ข้อมูลใบหน้า (จดจำสมาชิก เช็คชื่อ)", "ถ้าใช้ข้อมูลใบหน้า (เช่น เช็คชื่อ)"],
    ["If you use face data (member recognition, check-in),", "If you use face data (for example check-in),"],
    ["如使用人脸数据（会员识别、签到），", "如使用人脸数据（例如签到），"]
  ] },
  "legal.js": { sha: "ec715ec3135403b89271e24d6dda0d12b94d701d608a7c06d88b7ff6cf787f7c", pairs: [
    ["      if (k === \"draft\") { el.title = (prefix() === \"zh-\" ? \"草案数值，待律师确认\" : prefix() === \"en-\" ? \"draft value, to be confirmed by counsel\" : \"ค่าร่าง รอทนายความยืนยัน\"); return; }",
     "      if (k === \"draft\") { el.title = (prefix() === \"zh-\" ? \"草案数值，待律师确认\" : prefix() === \"en-\" " +
       "? \"draft value, to be confirmed by counsel\" : \"ค่าร่าง อยู่ระหว่างให้ทนายความตรวจ\"); return; }"]
  ] }
};
const FORTUNE_OR_CRISIS = /ดวง|โหรา|ฤกษ์|สายมู|fortune|horoscope|astrolog|tarot|ไพ่|命理|占|运势|1323|1669|crisis|วิกฤต|危机|สายด่วน|hotline|counselling/i;

test("D5 terms.html byte-identical to main 5695734 apart from ?v=; help.html and legal.js changed only by decision 223 (owner decisions 109, 223)", () => {
  assert.ok(stripV(read("terms.html")) === stripV(d5Base("terms.html")), "terms.html: text changed (only ?v= bumps are allowed)");
  for (const [f, { sha, pairs }] of Object.entries(D5_223)) {
    const base = stripV(d5Base(f)), cur = stripV(read(f));
    let want = base;
    for (const [o, n] of pairs) {
      assert.equal(base.split(o).length, 2, `${f}: a replaced base part is not unique: ${o.slice(0, 60)}`);
      assert.doesNotMatch(o + "\n" + n, FORTUNE_OR_CRISIS, `${f}: a decision-223 change touches fortune / crisis text`);
      want = want.replace(o, () => n);
    }
    assert.ok(cur === want, f + ": text differs from the base + the decision-223 changes (only ?v= bumps are allowed)");
    assert.equal(createHash("sha256").update(cur).digest("hex"), sha, f + ": pinned decision-223 text");
  }
  // legal.js: the one change is the Thai draft tooltip; EN / ZH tooltips unchanged
  assert.equal(D5_223["legal.js"].pairs.length, 1);
  const [o, n] = D5_223["legal.js"].pairs[0];
  assert.equal(o.replace("ค่าร่าง รอทนายความยืนยัน", "ค่าร่าง อยู่ระหว่างให้ทนายความตรวจ"), n, "legal.js: only the Thai draft tooltip changed");
  assert.equal(D5_223["help.html"].pairs.length, 18);
  // re-lock 226c: the three interview-kit FAQ entries are shown (no data-lq-off on the entry), the team-face line alone is hidden
  const hc = stripV(read("help.html"));
  for (const id of ["h-hr", "en-h-hr", "zh-h-hr"]) {
    const i = hc.indexOf(`<details id="${id}"`), e = hc.slice(i, hc.indexOf("</details>", i));
    assert.ok(i > 0 && e.startsWith(`<details id="${id}"><summary>`), `help.html #${id}: the entry is shown`);
    assert.equal((e.match(/<li data-lq-off>/g) || []).length, 1, `help.html #${id}: exactly one hidden line`);
    assert.equal((e.match(/<li>/g) || []).length, 3, `help.html #${id}: three interview-kit lines shown`);
  }
  // the fortune / crisis text of help.html is byte-identical to the base (every line that names fortune or a help number)
  const lines = f => stripV(f).split("\n").filter(l => FORTUNE_OR_CRISIS.test(l));
  const bl = lines(d5Base("help.html"));
  assert.ok(bl.length >= 5, "help.html fortune / crisis lines at base: " + bl.length);
  assert.deepEqual(lines(read("help.html")), bl, "help.html fortune / crisis lines changed");
});

test("D5 controls: a ?v= bump alone passes; one changed word of the terms text fails", () => {
  const base = stripV(d5Base("terms.html")), cur = read("terms.html");
  const bumped = cur.replace(/\?v=(\d+)/, (m, n) => "?v=" + (Number(n) + 1));
  assert.notEqual(bumped, cur, "control needs a ?v= in terms.html");
  assert.ok(stripV(bumped) === base, "a ?v= bump alone must pass");
  const at = cur.indexOf("ข้อกำหนดการใช้บริการ LENSIQ</h1>");
  assert.ok(at > 0, "control word not found");
  const oneWord = cur.slice(0, at) + cur.slice(at).replace("LENSIQ", "LENSIX");
  assert.ok(stripV(oneWord) !== base, "one changed word must fail");
});
