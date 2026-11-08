// tests/e2e/case-review.e2e.mjs — case-review.html (case review of local video clips; NOT lie detection):
// banner, reviewer name required, open a case, add a generated WebM clip through the real file input (SHA-256
// fingerprint = WebCrypto digest of the bytes), tags (manual time + current position) on the timeline, withdraw a tag,
// note + amended note, status open -> review -> closed (editing blocked) -> reopened, append-only hash chain verified,
// CSV / JSON export, printable summary, reload: clip not kept by default -> re-attach the same file (match) and a
// different file (mismatch logged), opt-in encrypted storage (IndexedDB ciphertext != clip bytes, auto-loaded after
// reload, retention purge logged), tampering detected and blocks new entries, JSON import of a case, case deletion
// ledger, wipe-all, 320/360/390 px layout, en/zh with no Thai left, privacy scan (no /api/*, no media in localStorage).
import { assert, privacyScan } from "./cdp.mjs";
import { noErrors, mobileCheck, sleep } from "./zones-lib.mjs";

// in-page helpers (installed before the page scripts): a short real WebM from a canvas, file-input setter, download capture
const HELPERS = `
window.__mkVid = async (color, ms) => {
  const c = document.createElement("canvas"); c.width = 160; c.height = 90;
  const g = c.getContext("2d");
  const fill = t => { g.fillStyle = color; g.fillRect(0, 0, 160, 90); g.fillStyle = "#fff"; g.fillRect(t / 8 % 150, 40, 10, 10); };
  fill(0);
  try {
    const rec = new MediaRecorder(c.captureStream(15), { mimeType: "video/webm" }), chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.start(100);
    const t0 = performance.now();
    while (performance.now() - t0 < (ms || 1200)) { fill(performance.now() - t0); await new Promise(r => setTimeout(r, 40)); }
    await new Promise(r => { rec.onstop = r; rec.stop(); });
    return new File(chunks, "clip-" + color.slice(1) + ".webm", { type: "video/webm" });
  } catch (e) {
    const b = new Uint8Array(4096); crypto.getRandomValues(b); b.set([0x1a, 0x45, 0xdf, 0xa3]);
    return new File([b], "clip-" + color.slice(1) + ".webm", { type: "video/webm" });
  }
};
window.__b64 = async f => { const u = new Uint8Array(await f.arrayBuffer()); let s = ""; for (let i = 0; i < u.length;
  i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
window.__fromB64 = (b64, name) => { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new File([u], name, { type: "video/webm" }); };
window.__sha = async f => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await f.arrayBuffer())), b => b.toString(16).padStart(2, "0")).join("");
window.__setFiles = (input, files) => { const dt = new DataTransfer(); for (const f of files) dt.items.add(f); input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true })); };
window.__capture = async id => {
  let blob = null; const o = URL.createObjectURL, c = HTMLAnchorElement.prototype.click;
  URL.createObjectURL = b => { blob = b; return "blob:x"; }; HTMLAnchorElement.prototype.click = function () {};
  try { document.getElementById(id).click(); } finally { URL.createObjectURL = o; HTMLAnchorElement.prototype.click = c; }
  return blob ? await blob.text() : null;
};
window.__idb = (store, fn) => new Promise((res, rej) => { const r = indexedDB.open("lensiq-case", 1);
  r.onsuccess = () => { const db = r.result, tx = db.transaction(store, "readwrite"), st = tx.objectStore(store); let out; Promise.resolve(fn(st, v => { out = v; }));
    tx.oncomplete = () => { db.close(); res(out); }; tx.onerror = () => rej(tx.error); }; r.onerror = () => rej(r.error); });
`;
const THAI_LEFT = `(() => {
  const main = document.querySelector("main"), thai = [];
  const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  for (let n; (n = walk.nextNode());) {
    const el = n.parentElement;
    if (el.closest("[hidden],[lang=th],[translate=no],script,.cr-summary")) continue;
    if (/[ก-๛]/.test(n.textContent)) thai.push(n.textContent.trim().slice(0, 50));
  }
  for (const el of main.querySelectorAll("[aria-label],[placeholder],option")) {
    const v = (el.getAttribute("aria-label") || "") + (el.getAttribute("placeholder") || "") + (el.tagName === "OPTION" ? el.textContent : "");
    if (/[ก-๛]/.test(v) && !el.closest("[hidden]")) thai.push("@" + v.slice(0, 40));
  }
  if (/[ก-๛]/.test(document.title)) thai.push("title " + document.title);
  window.__lastThai = thai;
  return thai.length === 0;
})()`;

