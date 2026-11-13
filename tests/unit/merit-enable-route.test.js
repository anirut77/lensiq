"use strict";
// tests/unit/merit-enable-route.test.js — Merit stream E: the PREPARED (not applied) change that lets the live test site
// read the published merit guidance, plus the owner/reviewer documents. FIXED TEST SET written and hash-locked
// (~/LENSIQ-field/evals/merit-e/locked.sha256) BEFORE tools/merit-enable-guidance-route.mjs and the documents were written.
// Local only: in-memory D1, no network, nothing deployed.
//
//   ME1 nothing is applied: the committed wrangler.toml [env.test] and deploy/public-site.json do not carry the change;
//       the tool says "apply only after the owner has published at least one item"
//   ME2 toml transform: adds /v1/merit/guidance to PUBLIC_ROUTES of [env.test.vars] only; every other byte unchanged; idempotent
//   ME3 Worker behaviour: today GET /v1/merit/guidance is 404 route_off; with the new list it answers 200 with published
//       items only and no internal fields; interest form, analytics, billing and sign-in stay closed
//   ME4 site transform: adds the 14 fortune pages that load the merit script (= nav.js meritHook list) to deploy/public-site.json;
//       the build still accepts the file; a page that is not listed stays byte-identical; the listed ones get the API origin in CSP
//   ME5 CLI: no flag = dry run (writes nothing); --apply without --confirm-published refuses; with both it writes both files; idempotent;
//       the output names the three locked tests whose constants must be updated in the same commit
//   ME6 documents: owner steps (one page, Thai) and reviewer guide name only buttons / tabs / cards that exist in admin.html / admin.js,
//       and the owner steps describe the route switch (PUBLIC_ROUTES, public-site.json, who does it)
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, existsSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { spawnSync } = require("node:child_process");
const { createEnv, req } = require("./backend-d1-shim.js");

const ROOT = join(__dirname, "..", "..");
const B = "../../backend/src/";
const TOOL = join(ROOT, "tools", "merit-enable-guidance-route.mjs");
const ROUTE = "/v1/merit/guidance";
const MERIT_PAGES = ["faceread.html", "palm.html", "horoscope.html", "tarot.html", "fengshui.html", "numbers.html", "iching.html", "zodiac.html",
  "astro.html", "dream.html", "bazi.html", "taksa.html", "lek7.html", "lifegraph.html"];
const MARK = "APPLY ONLY AFTER THE OWNER HAS PUBLISHED AT LEAST ONE ITEM";
const read = p => readFileSync(join(ROOT, p), "utf8");
const testVars = toml => { const i = toml.indexOf("[env.test.vars]"); const rest = toml.slice(i); const j = rest.slice(1).search(/^\[/m); return j < 0 ? rest : rest.slice(0, j + 1); };
const routesOf = toml => { const m = /^PUBLIC_ROUTES\s*=\s*"([^"]*)"/m.exec(testVars(toml)); return m ? m[1].split(",") : null; };

test("ME1: nothing is applied; the tool carries the warning", async () => {
  const toml = read("backend/wrangler.toml");
  const r = routesOf(toml);
  assert.ok(r && r.includes("/v1/leads") && r.includes("/v1/ai/*"), "the test environment list exists");
  assert.ok(!r.includes(ROUTE), "the guidance route is NOT in the committed list (apply only after the first item is published)");
  assert.ok(!/PUBLIC_ROUTES[^\n]*merit/.test(toml));
  const site = JSON.parse(read("deploy/public-site.json"));
  assert.deepEqual(site.pages, ["medicine.html", "index.html"], "no fortune page is committed in public-site.json");
  assert.ok(existsSync(TOOL), "tools/merit-enable-guidance-route.mjs exists");
  assert.ok(read("tools/merit-enable-guidance-route.mjs").includes(MARK), "the marking is in the tool header");
  const T = await import(TOOL);
  assert.equal(T.GUIDANCE_ROUTE, ROUTE);
  assert.deepEqual([...T.MERIT_PAGES].sort(), [...MERIT_PAGES].sort());
  assert.equal(T.WARNING, MARK);
});

test("ME2: toml transform touches PUBLIC_ROUTES of [env.test.vars] only, adds exactly one route, idempotent", async () => {
  const T = await import(TOOL);
  const toml = read("backend/wrangler.toml");
  const out = T.enableRouteInToml(toml);
  assert.notEqual(out, toml);
  assert.deepEqual(routesOf(out), [...routesOf(toml), ROUTE]);
  const a = toml.split("\n"), b = out.split("\n");
  assert.equal(a.length, b.length, "same number of lines");
  const diff = a.map((l, i) => (l === b[i] ? null : i)).filter(i => i !== null);
  assert.equal(diff.length, 1, "exactly one line changed");
  assert.match(a[diff[0]], /^PUBLIC_ROUTES = /);
  assert.ok(diff[0] > toml.slice(0, toml.indexOf("[env.test.vars]")).split("\n").length, "the line is inside [env.test.vars]");
  assert.equal(T.enableRouteInToml(out), out, "idempotent");
  // the top-level (production template) section gets nothing
  assert.equal(out.slice(0, out.indexOf("[env.test.vars]")).includes(ROUTE), false);
  assert.throws(() => T.enableRouteInToml("[vars]\nA = \"1\"\n"), /PUBLIC_ROUTES/);
});

