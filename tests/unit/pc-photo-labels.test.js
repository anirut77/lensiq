// tests/unit/pc-photo-labels.test.js — Product Check P1 photo labelling sheet validator (tools/pc-photo-labels.mjs) and the
// public-photo fetcher's pure helpers (tools/pc-public-photos.mjs). Synthetic rows only; no product photos or real labels.
const test = require("node:test");
const assert = require("node:assert/strict");
const { mkdtempSync, writeFileSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { execFileSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const ROOT = join(__dirname, "..", "..");
const TOOL = join(ROOT, "tools", "pc-photo-labels.mjs");
const TEMPLATE = join(ROOT, "docs", "product-check", "photo-labels-template.csv");
const load = () => import(pathToFileURL(TOOL).href);

/** header + rows -> CSV text, fields quoted when needed */
const csv = (rows) => rows.map(r => r.map(f => (/[",\n]/.test(f) ? `"${f.replace(/"/g, '""')}"` : f)).join(",")).join("\n") + "\n";

async function base() {
  const m = await load();
  const header = m.COLUMNS.map(c => c.name);
  const good = Object.fromEntries(header.map(h => [h, ""]));
  Object.assign(good, {
    photo_id: "P0001", file_name: "th-food-0001-front.jpg", taken_date: "2026-11-20", taken_by: "owner", stratum: "th-food",
    country_of_sale: "TH", product_type: "food", registration_number: "12-1-34567-8-9012", registration_country: "TH",
    registration_kind: "food", expiry: "2027-03", registration_status: "active", status_checked_date: "2026-11-20",
    on_warning_list: "no", overclaim_on_pack: "no", conditions: "glare;indoor", face_in_frame: "no", patient_label_in_frame: "no",
    labeller_1: "L1", labeller_2: "L2",
  });
  const sheet = (...rows) => [header, ...rows.map(r => header.map(h => r[h] ?? ""))];
  return { m, header, good, sheet };
}

test("the committed template is valid and contains only FAKE example rows", async () => {
  const m = await load();
  const text = readFileSync(TEMPLATE, "utf8");
  const rows = m.parseCsv(text);
  assert.deepEqual(rows[0], m.COLUMNS.map(c => c.name), "template header = COLUMNS in order");
  assert.equal(rows.length, 3, "header + 2 example rows");
  for (const r of rows.slice(1)) assert.match(r.join(","), /FAKE/);
  const res = m.validateSheet(rows);
  assert.deepEqual(res.errors, []);
  assert.equal(execFileSync(process.execPath, [TOOL, TEMPLATE], { encoding: "utf8" }).includes("0 errors"), true);
});

test("CSV parser handles quotes, commas and CRLF", async () => {
  const m = await load();
  assert.deepEqual(m.parseCsv('a,"b,c","d ""q"""\r\n1,2,3\n'), [["a", "b,c", 'd "q"'], ["1", "2", "3"]]);
});

test("a good row passes; required fields, formats and privacy flags are enforced", async () => {
  const { m, good, sheet } = await base();
  assert.deepEqual(m.validateSheet(sheet(good)).errors, []);
  const cases = [
    [{ taken_date: "20/11/2026" }, /taken_date .* YYYY-MM-DD/],
    [{ expiry: "11/27" }, /expiry .* YYYY-MM/],
    [{ stratum: "th-pets" }, /stratum "th-pets"/],
    [{ file_name: "IMG_1234.jpg" }, /file_name "IMG_1234.jpg"/],
    [{ file_name: "th-drug-0001-front.jpg" }, /does not start with its stratum/],
    [{ photo_id: "1" }, /photo_id/],
    [{ labeller_1: "" }, /labeller_1 is required/],
    [{ face_in_frame: "yes" }, /face_in_frame must be no/],
    [{ patient_label_in_frame: "yes" }, /patient_label_in_frame must be no/],
    [{ country_of_sale: "Thailand" }, /ISO 3166/],
    [{ on_warning_list: "yes" }, /needs warning_source_url/],
    [{ status_checked_date: "" }, /needs status_checked_date/],
    [{ registration_number: "12345" }, /does not match the TH food format/],
    [{ registration_country: "" }, /needs registration_country/],
    [{ conditions: "glare;fog" }, /unknown condition tag "fog"/],
    [{ expected_rule_ids: "F6,F13" }, /expected_rule_ids/],
    [{ labeller_2: "L1" }, /different person/],
    [{ registration_status: "no_number" }, /no_number but a registration_number/],
  ];
  for (const [patch, re] of cases) {
    const errs = m.validateSheet(sheet({ ...good, ...patch })).errors.join("\n");
    assert.match(errs, re, JSON.stringify(patch));
  }
  const ill = m.validateSheet(sheet({ ...good, stratum: "illegal-warned", file_name: "illegal-warned-0001-front.jpg" })).errors.join("\n");
  assert.match(ill, /illegal-warned needs on_warning_list = yes/);
});

test("missing columns are errors; duplicates are caught", async () => {
  const { m, header, good, sheet } = await base();
  const noFace = [header.filter(h => h !== "face_in_frame"), header.filter(h => h !== "face_in_frame").map(h => good[h])];
  assert.match(m.validateSheet(noFace).errors.join("\n"), /missing columns: face_in_frame/);
  const dup = m.validateSheet(sheet(good, good)).errors.join("\n");
  assert.match(dup, /duplicate photo_id P0001/);
  assert.match(dup, /duplicate file_name/);
});

test("registration-number formats by country: Thai errors, foreign warnings, unknown countries free", async () => {
  const { regNumberProblem: p } = await load();
  assert.equal(p("12-1-34567-8-9012", "TH", "food"), null);
  assert.equal(p("1234567890123", "TH", "food"), null);
  assert.equal(p("10-1-6600012345", "TH", "cosmetic"), null);
  assert.equal(p("1A 123/45", "TH", "drug"), null);
  assert.equal(p("2C 15/60 (NG)", "TH", "drug"), null);
  assert.equal(p("G 12/56", "TH", "drug"), null);
  assert.equal(p("ฆอ. 3920/2564", "TH", "advert"), null);
  assert.match(p("A123", "TH", "drug"), /^error/);
  assert.match(p("X1", "TH", "herbal"), /^warning/, "Thai herbal formats are unverified: warning only");
  assert.equal(p("MAL19986078AZ", "MY", "drug"), null);
  assert.equal(p("NOT190901234K", "MY", "cosmetic"), null);
  assert.match(p("12345", "MY", "drug"), /^warning/);
  assert.equal(p("SIN12345P", "SG", "drug"), null);
  assert.equal(p("0573-0164-40", "US", "drug"), null);
  assert.equal(p("国药准字H20103347", "CN", "drug"), null);
  assert.equal(p("AUST L 123456", "AU", "herbal"), null);
  assert.equal(p("anything", "JP", "drug"), null);
  assert.equal(p("", "TH", "drug"), null);
});

test("shortfall lists strata below the §9.1 minimums (sum of strata minimums >= 305)", async () => {
  const m = await load();
  assert.ok(Object.values(m.STRATA).reduce((a, b) => a + b, 0) >= 305);
  assert.equal(m.STRATA["illegal-warned"] >= 75, true);
  const full = Object.fromEntries(Object.entries(m.STRATA));
  assert.deepEqual(m.shortfall(full, 40), []);
  assert.deepEqual(m.shortfall({ ...full, "th-drug": 39 }, 12), ["th-drug: 39 / 40", "overclaim_on_pack=yes: 12 / 40"]);
});

test("refuses a filled sheet inside the repo; allows the template and paths outside", async () => {
  const m = await load();
  assert.equal(m.allowedPath(TEMPLATE), true);
  assert.equal(m.allowedPath(join(ROOT, "docs", "product-check", "labels.csv")), false);
  const dir = mkdtempSync(join(tmpdir(), "pc-photo-"));
  assert.equal(m.allowedPath(join(dir, "labels.csv")), true);
  let code = 0;
  try { execFileSync(process.execPath, [TOOL, join(ROOT, "package.json")], { stdio: "pipe" }); } catch (e) { code = e.status; }
  assert.equal(code, 2);
  const { good, sheet } = await base();
  const f = join(dir, "labels.csv");
  writeFileSync(f, csv(sheet(good, { ...good, photo_id: "P0002", face_in_frame: "yes", file_name: "th-food-0002-back.jpg" })));
  let out = "", status = 0;
  try { out = execFileSync(process.execPath, [TOOL, f, "--json"], { encoding: "utf8" }); } catch (e) { out = e.stdout; status = e.status; }
  assert.equal(status, 1);
  const rep = JSON.parse(out);
  assert.equal(rep.total, 2);
  assert.equal(rep.counts["th-food"], 2);
  assert.match(rep.errors.join("\n"), /row 3: face_in_frame must be no/);
});

test("public-photo fetcher helpers: image folder, image choice, manifest labels", async () => {
  const m = await import(pathToFileURL(join(ROOT, "tools", "pc-public-photos.mjs")).href);
  assert.equal(m.imageFolder("8850161161247"), "885/016/116/1247");
  assert.equal(m.imageFolder("00452991"), "00452991");
  const viaSelected = m.pickImages({ code: "1", lang: "th", selected_images: { front: { display: { en: "https://x/en.jpg", th: "https://x/th.jpg" } } } });
  assert.deepEqual(viaSelected, [{ kind: "front", url: "https://x/th.jpg" }]);
  const viaMap = m.pickImages({ code: "8850161161247", lang: "en", images: { front_en: { rev: "7" }, ingredients_th: { rev: "9" } } });
  assert.deepEqual(viaMap.map(i => i.url), [
    "https://images.openfoodfacts.org/images/products/885/016/116/1247/front_en.7.400.jpg",
    "https://images.openfoodfacts.org/images/products/885/016/116/1247/ingredients_th.9.400.jpg",
  ]);
  const row = m.manifestRow({ code: "1", product_name: "Synthetic", brands: ["A", "B"] }, { kind: "front", url: "u" }, "f.jpg", "00", "OFF", "2026-11-09");
  assert.equal(row.brands, "A, B");
  assert.equal(row.ground_truth, "public dataset, community-entered, unverified");
  assert.equal(row.licence.images, "CC-BY-SA-3.0");
  assert.equal(row.licence.database, "ODbL-1.0");
});
