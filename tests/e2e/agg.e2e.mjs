// tests/e2e/agg.e2e.mjs — "phone-per-point": one hub + 2 node devices (isolated browser contexts = separate localStorage)
// against a real server.py started here on a random port with the repo's .venv python and a throw-away LENSIQ_DATA_DIR.
// Covers pairing, periodic push (pushNow), pagehide keepalive, offline queue + retry, insights totals, revoke,
// privacy of what leaves a node, and the no-server fallback (export/import) under plain http.server.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const LINE = { a: { x: 0.5, y: 0 }, b: { x: 0.5, y: 1 } }; // right->left = "in"
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on("error", rej); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => res(port)); }); });

function seedNode(line) {
  localStorage.clear();
  localStorage.setItem("st-cams", JSON.stringify({ v: 1, cams: [{ slot: "c1", deviceId: "fake-cam-1", label: "Fake Camera 1", name: "กล้องประตู", role: "door" }] }));
  localStorage.setItem("st-cam-c1", JSON.stringify({ line, swap: false, zones: [], detW: 0 }));
}
function walkIn() { // one person walks right -> left once
  let T0 = null;
  const box = x => [{ x: x - 0.05, y: 0.3, w: 0.1, h: 0.4, score: 0.95 }];
  window.__LQ_FAKE_DET = (key, now) => {
    if (T0 == null) T0 = now;
    const t = (now - T0) / 1000;
    return t < 3.5 ? box(t < 0.5 ? 0.8 : t < 2.5 ? 0.8 - 0.6 * (t - 0.5) / 2 : 0.2) : [];
  };
}
const ALLOWED = new Set(["v", "format", "node", "name", "date", "in", "out", "occ", "peak", "peakAt", "maxQueue", "t", "hourlyIn", "hourlyOut", "zones", "byCam"]);

async function startServer(repo) {
  const py = join(repo, ".venv", "bin", "python");
  if (!existsSync(py)) return { skip: ".venv/bin/python not found" };
  const port = await freePort(), dataDir = mkdtempSync(join(tmpdir(), "lq-agg-e2e-"));
  const proc = spawn(py, ["server.py"], { cwd: repo, stdio: ["ignore", "ignore", "pipe"], env: { ...process.env, LENSIQ_PORT: String(port), LENSIQ_DATA_DIR: dataDir, LENSIQ_AGG_RPM: "2000", LENSIQ_MOBILE: "" } });
  let err = ""; proc.stderr.on("data", d => { err += d; if (err.length > 8000) err = err.slice(-4000); });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 150; i++) {
    if (proc.exitCode != null) return { skip: "server.py exited: " + err.slice(-300) };
    try { if ((await fetch(base + "/api/agg/status")).ok) return { base, proc, dataDir }; } catch { await sleep(100); }
  }
  proc.kill(); return { skip: "server.py did not start: " + err.slice(-300) };
}