async function worker(vars) {
  const { handle } = await import(B + "index.js");
  const env = createEnv({ TURNSTILE_SECRET: "ts", TURNSTILE_HOSTNAMES: "site.example", ...vars });
  const call = async (path, o = {}) => {
    const r = await handle(req(path, { method: o.method || "GET", body: o.body, headers: o.headers || {}, origin: "https://site.example" }), env, { fetch: async () => { throw new Error("no network in test"); } });
    let j = null; try { j = await r.clone().json(); } catch { /* none */ }
    return { status: r.status, j, r };
  };
  return { env, call };
}

test("ME3: with the new list the Worker serves published guidance only; nothing else opens", async () => {
  const T = await import(TOOL);
  const toml = read("backend/wrangler.toml");
  const before = routesOf(toml).join(","), after = routesOf(T.enableRouteInToml(toml)).join(",");
  const off = await worker({ PUBLIC_ROUTES: before });
  const r0 = await off.call(ROUTE);
  assert.equal(r0.status, 404); assert.equal(r0.j.code, "route_off");
  const on = await worker({ PUBLIC_ROUTES: after, MERIT_INTEREST_FORM: "off" });
  const r1 = await on.call(ROUTE);
  assert.equal(r1.status, 200);
  assert.ok(Array.isArray(r1.j.items) && r1.j.items.length > 0);
  const published = Number((await on.env.DB.prepare("SELECT COUNT(*) AS n FROM merit_items WHERE status = 'published'").first()).n);
  assert.equal(r1.j.items.length, published, "exactly the published rows");
  for (const it of r1.j.items) {
    assert.equal(it.status, "published");
    for (const k of ["review_meta", "reviewed_by", "created_by", "comment", "draft_id", "sources", "uncertain"]) assert.ok(!(k in it), k + " never served");
  }
  assert.equal(r1.j.interest_form, false);
  // everything else stays closed in the same deployment
  assert.equal((await on.call("/v1/merit/interest", { method: "POST", body: {} })).j.code, "route_off");
  for (const p of ["/v1/billing/plans", "/api/auth/nonce"]) assert.equal((await on.call(p)).status, 404, p);
  assert.equal((await on.call("/v1/events", { method: "POST", body: {} })).status, 404);
  assert.equal((await on.call("/v1/config")).j.analytics, false);
});

