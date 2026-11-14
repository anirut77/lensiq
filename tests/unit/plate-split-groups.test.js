// tests/unit/plate-split-groups.test.js — re-review of gate-hall-h @ b7aaaa8 (2026-11-14):
// N1 --train-only must move a WHOLE plate group to train (a car of the first batch photographed again for the main set may
//    never sit in train and test at once); L2 the split hash must not depend on the CSV row order of a photo's plates or
//    ignore boxes. Locked before the fix (hash appended to evals-locks/gate-hall-h.sha256 and the field copy).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const repo = path.join(__dirname, "..", "..");
const prep = () => import(path.join(repo, "tools", "plate-train-prep.mjs"));
const evalTool = () => import(path.join(repo, "tools", "plate-field-eval.mjs"));
const HEAD = "file,category,plate,province,x0,y0,x1,y1,split,sure,notes";

test("N1: a train-only photo moves its whole plate group (also groups joined through a two-plate photo) to train", async () => {
  const { makeSplit, bucket } = await prep();
  const { parseLabels } = await evalTool();
  let n = 1000;
  while (bucket(`กข${n}`) !== "test") n++;
  let m = n + 1;
  while (bucket(`ทก${m}`) !== "test") m++;
  const rows = [HEAD, `batch1-car.jpg,white,กข ${n},,,,,,,,`, `main-car.jpg,white,กข ${n},,,,,,,,`, `main-car2.jpg,white,กข ${n},,,,,,,,`,
    `two.jpg,white,กข ${n},,,,,,,,`, `two.jpg,yellow,ทก ${m},,,,,,,,`, `linked.jpg,yellow,ทก ${m},,,,,,,,`, "n1.jpg,none,,,,,,,,,"];
  const { photos } = parseLabels(rows.join("\n"));
  const plain = makeSplit(photos);
  assert.equal(plain.files["main-car.jpg"], "test");
  const s = makeSplit(photos, { trainOnly: new Set(["batch1-car.jpg"]) });
  for (const f of ["batch1-car.jpg", "main-car.jpg", "main-car2.jpg", "two.jpg", "linked.jpg"]) assert.equal(s.files[f], "train", f);
  assert.equal(s.files["n1.jpg"], plain.files["n1.jpg"]);
  // no plate key is ever in two parts
  const parts = {};
  for (const ph of photos.values()) for (const p of ph.plates) (parts[p.key] || (parts[p.key] = new Set())).add(s.files[ph.file]);
  for (const [k, v] of Object.entries(parts)) assert.equal(v.size, 1, k);
  assert.equal(s.trainOnly, 5, "photos moved out of test");
});

test("L2: the split hash does not depend on the row order of a photo's plates or ignore boxes", async () => {
  const { makeSplit } = await prep();
  const { parseLabels } = await evalTool();
  const a = [HEAD, "p.jpg,white,กข 1234,,10,10,90,40,,,", "p.jpg,yellow,ทก 77,,100,10,180,40,,,", "q.jpg,none,,,,,,,,,",
    "q.jpg,ignore,,,1,1,5,5,,,", "q.jpg,ignore,,,20,20,30,30,,,"];
  const b = [HEAD, "q.jpg,none,,,,,,,,,", "q.jpg,ignore,,,20,20,30,30,,,", "q.jpg,ignore,,,1,1,5,5,,,",
    "p.jpg,yellow,ทก 77,,100,10,180,40,,,", "p.jpg,white,กข 1234,,10,10,90,40,,,"];
  const sa = makeSplit(parseLabels(a.join("\n")).photos), sb = makeSplit(parseLabels(b.join("\n")).photos);
  assert.equal(sa.sha256, sb.sha256);
  assert.deepEqual(sa.files, sb.files);
  // a real change still changes the hash
  const c = a.slice(); c[2] = "p.jpg,yellow,ทก 78,,100,10,180,40,,,";
  assert.notEqual(makeSplit(parseLabels(c.join("\n")).photos).sha256, sa.sha256);
});
