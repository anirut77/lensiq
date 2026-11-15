"use strict";
// lensiq-busy.js (owner report 2026-11-14: busy state + double-tap protection): LQBusy.wrap / run set aria-busy while the
// work runs, ignore re-entry, and restore the button when the work ends or fails. Browser behaviour (real taps, the
// capture-phase guard, the CSS) is covered by tests/e2e/buttons-*.e2e.mjs.
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../../lensiq-busy.js");

function el(tag = "BUTTON") {
  const a = {};
  return {
    nodeType: 1, tagName: tag, attrs: a,
    getAttribute: k => (k in a ? a[k] : null), setAttribute: (k, v) => { a[k] = String(v); }, removeAttribute: k => { delete a[k]; },
    querySelector: () => null
  };
}
const later = () => { let res, rej; const p = new Promise((r, j) => { res = r; rej = j; }); return { p, res, rej }; };

test("wrap: aria-busy while the promise runs, a second click is ignored, restored after", async () => {
  const b = el(), d = later();
  let runs = 0;
  const h = B.wrap(() => { runs++; return d.p; });
  h({ currentTarget: b });
  assert.equal(b.getAttribute("aria-busy"), "true");
  assert.equal(B.isBusy(b), true);
  assert.equal(h({ currentTarget: b }), undefined);
  assert.equal(runs, 1);
  d.res(5); await d.p; await null;
  assert.equal(b.getAttribute("aria-busy"), null);
  assert.equal(B.isBusy(b), false);
  h({ currentTarget: b });
  assert.equal(runs, 2);
});

test("wrap: restored when the work fails; the error reaches the caller", async () => {
  const b = el();
  const h = B.wrap(async () => { throw new Error("boom"); });
  await assert.rejects(h({ currentTarget: b }), /boom/);
  await null;
  assert.equal(b.getAttribute("aria-busy"), null);
  assert.equal(B.isBusy(b), false);
});

test("wrap: a listener that returns no promise is just called (no busy state)", () => {
  const b = el();
  let n = 0;
  const h = B.wrap(() => { n++; return 1; });
  assert.equal(h({ currentTarget: b }), 1);
  assert.equal(h({ currentTarget: b }), 1);
  assert.equal(n, 2);
  assert.equal(b.getAttribute("aria-busy"), null);
});

test("wrap on a form submit: the submitter shows busy, a second submit is cancelled", async () => {
  const form = el("FORM"), sub = el(), d = later();
  let runs = 0, prevented = 0;
  const h = B.wrap(() => { runs++; return d.p; });
  h({ currentTarget: form, submitter: sub, preventDefault() { prevented++; } });
  assert.equal(sub.getAttribute("aria-busy"), "true");
  assert.equal(form.getAttribute("aria-busy"), null);
  h({ currentTarget: form, submitter: sub, preventDefault() { prevented++; } });
  assert.equal(runs, 1);
  assert.equal(prevented, 1);
  d.res(); await d.p; await null;
  assert.equal(sub.getAttribute("aria-busy"), null);
});

test("run: keeps an aria-busy value the page set before, and returns undefined while busy", async () => {
  const b = el(), d = later();
  b.setAttribute("aria-busy", "false");
  const r = B.run(b, () => d.p);
  assert.equal(b.getAttribute("aria-busy"), "true");
  assert.equal(B.run(b, () => 1), undefined);
  d.res(); await r; await null;
  assert.equal(b.getAttribute("aria-busy"), "false");
});
