"use strict";
// tests/unit/palm-v2-reading.test.js — FIXED TEST SET "palm-layers" (palm reading upgrade v1, owner order 2026-11-19), locked in
// evals-locks/palm-layers.sha256 BEFORE any product code.
// D-b1  the reading never cites a line whose status is notFound: >= 2,000 seeded status mixes (and every single line) x 3 schools
//       x TH / EN / ZH x normal and "read it straight": only found / added / absentConfirmed lines are read, and no notFound
//       line's name appears in the reading text. Every read line is in the reading (completeness), and a correction is followed.
// D-b2  the facts for the optional AI wording carry no notFound line, no coordinates and no geometry.
// Not clear: a line below its confidence threshold shows "ไม่ชัดในภาพนี้" / "Not clear in this photo" / "此照片中不清楚".
// Hard limits: every palm v2 text (3 schools x 10 lines x present / absent x 3 languages, list sentences, UI strings) passes the
//       test-owned word lists (no lifespan, death, illness, health, children, divorce, investment, pay-or-else); every
//       "absent" reading is positive. Switch: window.LENSIQ_PALM_V2 defaults to false.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const PV = require(path.join(ROOT, "palm-v2.js"));
const { rng, HARD, NEGATIVE, SCRIPT } = require("./palm-v2-kit.js");

const LANGS = ["th", "en", "zh"];
const STATUSES = ["found", "notFound", "added", "absentConfirmed"];
const READ = new Set(["found", "added", "absentConfirmed"]);
const UNCLEAR = { th: "ไม่ชัดในภาพนี้", en: "Not clear in this photo", zh: "此照片中不清楚" };

function build(school, mix, unclear) {
  const st = PV.newState({ side: "right", school });
  const G = PV.guides(school);
  for (const id of PV.LINES) {
    const s = mix[id];
    const r = PV.setLine(st, id, s === "found" || s === "added" ? { status: s, cp: G[id].cp.map(q => [q[0] + 0.01, q[1] + 0.02]) } : { status: s });
    assert.ok(r && r.ok !== false, `setLine ${id} ${s}`);
    if (s === "notFound" && unclear && unclear[id]) st.lines[id].unclear = true;
  }
  return st;
}
const names = (id) => {
  const out = [];
  for (const school of PV.SCHOOLS) for (const lang of LANGS) out.push(PV.lineName(id, school, lang));
  return [...new Set(out.filter(Boolean))];
};

test("D-b1 the reading never cites a notFound line (>= 2,000 mixes x 3 schools x 3 languages x normal / straight)", () => {
  const R = rng(20261119), mixes = [];
  for (const id of PV.LINES) for (const s of STATUSES) mixes.push(Object.fromEntries(PV.LINES.map(j => [j, j === id ? s : "notFound"])));
  for (const s of STATUSES) mixes.push(Object.fromEntries(PV.LINES.map(j => [j, s])));
  while (mixes.length < 2000) mixes.push(Object.fromEntries(PV.LINES.map(id => [id, STATUSES[Math.floor(R() * 4)]])));
  let n = 0;
  for (const mix of mixes) for (const school of PV.SCHOOLS) for (const lang of LANGS) for (const straight of [false, true]) {
    const st = build(school, mix, null);
    const rd = PV.readingFor(st, { lang, straight });
    const where = `${school} ${lang} straight=${straight} ${JSON.stringify(mix)}`;
    assert.ok(Array.isArray(rd.items) && typeof rd.text === "string", where + " shape");
    for (const it of rd.items) {
      assert.ok(READ.has(it.status), `${where}: item ${it.id} has status ${it.status}`);
      assert.equal(it.status, st.lines[it.id].status, `${where}: item ${it.id} status differs from the line`);
      assert.ok(it.text && it.text.length > 0, `${where}: ${it.id} empty`);
    }
    const ids = rd.items.map(i => i.id);
    for (const id of PV.LINES) {
      const s = st.lines[id].status;
      if (READ.has(s)) assert.ok(ids.includes(id), `${where}: ${id} (${s}) missing from the reading`);
      else {
        assert.ok(!ids.includes(id), `${where}: notFound ${id} read`);
        for (const nm of names(id)) assert.ok(!rd.text.toLowerCase().includes(nm.toLowerCase()), `${where}: notFound ${id} named in the reading ("${nm}")`);
      }
    }
    n++;
  }
  assert.ok(n >= 2000 * 3 * 3 * 2, "cases " + n);
});

