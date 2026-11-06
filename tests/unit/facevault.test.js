// tests/unit/facevault.test.js — lensiq-facevault.js: AES-GCM envelope, non-extractable key, legacy migration,
// refuses writes without a secure context (no plaintext fallback), locked (key lost) never overwritten, retention.
const test = require("node:test");
const assert = require("node:assert/strict");
const V = require("../../lensiq-facevault.js");

const mem = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; };
const keyStore = () => { const m = new Map(); return { get: async id => m.get(id) || null, add: async (id, v) => { if (m.has(id)) throw new Error("ConstraintError"); m.set(id, v); }, del: async id => { m.delete(id); }, get key() { return [...m.values()][0] || null; }, m }; };
const D = v => Array.from({ length: 128 }, (_, i) => +(Math.sin(i * v) * 0.1).toFixed(5));

test("write/read round trip: envelope only, no plaintext numbers, key non-extractable", async () => {
  const ks = keyStore(); V._setKeyStore(ks); V._reset();
  const ls = mem();
  assert.equal(await V.write("att-x", { v: 1, faces: { a: D(1) } }, ls), "enc");
  const raw = ls.getItem("att-x"), o = JSON.parse(raw);
  assert.ok(V.isEnvelope(o));
  assert.ok(!raw.includes(String(D(1)[1])), "no plaintext descriptor value");
  assert.equal(ks.key.extractable, false);
  assert.deepEqual(ks.key.usages.sort(), ["decrypt", "encrypt"]);
  const r = await V.read("att-x", ls);
  assert.equal(r.state, "enc");
  assert.deepEqual(r.data.faces.a, D(1));
  // fresh IV each time
  await V.write("att-x", { v: 1, faces: { a: D(1) } }, ls);
  assert.notEqual(JSON.parse(ls.getItem("att-x")).iv, o.iv);
});

test("AAD binds the envelope to its key name", async () => {
  V._setKeyStore(keyStore()); V._reset();
  const ls = mem();
  await V.write("k1", { a: 1 }, ls);
  ls.setItem("k2", ls.getItem("k1"));
  assert.equal((await V.read("k2", ls)).state, "locked");
});

test("splitLoad migrates legacy plaintext descriptors, meta keeps readable fields", async () => {
  V._setKeyStore(keyStore()); V._reset();
  const ls = mem();
  ls.setItem("cx-members", JSON.stringify([{ id: "m1", name: "แอน", created: 5, descriptor: D(1) }, { id: "m2", name: "บอส", created: 6 }]));
  const r = await V.splitLoad("cx-members", "lqv-cx-faces", "descriptor", ls);
  assert.equal(r.state, "enc"); assert.equal(r.migrated, true);
  assert.deepEqual(r.records[0].descriptor, D(1));
  assert.equal(r.records[1].descriptor, undefined);
  const meta = JSON.parse(ls.getItem("cx-members"));
  assert.deepEqual(meta, [{ id: "m1", name: "แอน", created: 5 }, { id: "m2", name: "บอส", created: 6 }]);
  assert.ok(V.isEnvelope(JSON.parse(ls.getItem("lqv-cx-faces"))));
  // reload: same data
  V._reset();
  const r2 = await V.splitLoad("cx-members", "lqv-cx-faces", "descriptor", ls);
  assert.deepEqual(r2.records[0].descriptor, D(1)); assert.equal(r2.migrated, false);
  // record removed elsewhere -> its face is pruned
  ls.setItem("cx-members", JSON.stringify([{ id: "m2", name: "บอส", created: 6 }]));
  await V.splitLoad("cx-members", "lqv-cx-faces", "descriptor", ls);
  assert.deepEqual((await V.read("lqv-cx-faces", ls)).data.faces, {});
});