test("ME4: site transform lists the 14 merit pages; build accepts it; unlisted pages stay byte-identical", async () => {
  const T = await import(TOOL);
  const S = await import(join(ROOT, "tools", "build-site.mjs"));
  const nav = read("nav.js");
  const m = /if \(!\/\^\(([^)]*)\)\\\.html\$\/\.test\(p\)\) return;/.exec(nav.slice(nav.indexOf("function meritHook()")));
  assert.ok(m, "meritHook page list found in nav.js");
  assert.deepEqual([...MERIT_PAGES].map(p => p.replace(".html", "")).sort(), m[1].split("|").sort(), "same pages as the merit hook");
  const json = read("deploy/public-site.json");
  const out = T.enableSitePages(json);
  const o = JSON.parse(out), i = JSON.parse(json);
  assert.deepEqual(o.pages, [...i.pages, ...MERIT_PAGES]);
  for (const k of Object.keys(i)) if (k !== "pages") assert.deepEqual(o[k], i[k], k + " unchanged");
  assert.equal(T.enableSitePages(out), out, "idempotent");
  const dir = mkdtempSync(join(tmpdir(), "lq-merit-e-"));
  try {
    const f = join(dir, "public-site.json"); writeFileSync(f, out);
    const cfg = S.readSiteConfig(f);
    assert.deepEqual(cfg.pages, o.pages);
    const site = join(dir, "site"); mkdirSync(site);
    for (const p of ["faceread.html", "astro.html", "fortune.html", "lensiq-config.js"]) cpSync(join(ROOT, p), join(site, p));
    const changed = await S.applySiteConfig(site, { ...cfg, pages: ["faceread.html", "astro.html"] });
    assert.deepEqual(changed, ["faceread.html", "astro.html"]);
    assert.deepEqual(readFileSync(join(site, "fortune.html")), readFileSync(join(ROOT, "fortune.html")), "an unlisted page is byte-identical");
    for (const p of ["faceread.html", "astro.html"]) {
      const h = readFileSync(join(site, p), "utf8");
      assert.ok(h.includes(S.SITE_CONFIG_JS), p + " loads the generated config");
      assert.ok(h.includes(cfg.apiBase), p + " CSP names the API origin");
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("ME5: CLI is a dry run by default; --apply needs --confirm-published; output names the locked tests to update", () => {
  const dir = mkdtempSync(join(tmpdir(), "lq-merit-e-cli-"));
  try {
    const t = join(dir, "wrangler.toml"), s = join(dir, "public-site.json");
    writeFileSync(t, read("backend/wrangler.toml")); writeFileSync(s, read("deploy/public-site.json"));
    const run = (...a) => spawnSync(process.execPath, [TOOL, "--toml", t, "--site", s, ...a], { encoding: "utf8" });
    const snap = () => [readFileSync(t, "utf8"), readFileSync(s, "utf8")];
    const base = snap();
    const dry = run();
    assert.equal(dry.status, 0, dry.stderr);
    assert.deepEqual(snap(), base, "dry run writes nothing");
    assert.ok(dry.stdout.includes(MARK));
    assert.ok(dry.stdout.includes(ROUTE) && dry.stdout.includes("public-site.json"));
    for (const f of ["tests/unit/backend-deploy-gate.test.js", "tests/unit/backend-leads-inbox.test.js", "tests/unit/deploy-tools.test.js"]) assert.ok(dry.stdout.includes(f), f + " listed");
    const noConfirm = run("--apply");
    assert.notEqual(noConfirm.status, 0);
    assert.deepEqual(snap(), base, "refused: nothing written");
    const done = run("--apply", "--confirm-published");
    assert.equal(done.status, 0, done.stderr);
    assert.ok(snap()[0].includes(ROUTE) && snap()[1].includes("faceread.html"));
    const again = run("--apply", "--confirm-published");
    assert.equal(again.status, 0);
    assert.deepEqual(snap(), [snap()[0], snap()[1]]);
    assert.equal((snap()[0].match(/\/v1\/merit\/guidance/g) || []).length, (base[0].match(/\/v1\/merit\/guidance/g) || []).length + 1, "route added once");
    // the committed files in the repo were not touched by any of this
    assert.ok(!routesOf(read("backend/wrangler.toml")).includes(ROUTE));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

// ---- ME6: documents agree with the code -------------------------------------------------------------------------------
const OWNER = "docs/MERIT-OWNER-STEPS-TH.md", REVIEWER = "docs/MERIT-REVIEWER-GUIDE-TH.md";
const UI = () => read("admin.html") + "\n" + read("admin.js");

test("ME6: owner steps are one page of Thai with real button names and the route switch described", () => {
  const d = read(OWNER);
  assert.ok(d.split("\n").length <= 90, "one page");
  assert.ok((d.match(/[฀-๿]/g) || []).length > 800, "Thai");
  const ui = UI();
  for (const name of ["ความปลอดภัย", "บัญชีผู้ตรวจเนื้อหา", "สร้างบัญชีและลิงก์ตั้งค่า", "ลิงก์ตั้งค่าครั้งแรก", "คำแนะนำตามความเชื่อ", "ตรวจไฟล์ก่อนนำเข้า", "นำเข้าเป็นร่าง",
    "ไฟล์ร่าง (JSON)", "แสดงสถานะ", "ร่าง (รอตรวจ)", "ดูและตรวจ", "ตรวจแล้ว (รออนุมัติ)", "อนุมัติและเผยแพร่", "ตีกลับพร้อมความเห็น", "ออกลิงก์ตั้งค่าใหม่", "ปิดการใช้งาน"]) {
    assert.ok(ui.includes(name), "UI has: " + name);
    assert.ok(d.includes(name), "owner steps mention: " + name);
  }
  for (const need of ["drafts-2026-11-12.json", "108", "tools/merit-drafts-check.mjs", "MERIT-REVIEWER-GUIDE-TH.md", "PUBLIC_ROUTES", ROUTE, "deploy/public-site.json",
    "tools/merit-enable-guidance-route.mjs", "ผู้ประสานงาน", "รหัสผ่าน"]) assert.ok(d.includes(need), "owner steps include: " + need);
  assert.match(d, /1\./); assert.match(d, /\(ก\)|\(a\)|ก\)/);
  assert.ok(/อย่างน้อย\s*1\s*รายการ/.test(d), "route switch only after at least one item is published");
});

test("ME6: reviewer guide names real buttons and states what a reviewer can and cannot do", () => {
  const d = read(REVIEWER), ui = UI();
  for (const name of ["ตั้งรหัสผ่านและไปขั้นถัดไป", "ยืนยันและเปิดใช้บัญชี", "คำแนะนำตามความเชื่อ", "แสดงสถานะ", "ร่าง (รอตรวจ)", "ตรวจแล้ว (รออนุมัติ)", "ตีกลับ", "ดูและตรวจ", "แก้ไข",
    "บันทึก", "เพิ่มรายการใหม่", "อนุมัติและเผยแพร่", "ตีกลับพร้อมความเห็น", "ผู้เขียนยังไม่แน่ใจ"]) {
    assert.ok(ui.includes(name), "UI has: " + name);
    assert.ok(d.includes(name), "guide mentions: " + name);
  }
  // what a reviewer cannot do (matches the role matrix in docs/MERIT-RESULTS.md 8.2)
  for (const no of ["ลบ", "นำเข้า", "ซ่อน", "คำขอแจ้งความสนใจ"]) assert.ok(d.includes(no), "guide says a reviewer cannot: " + no);
  assert.ok(d.split("\n").length <= 110, "stays short");
});