test("the reading follows the corrected lines: remove / add / not on my hand", () => {
  for (const school of PV.SCHOOLS) for (const lang of LANGS) {
    const st = build(school, Object.fromEntries(PV.LINES.map(id => [id, id === "fate" ? "found" : "notFound"])), null);
    const r1 = PV.readingFor(st, { lang });
    assert.deepEqual(r1.items.map(i => i.id), ["fate"]);
    PV.setLine(st, "fate", { status: "notFound" }); // the user removes the found line
    assert.deepEqual(PV.readingFor(st, { lang }).items.map(i => i.id), []);
    PV.setLine(st, "fate", { status: "absentConfirmed" }); // "my hand doesn't have this line"
    const r3 = PV.readingFor(st, { lang });
    assert.deepEqual(r3.items.map(i => [i.id, i.status]), [["fate", "absentConfirmed"]]);
    assert.notEqual(r3.items[0].text, r1.items[0].text, `${school} ${lang}: absent reading equals the present reading`);
    const G = PV.guides(school);
    assert.equal(PV.setLine(st, "sun", { status: "added", cp: [[0.66, 0.2], [0.661, 0.2]] }).ok, false, "a too-short trace is refused");
    assert.equal(PV.setLine(st, "sun", { status: "added", cp: G.sun.cp }).ok, true);
    assert.deepEqual(PV.readingFor(st, { lang }).items.map(i => [i.id, i.status]), [["fate", "absentConfirmed"], ["sun", "added"]]);
  }
});

test("D-b2 the AI facts carry no notFound line, no coordinates, no geometry", () => {
  const R = rng(77);
  for (let k = 0; k < 400; k++) for (const school of PV.SCHOOLS) {
    const mix = Object.fromEntries(PV.LINES.map(id => [id, STATUSES[Math.floor(R() * 4)]]));
    const st = build(school, mix, null);
    for (const id of PV.LINES) if (st.lines[id].cp) st.lines[id].cp = st.lines[id].cp.map(q => [q[0] + 0.000123457, q[1]]); // a unique coordinate
    for (const lang of LANGS) {
      const f = PV.aiFacts(st, { lang });
      const js = JSON.stringify(f);
      assert.ok(!/"cp"|"pts"|"px"|"uv"/.test(js), "geometry key in AI facts: " + js.slice(0, 200));
      assert.ok(!/\d\.\d{3,}/.test(js), "coordinate-like number in AI facts: " + js.slice(0, 200));
      assert.ok(!js.includes("123457"), "unique coordinate leaked");
      const ids = (f.lines || []).map(x => x.id);
      for (const id of PV.LINES) {
        if (st.lines[id].status === "notFound") assert.ok(!ids.includes(id), `notFound ${id} in AI facts`);
        else assert.ok(ids.includes(id), `${id} (${st.lines[id].status}) missing from AI facts`);
      }
    }
  }
});

