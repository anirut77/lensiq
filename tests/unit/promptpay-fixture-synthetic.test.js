"use strict";
// tests/unit/promptpay-fixture-synthetic.test.js — privacy guard for the PromptPay fixtures (owner decision 143 ก).
// Every 13-digit, Thai-ID-shaped value with a valid checksum in tests/unit/promptpay.test.js must be one of the
// constructed synthetic IDs below, so a real person's national ID can never sit in the fixtures. Values passed to
// thaiIdOk() (including the negative case) must share their first 12 digits with a synthetic ID, so a "wrong check
// digit" fixture cannot leak 12 digits of a real ID either.
//
// How the synthetic ID is built (deterministic, clearly made up):
//   body  = "123456789012"  (the ascending pattern 1..9, 0, 1, 2)
//   check = (11 - (sum over i=0..11 of body[i] * (13 - i)) mod 11) mod 10
//         = (11 - 352 mod 11) mod 10 = (11 - 0) mod 10 = 1
//   ID    = body + check = "1234567890121"
// The check digit is required because lensiq-promptpay.js validTarget()/thaiIdOk() enforce the Thai ID checksum.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const PP = require("../../lensiq-promptpay.js");

const SYNTHETIC_BODIES = ["123456789012"];

function checkDigit(body) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += +body[i] * (13 - i);
  return (11 - (s % 11)) % 10;
}
const SYNTHETIC_IDS = SYNTHETIC_BODIES.map((b) => b + checkDigit(b));

function checksumOk(d) {
  return /^\d{13}$/.test(d) && checkDigit(d.slice(0, 12)) === +d[12];
}

// Independent CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, no reflection, no xorout) — not the product's code.
function crc16ccittFalse(str) {
  let crc = 0xffff;
  for (const ch of Buffer.from(str, "utf8")) {
    crc ^= ch << 8;
    for (let k = 0; k < 8; k++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

const FIXTURE = fs.readFileSync(path.join(__dirname, "promptpay.test.js"), "utf8");

test("synthetic IDs: built from the documented pattern and pass the product's Thai ID checksum", () => {
  assert.deepEqual(SYNTHETIC_IDS, ["1234567890121"]);
  for (const id of SYNTHETIC_IDS) {
    assert.equal(PP.thaiIdOk(id), true);
    assert.equal(PP.validTarget(id), true);
    assert.equal(PP.targetType(id), "02");
  }
});

test("fixture: every checksum-valid 13-digit value in promptpay.test.js is a listed synthetic ID", () => {
  const runs = FIXTURE.match(/(?<!\d)\d{13}(?!\d)/g) || [];
  const valid = runs.filter(checksumOk);
  assert.ok(valid.length >= 1, "the fixture still exercises a checksum-valid national ID");
  const unknown = valid.filter((v) => !SYNTHETIC_IDS.includes(v));
  // report only the count, never the value
  assert.equal(unknown.length, 0, unknown.length + " checksum-valid 13-digit value(s) are not listed synthetic IDs");
});

test("fixture: every thaiIdOk() argument shares its first 12 digits with a synthetic ID", () => {
  const args = [...FIXTURE.matchAll(/thaiIdOk\("(\d+)"\)/g)].map((m) => m[1]);
  assert.ok(args.length >= 2, "positive and negative thaiIdOk cases present");
  const bad = args.filter((a) => !SYNTHETIC_BODIES.includes(a.slice(0, 12)));
  assert.equal(bad.length, 0, bad.length + " thaiIdOk() argument(s) not derived from a synthetic ID");
});

test("synthetic ID payload: product CRC matches an independent CRC-16/CCITT-FALSE", () => {
  for (const id of SYNTHETIC_IDS) {
    for (const amount of [undefined, 500]) {
      const p = PP.payload(id, amount);
      assert.ok(p.includes("0213" + id), "tag 02 carries the 13-digit ID");
      assert.equal(p.slice(-8, -4), "6304");
      assert.equal(p.slice(-4), crc16ccittFalse(p.slice(0, -4)));
      assert.equal(p.slice(-4), PP.crc16(p.slice(0, -4)));
      assert.equal(PP.parse(p).crcOk, true);
    }
  }
});
