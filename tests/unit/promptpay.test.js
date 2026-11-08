"use strict";
// tests/unit/promptpay.test.js — lensiq-promptpay.js: PromptPay EMVCo payload (static / dynamic with exact amount,
// phone / national ID / e-wallet targets), CRC-16/CCITT-FALSE, TLV parse + CRC check, and the vendored MIT QR encoder.
// Expected payloads were computed independently with Python's binascii.crc_hqx(data, 0xFFFF).
const test = require("node:test");
const assert = require("node:assert/strict");
const PP = require("../../lensiq-promptpay.js");

test("crc16: CCITT-FALSE check value", () => {
  assert.equal(PP.crc16("123456789"), "29B1");
  assert.equal(PP.crc16(""), "FFFF");
});

test("payload: phone (static), phone + amount (dynamic), national ID, e-wallet — exact strings", () => {
  assert.equal(PP.payload("0812345678"), "00020101021129370016A000000677010111011300668123456785802TH530376463045D82");
  assert.equal(PP.payload("081-234-5678", 4.22), "00020101021229370016A000000677010111011300668123456785802TH530376454044.2263045D49");
  assert.equal(PP.payload("1234567890123", 150), "00020101021229370016A000000677010111021312345678901235802TH53037645406150.006304CCA0");
  assert.equal(PP.payload("012345678901234", 35.5), "00020101021229390016A00000067701011103150123456789012345802TH5303764540535.506304DE0A");
  assert.equal(PP.payload("0812345678", 0), PP.payload("0812345678"), "0 baht = static QR");
  assert.equal(PP.payload("0812345678", 10.005).includes("540510.01"), true, "rounded to satang");
  assert.throws(() => PP.payload("0812345678", 1e8));
});

test("parse: TLV + CRC verification, target and amount", () => {
  const p = PP.parse(PP.payload("0812345678", 120));
  assert.equal(p.ok, true); assert.equal(p.crcOk, true); assert.equal(p.target, "0066812345678"); assert.equal(p.amount, 120);
  assert.equal(p.tags["01"], "12");
  const tampered = PP.payload("0812345678", 120).replace("120.00", "999.00");
  assert.equal(PP.parse(tampered).crcOk, false);
  assert.equal(PP.parse("garbage").ok, false);
});

test("targets: type detection, formatting, validation (Thai ID checksum)", () => {
  assert.equal(PP.targetType("0812345678"), "01"); assert.equal(PP.targetType("1234567890123"), "02"); assert.equal(PP.targetType("123456789012345"), "03");
  assert.equal(PP.formatTarget("0812345678"), "0066812345678");
  assert.equal(PP.validTarget("0812345678"), true); assert.equal(PP.validTarget("0212345678"), false, "landline");
  assert.equal(PP.thaiIdOk("1101700230708"), true); assert.equal(PP.thaiIdOk("1101700230705"), false);
  assert.equal(PP.validTarget("1101700230708"), true);
});

test("matrix: vendored qrcode-generator encodes the payload (finder patterns, version size)", () => {
  const m = PP.matrix(PP.payload("0812345678", 4.22));
  assert.ok(m.size >= 25 && (m.size - 17) % 4 === 0, "size " + m.size);
  // the three finder patterns: dark 7x7 border with a light ring and a dark 3x3 core
  for (const [r0, c0] of [[0, 0], [0, m.size - 7], [m.size - 7, 0]]) {
    assert.equal(m.get(r0, c0), true); assert.equal(m.get(r0 + 1, c0 + 1), false); assert.equal(m.get(r0 + 3, c0 + 3), true);
  }
});