test("below the confidence threshold: 'not clear in this photo' (TH / EN / ZH), drawn as a guide, never read", () => {
  for (const school of PV.SCHOOLS) for (const id of PV.LINES) {
    const st = PV.newState({ side: "left", school });
    const thr = PV.threshold(id);
    assert.ok(thr > 0 && thr < 1, `${id} threshold ${thr}`);
    const cp = PV.guides(school)[id].cp;
    PV.applyDetection(st, { lines: { [id]: { cp, conf: Math.max(0.01, thr - 0.05) } } });
    assert.equal(st.lines[id].status, "notFound", `${school} ${id} below threshold must not be found`);
    assert.equal(st.lines[id].unclear, true, `${school} ${id} unclear flag`);
    for (const lang of LANGS) {
      assert.equal(PV.T("status.unclear", lang), UNCLEAR[lang]);
      const row = PV.listRows(st, lang).find(r => r.id === id);
      assert.ok(row && (row.label.includes(UNCLEAR[lang]) || (row.note || "").includes(UNCLEAR[lang])), `${school} ${id} ${lang}: row ${JSON.stringify(row)}`);
      assert.ok(!PV.readingFor(st, { lang }).items.some(i => i.id === id), `${school} ${id} below threshold read`);
    }
    // at or above the threshold: found (only for lines that the detector may report; guide-only lines stay guides)
    const st2 = PV.newState({ side: "left", school });
    PV.applyDetection(st2, { lines: { [id]: { cp, conf: Math.min(1, thr + 0.05) } } });
    if (PV.AUTO[id]) assert.equal(st2.lines[id].status, "found", `${school} ${id} above threshold`);
    else assert.equal(st2.lines[id].status, "notFound", `${school} ${id} is guide-only in v1 but became ${st2.lines[id].status}`);
  }
});

test("list below the photo: every line of the school, status, one plain sentence (TH / EN / ZH)", () => {
  for (const school of PV.SCHOOLS) for (const lang of LANGS) {
    const st = build(school, { life: "found", head: "notFound", heart: "added", fate: "absentConfirmed", sun: "notFound", mercury: "notFound", marriage: "notFound", girdle: "notFound",
      bracelet: "notFound", simian: "notFound" }, null);
    const rows = PV.listRows(st, lang);
    assert.deepEqual(rows.map(r => r.id), PV.LINES, `${school} ${lang} rows`);
    const want = { found: { th: "พบ", en: "Found", zh: "已找到" }, notFound: { th: "ไม่พบในภาพ", en: "Not found in this photo", zh: "照片中未找到" },
      added: { th: "เพิ่มเอง", en: "Added by you", zh: "自行添加" }, absentConfirmed: { th: "มือฉันไม่มีเส้นนี้", en: "My hand doesn't have this line", zh: "我的手没有这条线" } };
    for (const r of rows) {
      assert.equal(r.status, st.lines[r.id].status);
      assert.ok(r.label.includes(want[r.status][lang]), `${school} ${lang} ${r.id}: label ${r.label}`);
      assert.ok(r.about && r.about.length > 8 && SCRIPT[lang].test(r.about), `${school} ${lang} ${r.id}: about "${r.about}"`);
      assert.ok(r.name && SCRIPT[lang].test(r.name), `${school} ${lang} ${r.id}: name "${r.name}"`);
    }
    assert.equal(PV.T("readingUsesOnly", lang), { th: "คำอ่านใช้เฉพาะเส้นที่พบและเส้นที่คุณยืนยัน", en: "The reading uses only lines that were found or that you confirmed",
      zh: "解读只使用已找到或您确认过的掌纹" }[lang]);
  }
});