async function open(browser, base, { clear = true, query = "" } = {}) {
  const page = await browser.newPage(null, { initScripts: [HELPERS] });
  await page.goto(`${base}/case-review.html${query}`);
  if (clear) {
    await page.evaluate(() => new Promise(r => { localStorage.clear(); const d = indexedDB.deleteDatabase("lensiq-case"); d.onsuccess = d.onerror = d.onblocked = () => r(); }));
    await page.reload();
  }
  await page.waitFor(`!!window.__LQCASE`, 5000);
  return page;
}
async function newCase(page, who, title, ref) {
  await page.evaluate((who, title, ref) => {
    const r = document.getElementById("reviewer"); r.value = who; r.dispatchEvent(new Event("change"));
    const f = document.getElementById("newCase"); f.elements.title.value = title; f.elements.ref.value = ref || "";
    f.requestSubmit();
  }, who, title, ref);
  await page.waitFor(`__LQCASE.cur && __LQCASE.log.length === 1 && !document.getElementById("ws").hidden`, 4000);
}
async function addClip(page, color, keepAs) {
  return page.evaluate(async (color, keepAs) => {
    const f = await window.__mkVid(color, 1200);
    if (keepAs) window[keepAs] = f;
    const sha = await window.__sha(f), n = __LQCASE.state().clips.length;
    window.__setFiles(document.getElementById("clipFile"), [f]);
    const t0 = Date.now();
    while (__LQCASE.state().clips.length === n && Date.now() - t0 < 8000) await new Promise(r => setTimeout(r, 50));
    return { sha, b64: await window.__b64(f), name: f.name, size: f.size };
  }, color, keepAs || "");
}
const ok = (page) => page.evaluate(() => __LQCASE.C.verify(__LQCASE.log).ok);