test("splitSave writes faces encrypted then meta without descriptors; faces:false only touches meta", async () => {
  V._setKeyStore(keyStore()); V._reset();
  const ls = mem();
  const recs = [{ id: "p1", name: "ก", descriptor: Float32Array.from(D(2)), created: 1, lastSeen: 2 }];
  assert.equal(await V.splitSave("att-people", "lqv-att-faces", recs, "descriptor", ls), "enc");
  assert.deepEqual(JSON.parse(ls.getItem("att-people")), [{ id: "p1", name: "ก", created: 1, lastSeen: 2 }]);
  const env = ls.getItem("lqv-att-faces");
  recs[0].lastSeen = 3;
  await V.splitSave("att-people", "lqv-att-faces", recs, "descriptor", ls, { faces: false });
  assert.equal(ls.getItem("lqv-att-faces"), env);
  assert.equal(JSON.parse(ls.getItem("att-people"))[0].lastSeen, 3);
});

test("no secure context / WebCrypto: default refuses face writes (no plaintext), legacy data kept, re-encrypted once available", async () => {
  V._setKeyStore(null); V._reset();
  const saved = globalThis.indexedDB; delete globalThis.indexedDB;
  try {
    const ls = mem();
    ls.setItem("att-people", JSON.stringify([{ id: "p1", name: "ก", descriptor: D(3) }]));
    assert.equal(V.supported(), false);
    assert.equal(V.insecureReason(), "no-indexeddb");
    assert.match(V.enrollBlockReason(), /https:\/\//);
    const r = await V.splitLoad("att-people", "lqv-att-faces", "descriptor", ls, { stamp: true, now: 100 });
    assert.equal(r.state, "insecure");
    assert.deepEqual(r.records[0].descriptor, D(3), "legacy value usable in memory");
    assert.equal(ls.getItem("lqv-att-faces"), null, "no plaintext vault written");
    const meta = JSON.parse(ls.getItem("att-people"));
    assert.equal(meta[0].created, 100, "legacy record stamped");
    assert.deepEqual(meta[0].descriptor, D(3), "legacy value not dropped (no data loss)");
    // new enrolment refused, nothing written
    await assert.rejects(V.write("lqv-att-faces", { v: 1, faces: { p2: D(4) } }, ls), e => e.name === "VaultInsecureError" && e.code === "insecure-context" && e.reason === "no-indexeddb");
    await assert.rejects(V.splitSave("att-people", "lqv-att-faces", [{ id: "p2", descriptor: D(4) }], "descriptor", ls), { name: "VaultInsecureError" });
    assert.equal(ls.getItem("lqv-att-faces"), null);
    // removing all faces still works without encryption
    ls.setItem("lqv-att-faces", "{}");
    assert.equal(await V.splitSave("att-people", "lqv-att-faces", [{ id: "p1", name: "ก" }], "descriptor", ls), "insecure");
    assert.equal(ls.getItem("lqv-att-faces"), null);
    assert.equal(V.STATE_TH.insecure, V.enrollBlockReason());
  } finally { if (saved) globalThis.indexedDB = saved; }
  // secure context again -> legacy migrated into an encrypted envelope
  V._setKeyStore(keyStore()); V._reset();
  const ls2 = mem();
  ls2.setItem("att-people", JSON.stringify([{ id: "p1", name: "ก", descriptor: D(3) }]));
  const r2 = await V.splitLoad("att-people", "lqv-att-faces", "descriptor", ls2);
  assert.equal(r2.state, "enc");
  assert.ok(V.isEnvelope(JSON.parse(ls2.getItem("lqv-att-faces"))));
  assert.deepEqual(r2.records[0].descriptor, D(3));
  assert.equal(V.enrollBlockReason(), null);
});

test("isSecureContext === false refuses even when WebCrypto exists", async () => {
  V._setKeyStore(keyStore()); V._reset();
  const had = Object.getOwnPropertyDescriptor(globalThis, "isSecureContext");
  Object.defineProperty(globalThis, "isSecureContext", { value: false, configurable: true });
  try {
    assert.equal(V.insecureReason(), "insecure-context");
    await assert.rejects(V.write("k", { a: 1 }, mem()), e => e.code === "insecure-context");
  } finally { if (had) Object.defineProperty(globalThis, "isSecureContext", had); else delete globalThis.isSecureContext; }
});

test("encrypt failure never falls back to plaintext", async () => {
  V._setKeyStore({ get: async () => null, add: async () => { throw new Error("quota"); }, del: async () => {} }); V._reset();
  const realGen = crypto.subtle.generateKey;
  const ls = mem();
  crypto.subtle.generateKey = async () => { throw new Error("boom"); };
  try {
    await assert.rejects(V.write("k", { a: 1 }, ls), e => e.name === "VaultInsecureError" && e.reason === "encrypt-failed");
    assert.equal(ls.getItem("k"), null);
  } finally { crypto.subtle.generateKey = realGen; }
});

test("explicit opt-in allowPlaintext keeps the legacy plaintext wrapper (not recommended)", async () => {
  V._setKeyStore(null); V._reset();
  const saved = globalThis.indexedDB; delete globalThis.indexedDB;
  try {
    V.configure({ allowPlaintext: true });
    const ls = mem();
    assert.equal(V.enrollBlockReason(), null);
    assert.equal(await V.write("k", { a: 1 }, ls), "plain");
    assert.equal(JSON.parse(ls.getItem("k")).plain, "lq1");
  } finally { V._reset(); if (saved) globalThis.indexedDB = saved; }
  assert.equal(V.configure().allowPlaintext, false, "_reset restores the default");
});

test("key lost: locked, data kept, writes refused until wipe", async () => {
  const ks = keyStore(); V._setKeyStore(ks); V._reset();
  const ls = mem();
  await V.write("lqv-att-faces", { v: 1, faces: { p1: D(4) } }, ls);
  ls.setItem("att-people", JSON.stringify([{ id: "p1", name: "ก" }]));
  const env = ls.getItem("lqv-att-faces");
  ks.m.clear(); V._reset();
  const r = await V.splitLoad("att-people", "lqv-att-faces", "descriptor", ls);
  assert.equal(r.state, "locked");
  assert.equal(ls.getItem("lqv-att-faces"), env, "not overwritten");
  await assert.rejects(V.splitSave("att-people", "lqv-att-faces", r.records, "descriptor", ls), { name: "VaultLockedError" });
  assert.equal(ls.getItem("lqv-att-faces"), env);
  await V.wipe(["lqv-att-faces"], ls);
  assert.equal(ls.getItem("lqv-att-faces"), null);
  assert.equal(await V.write("lqv-att-faces", { v: 1, faces: {} }, ls), "enc");
});

test("wipe deletes only that key's CryptoKey; old envelopes can never be decrypted", async () => {
  const ks = keyStore(); V._setKeyStore(ks); V._reset();
  const ls = mem();
  await V.write("a", { x: 1 }, ls); await V.write("b", { y: 2 }, ls);
  assert.notEqual(JSON.parse(ls.getItem("a")).ct, JSON.parse(ls.getItem("b")).ct);
  const env = ls.getItem("a");
  await V.wipe(["a"], ls);
  assert.equal(ks.m.size, 1, "b's key kept");
  assert.deepEqual((await V.read("b", ls)).data, { y: 2 });
  ls.setItem("a", env);
  assert.equal((await V.read("a", ls)).state, "locked");
});

test("expired: unused longer than N days (lastSeen, else created); 0 = never", () => {
  const now = 1000 * V.DAY;
  const recs = [{ id: "old", descriptor: [1], created: now - 400 * V.DAY }, { id: "seen", descriptor: [1], created: now - 400 * V.DAY, lastSeen: now - 10 * V.DAY },
    { id: "noface", created: 0 }, { id: "new", descriptor: [1], created: now - 5 * V.DAY }];
  assert.deepEqual(V.expired(recs, 365, now), ["old"]);
  assert.deepEqual(V.expired(recs, 0, now), []);
  assert.deepEqual(V.expired(recs, 7, now), ["old", "seen"]);
});