test("hard limits: every palm v2 text in 3 schools x TH / EN / ZH; absent readings positive; complete in 3 languages", () => {
  const all = PV.allTexts();
  const by = k => all.filter(t => t.kind === k);
  for (const kind of ["present", "absent"]) {
    for (const school of PV.SCHOOLS) for (const id of PV.LINES) for (const lang of LANGS) {
      const hit = all.filter(t => t.kind === kind && t.school === school && t.line === id && t.lang === lang);
      assert.ok(hit.length >= 1 && hit.every(t => t.text && t.text.trim().length > 8), `${kind} ${school} ${id} ${lang} missing`);
      assert.ok(hit.every(t => SCRIPT[lang].test(t.text)), `${kind} ${school} ${id} ${lang} not in ${lang}: ${hit.map(t => t.text)}`);
    }
  }
  assert.ok(by("present").length >= 90 && by("absent").length >= 90, "present / absent counts");
  for (const kind of ["name", "about", "ui", "hint"]) assert.ok(by(kind).length >= 3, kind + " texts listed");
  const bad = [];
  for (const t of all) {
    if (!HARD[t.lang]) { bad.push(`unknown language ${t.lang}`); continue; }
    if (HARD[t.lang].test(t.text)) bad.push(`${t.kind} ${t.school || ""} ${t.line || t.key || ""} ${t.lang}: "${t.text}" matches ${HARD[t.lang].exec(t.text)[0]}`);
    if (t.kind === "absent" && NEGATIVE[t.lang].test(t.text)) bad.push(`absent ${t.school} ${t.line} ${t.lang} negative: "${t.text}"`);
  }
  assert.deepEqual(bad, []);
  // the scan bites: a planted text is caught in every language
  assert.ok(HARD.th.test("เส้นชีวิตสั้นแปลว่าอายุสั้น") && HARD.en.test("a short life line means an early death") && HARD.zh.test("生命线短代表短命"));
  assert.ok(HARD.th.test("จะมีลูก 3 คน") && HARD.en.test("you will have three children") && HARD.zh.test("会有三个孩子"));
  assert.ok(HARD.th.test("ถ้าไม่จ่ายจะโชคร้าย") && HARD.en.test("bad luck unless you pay") && HARD.zh.test("除非你付钱"));
});

test("switch: window.LENSIQ_PALM_V2 defaults to false (lensiq-config.js), and the v2 section ships hidden", () => {
  const src = fs.readFileSync(path.join(ROOT, "lensiq-config.js"), "utf8");
  const win = {};
  vm.runInNewContext(src, { window: win, globalThis: win, document: undefined, location: { search: "", hostname: "x" }, navigator: {}, console });
  assert.equal(win.LENSIQ_PALM_V2, false);
  const win2 = { LENSIQ_PALM_V2: "yes" };
  vm.runInNewContext(src, { window: win2, globalThis: win2, document: undefined, location: { search: "", hostname: "x" }, navigator: {}, console });
  assert.equal(win2.LENSIQ_PALM_V2, false, "only an explicit true turns it on");
  const html = fs.readFileSync(path.join(ROOT, "palm.html"), "utf8");
  const m = html.match(/<section\b[^>]*\bid="plV2"[^>]*>/);
  assert.ok(m, "palm.html has the v2 section #plV2");
  assert.ok(/\bhidden\b/.test(m[0]), "#plV2 ships hidden: " + m[0]);
});

test("storage holds only line geometry: schema {v, side, school, lines:[{id, status, cp}]} < 8 KB, no image", () => {
  const st = build("chinese", Object.fromEntries(PV.LINES.map((id, i) => [id, STATUSES[i % 4]])), null);
  st.photo = "data:image/png;base64," + "A".repeat(5000); // a page bug must not leak the photo into storage
  st.lines.life.pts = new Array(500).fill([1, 2]);
  const s = PV.serialize(st);
  assert.ok(typeof s === "string" && s.length < 8192, "size " + s.length);
  assert.ok(!/data:image|blob:|base64/i.test(s), "image in storage");
  const o = JSON.parse(s);
  assert.deepEqual(Object.keys(o).sort(), ["lines", "school", "side", "v"]);
  for (const l of o.lines) {
    assert.deepEqual(Object.keys(l).filter(k => k !== "cp").concat("cp").sort(), ["cp", "id", "status"]);
    if (l.cp != null) assert.ok(Array.isArray(l.cp) && l.cp.length <= 12 && l.cp.every(q => q.length === 2 && q.every(Number.isFinite)));
  }
  const back = PV.deserialize(s);
  for (const id of PV.LINES) assert.equal(back.lines[id].status, st.lines[id].status);
  assert.equal(PV.deserialize("{\"v\":1,\"lines\":[{\"id\":\"x\",\"status\":\"found\"}]}").lines.x, undefined, "unknown ids dropped");
  assert.equal(PV.deserialize("garbage"), null);
  assert.equal(typeof PV.STORE_KEY, "string");
});