export default async function ({ base, launch, check }) {
  const browser = await launch();
  let clipA = null, caseId = null, exportedJSON = null;
  try {
    await check("banner + reviewer name required + open a case (log entry #0, integrity badge)", async () => {
      const page = await open(browser, base);
      const b = await page.evaluate(() => ({ text: document.getElementById("banner").textContent, ws: document.getElementById("ws").hidden,
        list: document.getElementById("caseList").textContent }));
      assert(/ไม่ตัดสินว่าใครพูดจริงหรือโกหก/.test(b.text) && /ตัดสินใจเองทั้งหมด/.test(b.text) && b.ws && /ยังไม่มีเคส/.test(b.list), JSON.stringify(b));
      const err = await page.evaluate(() => { const f = document.getElementById("newCase"); f.elements.title.value = "x"; f.requestSubmit();
        return document.getElementById("caseMsg").textContent; });
      assert(/กรอกชื่อผู้ตรวจ/.test(err), err);
      await newCase(page, "สมหญิง ฝ่ายบุคคล", "เหตุการณ์หน้าคลัง 3 พ.ย.", "HR-2026-014");
      const s = await page.evaluate(() => ({ e: __LQCASE.log[0], badge: document.getElementById("integrity").textContent, ok: document.getElementById("integrity").dataset.ok,
        title: document.getElementById("caseTitle").textContent, rv: localStorage.getItem("lqcase-reviewer") }));
      assert(s.e.act === "case.create" && s.e.who === "สมหญิง ฝ่ายบุคคล" && s.e.prev === "0".repeat(64) && /^[0-9a-f]{64}$/.test(s.e.hash), JSON.stringify(s.e));
      assert(s.ok === "1" && /1 รายการ/.test(s.badge) && /HR-2026-014/.test(s.title) && /สมหญิง/.test(s.rv), JSON.stringify(s));
      noErrors(page); await page.close();
    });

    await check("clip via file input: fingerprint = SHA-256 of the bytes; tags, retract, note + amend, status flow, chain intact", async () => {
      const page = await open(browser, base);
      await newCase(page, "Somchai", "Warehouse door", "HR-1");
      caseId = await page.evaluate(() => __LQCASE.cur);
      clipA = await addClip(page, "#2244aa", "__clipA");
      const c = await page.evaluate(() => { const s = __LQCASE.state(); return { clip: s.clips[0], active: __LQCASE.active, src: document.getElementById("player").getAttribute("src") }; });
      assert(c.clip.sha256 === clipA.sha && c.clip.size === clipA.size && c.clip.name === clipA.name && c.active === c.clip.id && /^blob:/.test(c.src), JSON.stringify(c));
      // tag at a typed time, then at the current position
      await page.evaluate(() => { const f = document.getElementById("tagForm"); f.elements.kind.value = "event"; f.elements.text.value = "box carried out";
        f.elements.time.value = "0:01"; f.requestSubmit(); });
      await page.evaluate(() => { const f = document.getElementById("tagForm"); f.elements.kind.value = "recheck"; f.elements.time.value = ""; f.requestSubmit(); });
      const bad = await page.evaluate(() => { const f = document.getElementById("tagForm"); f.elements.time.value = "9:99"; f.requestSubmit();
        return document.getElementById("wsMsg").textContent; });
      assert(/รูปแบบเวลาไม่ถูกต้อง/.test(bad), bad);
      // a typed time past the end of the clip is refused (when the length is known), never written to the log
      const long = await page.evaluate(() => { const n = __LQCASE.log.length, p = document.getElementById("player"), c = __LQCASE.state().clips[0];
        const known = (isFinite(p.duration) && p.duration > 0) || c.dur > 0; // MediaRecorder WebM often has no duration
        if (!known) return { known };
        const f = document.getElementById("tagForm"); f.elements.time.value = "59:00"; f.requestSubmit();
        return { known, msg: document.getElementById("wsMsg").textContent, same: __LQCASE.log.length === n }; });
      assert(!long.known || (/เกินความยาวคลิป/.test(long.msg) && long.same), JSON.stringify(long));
      await page.evaluate(() => { document.getElementById("tagForm").elements.time.value = ""; });
      const tags = await page.evaluate(() => ({ s: __LQCASE.state().tags.map(t => [t.t, t.kind, t.by]), marks: document.querySelectorAll("#tlMarks .cr-mark").length,
        li: document.querySelectorAll("#tagList .cr-item").length }));
      assert(tags.s.length === 2 && tags.s.some(t => t[0] === 1 && t[1] === "event" && t[2] === "Somchai") && tags.marks === 2 && tags.li === 2, JSON.stringify(tags));
      // withdraw needs two taps
      await page.evaluate(() => { const b = [...document.querySelectorAll("#tagList button")].find(x => /ถอนแท็ก/.test(x.textContent)); b.click(); });
      assert(await page.evaluate(() => !__LQCASE.state().tags.some(t => t.retracted)), "one tap must not withdraw");
      await page.evaluate(() => { const b = [...document.querySelectorAll("#tagList button")].find(x => /กดอีกครั้ง/.test(x.textContent)); b.click(); });
      const r = await page.evaluate(() => ({ n: __LQCASE.state().tags.filter(t => t.retracted).length, marks: document.querySelectorAll("#tlMarks .cr-mark").length }));
      assert(r.n === 1 && r.marks === 1, JSON.stringify(r));
      // note + amend
      await page.evaluate(() => { const f = document.getElementById("noteForm"); f.elements.text.value = "second camera needed"; f.elements.atTime.checked = true; f.requestSubmit(); });
      await page.evaluate(() => [...document.querySelectorAll("#noteList button")].find(x => /แก้บันทึกนี้/.test(x.textContent)).click());
      await page.evaluate(() => { const f = document.querySelector("#noteList form"); f.querySelector("textarea").value = "second camera needed (east side)"; f.requestSubmit(); });
      const notes = await page.evaluate(() => __LQCASE.state().notes.map(n => [n.text, !!n.amendedBy, !!n.amends, n.clipId != null]));
      assert(notes.length === 2 && notes[0][1] && notes[1][2] && notes[0][3], JSON.stringify(notes));
      // status: review -> closed blocks editing -> reopen
      await page.evaluate(() => document.querySelector('[data-status="review"]').click());
      await page.evaluate(() => { document.getElementById("statusReason").value = "committee done"; document.querySelector('[data-status="closed"]').click(); });
      const cl = await page.evaluate(() => ({ st: __LQCASE.state().status, dis: document.querySelector("#tagForm button").disabled, file: document.getElementById("clipFile").disabled,
        last: __LQCASE.log[__LQCASE.log.length - 1].data }));
      assert(cl.st === "closed" && cl.dis && cl.file && cl.last.reason === "committee done" && cl.last.from === "review", JSON.stringify(cl));
      await page.evaluate(() => { const f = document.getElementById("noteForm"); f.requestSubmit(); });
      await page.evaluate(() => document.querySelector('[data-status="open"]').click());
      assert(await page.evaluate(() => __LQCASE.state().status === "open" && !document.querySelector("#tagForm button").disabled), "reopened");
      const v = await page.evaluate(() => { document.getElementById("verifyBtn").click();
        return { msg: document.getElementById("wsMsg").textContent, n: __LQCASE.log.length, acts: __LQCASE.log.map(e => e.act) }; });
      assert(/เชื่อมกันครบ/.test(v.msg) && await ok(page), JSON.stringify(v));
      assert(v.acts.join() === "case.create,clip.add,tag.add,tag.add,tag.retract,note.add,note.amend,status,status,status", v.acts.join());
      noErrors(page); await page.close();
    });

    await check("exports: CSV (reviewer, actions, hashes; export itself logged), JSON re-verifies, printable summary", async () => {
      const page = await open(browser, base, { clear: false });
      await page.waitFor(`__LQCASE.cur === ${JSON.stringify(caseId)}`, 4000);
      const csv = await page.evaluate(() => window.__capture("csvBtn"));
      const n = await page.evaluate(() => __LQCASE.log.length);
      assert(csv && /^\ufeff?ลำดับ,เวลา \(UTC\),ผู้ตรวจ/.test(csv) && /Somchai/.test(csv) && /tag\.retract/.test(csv) && /ถอนแท็ก/.test(csv) && /,export,/.test(csv),
        String(csv).slice(0, 300));
      assert(csv.trim().split("\r\n").length === n + 1 && !/data:(image|video)/.test(csv), "rows " + n);
      exportedJSON = await page.evaluate(() => window.__capture("jsonBtn"));
      const j = JSON.parse(exportedJSON);
      assert(j.format === "lensiq-case-audit/1" && j.integrity.ok && j.case.ref === "HR-1" && j.log.length === n + 1, JSON.stringify(j.integrity));
      assert(await page.evaluate(t => __LQCASE.C.fromJSON(JSON.parse(t)).ok, exportedJSON), "fromJSON ok");
      const sum = await page.evaluate(() => { let printed = 0; window.print = () => { printed++; }; document.getElementById("printBtn").click();
        const s = document.getElementById("summary"); return { printed, text: s.textContent, rows: s.querySelectorAll("tbody tr").length, head: __LQCASE.C.verify(__LQCASE.log).head }; });
      assert(sum.printed === 1 && /สรุปการทบทวนเคส/.test(sum.text) && sum.text.includes(sum.head) && /Warehouse door/.test(sum.text) && /ไม่วิเคราะห์ใบหน้า/.test(sum.text) &&
        /ลงชื่อผู้ตรวจ/.test(sum.text), sum.text.slice(0, 200));
      noErrors(page); await page.close();
    });

    await check("reload: clip not kept by default -> re-attach the same file (match) and another file (mismatch logged)", async () => {
      const page = await open(browser, base, { clear: false });
      await page.waitFor(`__LQCASE.cur === ${JSON.stringify(caseId)}`, 4000);
      const s = await page.evaluate(() => ({ txt: document.getElementById("clipList").textContent, src: document.getElementById("player").getAttribute("src"),
        idb: indexedDB.databases ? null : 0 }));
      assert(/ยังไม่ได้เปิดไฟล์/.test(s.txt) && !s.src, JSON.stringify(s));
      await page.evaluate(b64 => window.__setFiles(document.querySelector("[data-reattach]"), [window.__fromB64(b64, "renamed.webm")]), clipA.b64);
      await page.waitFor(`__LQCASE.log[__LQCASE.log.length - 1].act === "clip.attach" && !!document.getElementById("player").getAttribute("src")`, 6000);
      const m = await page.evaluate(() => __LQCASE.log[__LQCASE.log.length - 1].data);
      assert(m.match === true, JSON.stringify(m));
      // a different file for the same clip: allowed for viewing, but recorded as not matching
      await page.reload(); await page.waitFor(`__LQCASE.cur && !!document.querySelector("[data-reattach]")`, 4000);
      await page.evaluate(async () => window.__setFiles(document.querySelector("[data-reattach]"), [await window.__mkVid("#aa2222", 600)]));
      await page.waitFor(`__LQCASE.log[__LQCASE.log.length - 1].act === "clip.attach"`, 8000);
      const mm = await page.evaluate(() => ({ d: __LQCASE.log[__LQCASE.log.length - 1].data,
        warn: document.querySelector("#clipList .cr-warn") && document.querySelector("#clipList .cr-warn").textContent, msg: document.getElementById("wsMsg").textContent }));
      assert(mm.d.match === false && /ไม่ตรงกับไฟล์เดิม/.test(mm.warn) && /ลายนิ้วมือต่างกัน/.test(mm.msg), JSON.stringify(mm));
      // a tag made on the different file carries that file's fingerprint; the different file cannot be stored as this clip
      const tg = await page.evaluate(() => { const f = document.getElementById("tagForm"); f.elements.time.value = ""; f.elements.text.value = "on other file"; f.requestSubmit();
        const e = __LQCASE.log[__LQCASE.log.length - 1];
        return { act: e.act, loaded: e.data.loaded, sha: __LQCASE.log[__LQCASE.log.length - 2].data.sha256, warn: document.querySelector("#tagList .cr-warn") && document.querySelector("#tagList .cr-warn").textContent,
          store: [...document.querySelectorAll("#clipList button")].some(b => /เก็บแบบเข้ารหัส/.test(b.textContent)) }; });
      assert(tg.act === "tag.add" && tg.loaded && tg.loaded.match === false && tg.loaded.sha256 === tg.sha && /ไม่ใช่ไฟล์เดิม/.test(tg.warn) && !tg.store, JSON.stringify(tg));
      await privacyScan(page);
      noErrors(page); await page.close();
    });

    await check("opt-in encrypted storage: ciphertext in IndexedDB, auto-loaded after reload, retention purge logged, unstore", async () => {
      const page = await open(browser, base);
      await newCase(page, "Somchai", "Stored clip case", "");
      const v = await addClip(page, "#118844");
      const supported = await page.evaluate(() => __LQCASE.vault.supported());
      assert(supported, "vault supported on 127.0.0.1 (secure context)");
      assert(await page.evaluate(() => !__LQCASE.state().clips[0].stored), "not stored by default");
      await page.evaluate(() => [...document.querySelectorAll("#clipList button")].find(b => /เก็บแบบเข้ารหัส/.test(b.textContent)).click());
      await page.waitFor(`__LQCASE.state().clips[0].stored === true`, 6000);
      const rec = await page.evaluate(async () => {
        const id = __LQCASE.state().clips[0].id;
        const b = await window.__idb("blobs", (st, set) => { const r = st.get(id); r.onsuccess = () => set(r.result); });
        const u = new Uint8Array(b.ct);
        return { len: u.length, head: Array.from(u.slice(0, 4)), ls: Object.keys(localStorage).join(), lsBytes: JSON.stringify(localStorage).length };
      });
      assert(rec.len === v.size + 16 && rec.head.join() !== "26,69,223,163", "ciphertext (AES-GCM tag +16 B, no WebM magic) " + JSON.stringify(rec));
      await page.reload();
      await page.waitFor(`__LQCASE.cur && !!document.getElementById("player").getAttribute("src")`, 8000);
      const back = await page.evaluate(async () => window.__sha(await (await fetch(document.getElementById("player").getAttribute("src"))).blob()));
      assert(back === v.sha, "decrypted clip = original bytes");
      // retention: the stored copy is 10 days old; lowering 30 -> 7 would delete it, so it must be chosen twice; the change
      // is written to the device ledger with the reviewer's name, then the purge is logged by the system
      await page.evaluate(async () => {
        const id = __LQCASE.state().clips[0].id;
        await window.__idb("meta", st => { const r = st.get(id); r.onsuccess = () => { const m = r.result; m.storedAt = Date.now() - 10 * 86400000; st.put(m, id); }; });
        const sel = document.getElementById("retention"); sel.value = "7"; sel.dispatchEvent(new Event("change"));
      });
      await page.waitFor(`/อีกครั้ง/.test(document.getElementById("retMsg").textContent)`, 4000);
      const r1 = await page.evaluate(() => ({ sel: document.getElementById("retention").value, stored: __LQCASE.state().clips[0].stored, set: localStorage.getItem("lqcase-settings") }));
      assert(r1.sel === "30" && r1.stored && !r1.set, "first choice only asks: " + JSON.stringify(r1));
      await page.evaluate(() => { const sel = document.getElementById("retention"); sel.value = "7"; sel.dispatchEvent(new Event("change")); });
      await page.waitFor(`__LQCASE.log[__LQCASE.log.length - 1].act === "clip.purge"`, 6000);
      const led = await page.evaluate(() => JSON.parse(localStorage.getItem("lqcase-ledger") || "[]"));
      assert(led.length === 1 && led[0].act === "settings.retention" && led[0].who === "Somchai" && led[0].data.to === 7, JSON.stringify(led));
      await page.evaluate(() => { localStorage.removeItem("lqcase-ledger"); localStorage.removeItem("lqcase-settings"); }); // later checks expect a fresh ledger
      const p = await page.evaluate(() => ({ last: __LQCASE.log[__LQCASE.log.length - 1], stored: __LQCASE.state().clips[0].stored }));
      assert(p.last.act === "clip.purge" && p.last.who === "LENSIQ (auto)" && !p.stored, JSON.stringify(p));
      assert(await ok(page), "chain intact after purge");
      await privacyScan(page);
      noErrors(page); await page.close();
    });

    await check("tampering with the stored log is detected: badge, no new entries, export still possible", async () => {
      const page = await open(browser, base, { clear: false });
      await page.evaluate(() => { localStorage.setItem("lqcase-last", JSON.stringify(JSON.parse(localStorage.getItem("lqcase-cases")).cases[0].id)); });
      await page.reload();
      await page.waitFor(`__LQCASE.cur && __LQCASE.log.length >= 4`, 4000);
      await page.evaluate(() => { const o = JSON.parse(localStorage.getItem("lqcase-cases")); o.cases[0].log[1].data.clip.name = "nothing happened.webm";
        localStorage.setItem("lqcase-cases", JSON.stringify(o)); });
      await page.reload();
      await page.waitFor(`__LQCASE.cur && document.getElementById("integrity").dataset.ok === "0"`, 4000);
      const r = await page.evaluate(() => {
        const n = __LQCASE.log.length, f = document.getElementById("noteForm"); f.elements.text.value = "after tamper"; f.requestSubmit();
        return { badge: document.getElementById("integrity").textContent, msg: document.getElementById("wsMsg").textContent, same: __LQCASE.log.length === n };
      });
      assert(/#1/.test(r.badge) && /ไม่ครบถ้วน/.test(r.msg) && r.same, JSON.stringify(r));
      const csv = await page.evaluate(() => window.__capture("csvBtn"));
      assert(csv && /nothing happened/.test(csv), "export of a broken log still works");
      noErrors(page); await page.close();
    });

    await check("import a case from JSON (chain re-verified, import logged); delete case -> ledger; wipe all", async () => {
      const page = await open(browser, base);
      await page.evaluate(() => { const r = document.getElementById("reviewer"); r.value = "Second reviewer"; r.dispatchEvent(new Event("change")); });
      const tampered = JSON.parse(exportedJSON); tampered.log[3].who = "X";
      await page.evaluate(t => window.__setFiles(document.getElementById("importFile"), [new File([t], "bad.json", { type: "application/json" })]), JSON.stringify(tampered));
      await page.waitFor(`/นำเข้าไม่ได้/.test(document.getElementById("caseMsg").textContent)`, 4000);
      await page.evaluate(t => window.__setFiles(document.getElementById("importFile"), [new File([t], "case.json", { type: "application/json" })]), exportedJSON);
      await page.waitFor(`__LQCASE.cur && __LQCASE.log.length && __LQCASE.log[__LQCASE.log.length - 1].act === "import"`, 4000);
      const im = await page.evaluate(() => ({ who: __LQCASE.log[__LQCASE.log.length - 1].who, ok: __LQCASE.C.verify(__LQCASE.log).ok, st: __LQCASE.state() }));
      assert(im.who === "Second reviewer" && im.ok && im.st.title === "Warehouse door" && im.st.reviewers.includes("Somchai"), JSON.stringify(im).slice(0, 300));
      await mobileCheck(page);
      // delete: two taps
      await page.evaluate(() => document.getElementById("delCase").click());
      assert(await page.evaluate(() => !!__LQCASE.cur), "one tap must not delete");
      await page.evaluate(() => document.getElementById("delCase").click());
      await page.waitFor(`!__LQCASE.cur && document.getElementById("ws").hidden`, 4000);
      const led = await page.evaluate(() => JSON.parse(localStorage.getItem("lqcase-ledger")));
      assert(led.length === 1 && led[0].who === "Second reviewer" && led[0].data.intact && !/Warehouse/.test(JSON.stringify(led)), JSON.stringify(led));
      await page.evaluate(() => { document.getElementById("wipeAll").click(); document.getElementById("wipeAll").click(); });
      await page.waitFor(`/ลบข้อมูลทบทวนเคสทั้งหมด/.test(document.getElementById("wipeMsg").textContent)`, 4000);
      const left = await page.evaluate(() => Object.keys(localStorage).filter(k => /^lqcase-/.test(k)));
      assert(!left.length, "lqcase-* left: " + left.join());
      // a case deleted elsewhere (no storage event reached this tab) is not written back by a stale tab
      await page.evaluate(() => { const r = document.getElementById("reviewer"); r.value = "Second reviewer"; r.dispatchEvent(new Event("change")); });
      await newCase(page, "Second reviewer", "Stale tab case", "");
      const st = await page.evaluate(() => { localStorage.removeItem("lqcase-cases");
        const f = document.getElementById("noteForm"); f.elements.text.value = "late note"; f.requestSubmit();
        return { cur: __LQCASE.cur, ws: document.getElementById("ws").hidden, msg: document.getElementById("caseMsg").textContent, cases: localStorage.getItem("lqcase-cases") }; });
      assert(!st.cur && st.ws && /ถูกลบ/.test(st.msg) && !st.cases, JSON.stringify(st));
      await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (/^lqcase-/.test(k)) localStorage.removeItem(k); });
      await privacyScan(page);
      noErrors(page); await page.close();
    });

    await check("320/360/390 px with a case open and a clip loaded: no overflow, 44 px targets", async () => {
      const page = await open(browser, base);
      await newCase(page, "Somchai", "A rather long case title to check wrapping on small phones 2026", "REF-0001-LONG");
      await addClip(page, "#334455");
      await page.evaluate(() => { const f = document.getElementById("tagForm"); f.elements.text.value = "a"; f.requestSubmit(); const n = document.getElementById("noteForm");
        n.elements.text.value = "note"; n.requestSubmit(); });
      await mobileCheck(page);
      noErrors(page); await page.close();
    });

    for (const lang of ["en", "zh"]) {
      await check(`?lang=${lang}: no Thai left (fresh page, then with a case, clip, tags, notes and log)`, async () => {
        const page = await open(browser, base, { query: `?lang=${lang}` });
        await page.waitFor(`window.LQI18N && LQI18N.lang === "${lang}"`, 5000);
        await page.waitFor(THAI_LEFT, 6000).catch(async () => { throw new Error(lang + " fresh: Thai left " + JSON.stringify(await page.evaluate(() => window.__lastThai))); });
        await newCase(page, "Alex", "Door review", "R-1");
        await addClip(page, "#556677");
        await page.evaluate(() => {
          const f = document.getElementById("tagForm"); f.elements.text.value = "box"; f.elements.time.value = "0:01"; f.requestSubmit();
          const n = document.getElementById("noteForm"); n.elements.text.value = "note"; n.requestSubmit();
          document.querySelector('[data-status="review"]').click(); document.getElementById("verifyBtn").click();
        });
        await sleep(200);
        await page.waitFor(THAI_LEFT, 4000).catch(async () => { throw new Error(lang + " case: Thai left " + JSON.stringify(await page.evaluate(() => window.__lastThai))); });
        const sum = await page.evaluate(() => { window.print = () => {}; document.getElementById("printBtn").click(); return document.getElementById("summary").textContent; });
        assert(!/[ก-๛]/.test(sum), lang + " summary has Thai: " + sum.slice(0, 200));
        noErrors(page); await page.close();
      });
    }
  } finally { await browser.close(); }
}