export default async function ({ base: staticBase, launch, check, skip, fakeCams, repo }) {
  const srv = await startServer(repo);
  if (srv.skip) { skip("hub + 2 nodes against server.py", srv.skip); }
  const browser = await launch();
  const cam = [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}", "window.confirm=()=>true"];
  try {
    if (!srv.skip) await check("hub + 2 nodes: pair, push, pagehide keepalive, offline queue, insights totals, revoke", async () => {
      const S = srv.base, url = `${S}/store.html?cpu&fakedet`;
      // ---- hub ----
      const hub = await browser.newPage(null, { isolated: true, initScripts: cam });
      await hub.goto(url);
      await hub.evaluate(() => { localStorage.clear(); localStorage.setItem("lq-agg", JSON.stringify({ role: "hub" })); });
      await hub.reload();
      const code = await hub.waitFor(`(() => { const t = document.getElementById("aggCode").textContent; return /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(t) && t; })()`, 6000);
      assert(await hub.evaluate(() => !document.getElementById("aggCodeBox").hidden), "code box visible on loopback hub");

      // ---- two nodes ----
      const nodes = [];
      for (const name of ["ประตูหน้า", "ประตูหลัง"]) {
        const p = await browser.newPage(null, { isolated: true, initScripts: cam });
        await p.goto(url);
        await p.evaluate(seedNode, LINE);
        await p.reload();
        await p.evaluate(() => document.querySelector('#aggPanel [data-role="node"]').click());
        // wrong code first -> Thai error, no token
        await p.evaluate(n => { const f = document.getElementById("aggJoinForm"); f.nodeName.value = n; f.code.value = "AAAA-AAAA-AAAA"; f.requestSubmit(); }, name);
        await p.waitFor(`/รหัสจับคู่ไม่ถูกต้อง/.test(document.getElementById("aggMsg").textContent)`, 5000);
        await p.evaluate(c => { const f = document.getElementById("aggJoinForm"); f.code.value = c.toLowerCase(); f.requestSubmit(); }, code);
        await p.waitFor(`__ST.agg.cfg.token && /จับคู่กับ/.test(document.getElementById("aggNodeInfo").textContent)`, 6000);
        await p.evaluate(walkIn);
        await p.evaluate(() => document.getElementById("startCam").click());
        await p.waitFor(`__ST.running && __ST.day.in === 1`, 15000);
        await p.evaluate(() => __ST.agg.pushNow());
        await p.waitFor(`!Object.keys(__ST.agg.cfg.pending).length && __ST.agg.cfg.lastOk > 0`, 5000);
        nodes.push(p);
      }
      const [A, B] = nodes;

      const hubRows = async () => { await hub.evaluate(() => __ST.agg.poll()); return hub.evaluate(() => [...document.querySelectorAll("#aggTable tbody tr")].map(tr => [...tr.cells].map(td => td.textContent.trim()))); };
      let rows = await hubRows();
      const row = (rs, n) => rs.find(r => r[0].startsWith(n));
      assert(row(rows, "ประตูหน้า") && row(rows, "ประตูหลัง"), "both nodes listed " + JSON.stringify(rows));
      assert(row(rows, "ประตูหน้า")[1] === "ออนไลน์" && row(rows, "ประตูหน้า")[2] === "1", "node A row " + JSON.stringify(row(rows, "ประตูหน้า")));
      assert(row(rows, "รวม")[2] === "2", "total in = 2 " + JSON.stringify(row(rows, "รวม")));
      assert(/เข้ารวม\s*2/.test(await hub.evaluate(() => document.getElementById("aggTiles").textContent)), "tile เข้ารวม 2");
      const hubLocal = await hub.evaluate(() => __ST.day.in);
      assert(hubLocal === 0, "hub's own day untouched by nodes (single-device numbers unchanged)");

      // ---- pagehide keepalive: A counts 3 more then navigates away immediately ----
      await A.evaluate(() => { __ST.day.in += 3; __ST.day.byCam.c1.in += 3; });
      await A.goto("about:blank");
      await hub.waitFor(`(async () => { await __ST.agg.poll(); return [...document.querySelectorAll("#aggTable tbody tr")].some(tr => tr.cells[0].textContent.startsWith("ประตูหน้า") && tr.cells[2].textContent === "4"); })()`, 8000);

      // ---- offline queue: B offline -> pending kept -> back online -> delivered ----
      await B.send("Network.emulateNetworkConditions", { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await B.evaluate(() => { __ST.day.in += 2; __ST.day.byCam.c1.in += 2; return __ST.agg.pushNow(); });
      const pend = await B.waitFor(`(() => { const p = __ST.agg.cfg.pending; const k = Object.keys(p); return k.length === 1 && /รอส่ง 1 วัน/.test(document.getElementById("aggNodeInfo").textContent) && p[k[0]].in; })()`, 5000);
      assert(pend === 3, "queued pack in=3, got " + pend);
      assert(JSON.parse(await B.evaluate(() => localStorage.getItem("lq-agg"))).pending, "queue persisted");
      await B.send("Network.emulateNetworkConditions", { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      await B.evaluate(() => __ST.agg.flush(true));
      await B.waitFor(`!Object.keys(__ST.agg.cfg.pending).length`, 5000);
      rows = await hubRows();
      assert(row(rows, "ประตูหลัง")[2] === "3" && row(rows, "รวม")[2] === "7", "after retry " + JSON.stringify(rows));

      // ---- insights on the hub: combined totals + per-device breakdown ----
      await hub.goto(`${S}/insights.html?cpu`);
      const ins = await hub.waitFor(`(() => { const D = iqCollect(Object.fromEntries(Object.keys(localStorage).filter(iqIsModuleKey).map(k => [k, localStorage.getItem(k)]))); const t = document.querySelector("#m-store") && document.querySelector("#m-store").closest("section").textContent; return D.store && D.store.at(-1).in === 7 && /ประตูหน้า/.test(t) && /ประตูหลัง/.test(t) && { in: D.store.at(-1).in, cams: Object.keys(D.store.at(-1).byCam).length }; })()`, 8000);
      assert(ins.cams === 2, "two device rows " + JSON.stringify(ins));
      assert(!/lq-agg/.test(await hub.evaluate(() => JSON.stringify(Object.keys(localStorage).filter(iqIsModuleKey)))), "pairing config not in insights snapshot/backup");
      await hub.goto(url);

      // ---- privacy: everything that left the nodes is a numeric pack ----
      for (const p of [B]) for (const r of p.requests.filter(r => r.method === "POST" && /\/api\/agg$/.test(r.url))) {
        const body = JSON.parse(r.postData || "{}");
        for (const k of Object.keys(body)) assert(ALLOWED.has(k), "unexpected key " + k);
        assert(!/data:image|descriptor|"box"|"x":/.test(r.postData), "no image/box data");
      }
      const stored = readFileSync(join(srv.dataDir, "agg.json"), "utf8");
      assert(!/data:image|descriptor|token"/.test(stored), "server store has numbers only");
      assert((await fetch(`${S}/data/agg.json`)).status === 404, "data dir not served");

      // ---- revoke node B at the hub -> B must re-pair ----
      await hub.waitFor(`(async () => { await __ST.agg.poll(); return document.querySelectorAll("#aggTable button[data-rm]").length === 2; })()`, 6000);
      await hub.evaluate(() => [...document.querySelectorAll("#aggTable button[data-rm]")].find(b => b.closest("tr").cells[0].textContent.startsWith("ประตูหลัง")).click());
      await hub.waitFor(`(async () => { await __ST.agg.poll(); const t = document.getElementById("aggTable").textContent; return !/ประตูหลัง/.test(t) && /ประตูหน้า/.test(t); })()`, 6000);
      await B.evaluate(() => __ST.agg.pushNow());
      await B.waitFor(`!__ST.agg.cfg.token && /ยกเลิกการจับคู่/.test(document.getElementById("aggMsg").textContent)`, 5000);

      // ---- node A reopened: still paired, layout fine at 390 px ----
      await A.goto(url);
      await A.waitFor(`__ST.agg.cfg.token && /เครื่องลูก/.test(document.getElementById("aggState").textContent)`, 5000);
      for (const p of [hub, A]) {
        await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
        await sleep(300);
        const ov = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
        assert(ov.sw <= ov.cw, "horizontal overflow at 390px " + JSON.stringify(ov));
        await p.send("Emulation.clearDeviceMetricsOverride");
      }
      for (const p of [hub, A, B]) {
        const errs = p.consoleErrors.filter(e => e.kind === "exception" || e.kind === "console" || (e.kind === "log" && !/fonts\.(googleapis|gstatic)|favicon|ERR_INTERNET_DISCONNECTED|status of 401/.test((e.url || "") + " " + (e.text || ""))));
        assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      }
      for (const p of [hub, A, B]) { try { await p.evaluate(() => { const b = document.getElementById("stop"); if (b && !b.disabled) b.click(); }); } catch { /* about:blank */ } await p.close(); }
    });

    await check("no server (plain http.server): Thai fallback message, export on a node, import merges as a device on the hub", async () => {
      const url = `${staticBase}/store.html?cpu&fakedet`;
      const node = await browser.newPage(null, { isolated: true, initScripts: cam });
      await node.goto(`${staticBase}/index.html`); // seed outside store.html (its beforeunload would re-save its own day)
      await node.evaluate(() => { localStorage.clear(); const d = new Date(), k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        localStorage.setItem("st-day-" + k, JSON.stringify({ date: k, in: 9, out: 4, occ: 5, peak: 6, peakAt: 1, maxQueue: 1, hourly: { in: Array(24).fill(0).map((_, i) => i === 10 ? 9 : 0), out: Array(24).fill(0).map((_, i) => i === 11 ? 4 : 0) }, zones: {}, byCam: { c1: { name: "กล้อง 1", in: 9, out: 4 } }, zv: 2 }));
        localStorage.setItem("lq-agg", JSON.stringify({ role: "node" })); });
      await node.goto(url);
      await node.waitFor(`/ไม่พบเซิร์ฟเวอร์/.test(document.getElementById("aggMsg").textContent) && document.getElementById("aggManual").open`, 6000);
      await node.evaluate(() => { document.getElementById("aggJoinForm").nodeName.value = "จุดชั้นสอง"; });
      const text = await node.evaluate(() => JSON.stringify(__ST.agg.exportPack()));
      const pack = JSON.parse(text);
      assert(pack.in === 9 && pack.name === "จุดชั้นสอง" && /^n[a-z0-9]{8,24}$/.test(pack.node), "exported pack " + text.slice(0, 160));
      for (const k of Object.keys(pack)) assert(ALLOWED.has(k), "export key " + k);
      // importing your own file is refused (would double count)
      assert(!(await node.evaluate(t => __ST.agg.importText(t).ok, text)), "own pack refused");
      assert(node.requests.filter(r => /\/api\/agg(?!\/status)/.test(r.url)).length === 0, "no pushes without a server");

      const hub = await browser.newPage(null, { isolated: true, initScripts: cam });
      await hub.goto(url);
      await hub.evaluate(() => { localStorage.clear(); localStorage.setItem("lq-agg", JSON.stringify({ role: "hub" })); });
      await hub.reload();
      await hub.waitFor(`/ไม่พบเซิร์ฟเวอร์/.test(document.getElementById("aggMsg").textContent)`, 6000);
      const r = await hub.evaluate(t => __ST.agg.importText(t), text);
      assert(r.ok, "import " + JSON.stringify(r));
      assert(!(await hub.evaluate(() => __ST.agg.importText('{"v":1,"name":"x","date":"2026-11-06","in":1,"out":0,"node":"nabcdefgh1","image":"data:image/png;base64,AA"}').ok)), "unknown keys rejected");
      const rows = await hub.evaluate(() => [...document.querySelectorAll("#aggTable tbody tr")].map(tr => [...tr.cells].map(td => td.textContent.trim())));
      const rr = rows.find(x => x[0].startsWith("จุดชั้นสอง"));
      assert(rr && rr[1] === "นำเข้าไฟล์" && rr[2] === "9", "imported row " + JSON.stringify(rows));
      assert(await hub.evaluate(() => Object.keys(localStorage).some(k => /^st-agg-\d{4}-\d{2}-\d{2}$/.test(k))), "cached under st-agg-<date>");
      const unc = [...node.consoleErrors, ...hub.consoleErrors].filter(e => e.kind === "exception");
      assert(!unc.length, "uncaught " + JSON.stringify(unc.slice(0, 2)));
      await node.close(); await hub.close();
    });
  } finally {
    await browser.close();
    if (srv.proc) { srv.proc.kill(); await sleep(100); }
    if (srv.dataDir) try { rmSync(srv.dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
}
