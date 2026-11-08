// tests/e2e/gate-guard.e2e.mjs — LENSIQ Gate plate-likeness guard (round 16, item 7) with the REAL models (finder +
// LPD-YuNet + PP-OCRv5 Thai, ONNX Runtime Web WASM, no WebGL): plate-shaped signs, number boards and shop signs drawn with
// the self-hosted Prompt font are never auto-read, the demo plates still are; on the lane a non-plate gets the "does not look
// like a plate" status and no suggestion, and the guard can still tap; tools/plate-field-eval.mjs runs end-to-end on a tiny
// generated photo folder in the OS temp directory (nothing is written into the repo). Same pass rule on CI and dev machines.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INIT = "window.confirm=()=>true;window.print=()=>{};window.prompt=()=>'test';";
const sceneInit = () => INIT + "window.__LQ_SCENES=" + SCENES + ";"; // an init script (the page CSP forbids eval)

// drawn in the page (640 x 360, Prompt font): plates and NOT-plates (shape of a plate, Thai text and digits)
const SCENES = `(() => {
  const P = (c, f) => { c.width = 640; c.height = 360; const x = c.getContext("2d"); f(x); return c; };
  const board = (x, X, Y, W, H, bg, fg) => { x.fillStyle = bg; x.fillRect(X, Y, W, H); x.strokeStyle = fg; x.lineWidth = 4; x.strokeRect(X + 4, Y + 4, W - 8, H - 8);
    x.fillStyle = fg; x.textAlign = "center"; x.textBaseline = "middle"; };
  return {
    town: c => P(c, x => { x.fillStyle = "#4f6b3a"; x.fillRect(0, 0, 640, 360); board(x, 170, 120, 300, 120, "#f4f4f0", "#111");
      x.font = "600 46px Prompt"; x.fillText("ชลบุรี  64", 320, 165); x.font = "500 24px Prompt"; x.fillText("CHON BURI", 320, 212); }),
    room: c => P(c, x => { x.fillStyle = "#8a8f99"; x.fillRect(0, 0, 640, 360); board(x, 200, 175, 240, 112, "#fbfbf7", "#111");
      x.font = "600 46px Prompt"; x.fillText("ห้อง 1234", 320, 215); x.font = "500 24px Prompt"; x.fillText("ชั้นสอง", 320, 261); }),
    km: c => P(c, x => { x.fillStyle = "#3e5f2f"; x.fillRect(0, 0, 640, 360); board(x, 250, 70, 140, 210, "#f7f7f2", "#111");
      x.font = "600 44px Prompt"; x.fillText("กม.", 320, 135); x.font = "700 60px Prompt"; x.fillText("794", 320, 215); }),
    shop: c => P(c, x => { x.fillStyle = "#5a5047"; x.fillRect(0, 0, 640, 360); board(x, 120, 110, 400, 120, "#b3121a", "#fff");
      x.font = "600 44px Prompt"; x.fillText("ร้านข้าวแกง 99", 320, 150); x.font = "500 24px Prompt"; x.fillText("เปิดทุกวัน 24 ชม.", 320, 200); }),
    latin: c => P(c, x => { x.fillStyle = "#636b7e"; x.fillRect(0, 0, 640, 360); board(x, 200, 175, 240, 112, "#fbfbf7", "#111");
      x.font = "600 46px Prompt"; x.fillText("AB 1234", 320, 215); x.font = "500 24px Prompt"; x.fillText("SINGAPORE", 320, 261); })
  };
})()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("plate-likeness guard (real OCR): plate-shaped signs / boards are never auto-read; demo plates still are", async () => {
      const page = await browser.newPage(null, { initScripts: [sceneInit()] });
      await page.goto(`${base}/parking.html?cpu`);
      await assertNoWebGL(page);
      await page.waitFor("!!(window.GateKit && window.GateKit.autoReadFrame && window.LQPlate)", 15000);
      const r = await page.evaluate(async () => {
        await Promise.all([document.fonts.load("600 46px Prompt", "กข 0123456789"), document.fonts.load("500 24px Prompt", "กรุงเทพมหานคร"), document.fonts.load("700 60px Prompt", "794")]);
        const LP = window.LQPlate, GK = window.GateKit, S = window.__LQ_SCENES;
        await Promise.all([LP.loadOcr(), LP.loadPlateDet()]);
        const c = document.createElement("canvas"), out = { plates: [], signs: [] };
        for (const [t, p, sty] of [["1กข 2345", "bangkok", null], ["กท 4567", "nonthaburi", { bg: "#fbfbf7", fg: "#c8102e" }], ["ขค 789", "chonburi", { bg: "#f5c400", fg: "#111" }]]) {
          GK.drawDemo(c, t, p, sty || {});
          const a = await GK.autoReadFrame(c, {});
          out.plates.push({ want: LP.parse(t).key, got: a.picked ? a.picked.read.key : "", trigger: !!a.trigger, tried: a.tried.map(x => [x.read.key, x.guard && x.guard.reasons]) });
        }
        for (const [name, draw] of Object.entries(S)) {
          draw(c);
          const a = await GK.autoReadFrame(c, {});
          out.signs.push({ name, trigger: !!a.trigger, picked: a.picked ? a.picked.read.key : "", tried: a.tried.map(x => [x.read.key, x.read.lines, x.guard && x.guard.reasons]) });
        }
        return out;
      });
      console.log("       plates " + r.plates.map(p => `${p.want}→${p.got || "—"}`).join(" · ") + " | signs " + r.signs.map(s => `${s.name}: trigger ${s.trigger ? "yes" : "no"}, `
        + `reads ${JSON.stringify(s.tried.map(t => t[0]).filter(Boolean))}`).join(" · "));
      for (const p of r.plates) assert(p.got === p.want, "demo plate auto-read through the guard " + JSON.stringify(p));
      for (const s of r.signs) assert(!s.picked, `"${s.name}" must never be auto-read: ` + JSON.stringify(s));
      // the guard must be doing the work: at least one non-plate produced a plate-pattern read that the guard refused
      assert(r.signs.some(s => s.tried.some(t => t[0] && t[2] && t[2].length)), "a sign read parsed as a plate and was refused " + JSON.stringify(r.signs));
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!ext.length, "third-party requests " + ext.map(q => q.url));
      await privacyScan(page);
      await page.close();
    });

    await check("lane: a plate-shaped board with a Thai word gets the 'not a plate' status and no suggestion; a tap still reads it", async () => {
      const page = await browser.newPage(null, { initScripts: [INIT + `window.__LQ_DEMO_PLATES=${JSON.stringify([["ห้อง 1234", "bangkok"], ["ห้อง 1234", "bangkok"]])};`] });
      await page.goto(`${base}/parking.html?cpu`);
      await page.evaluate(() => { document.querySelector("#gkAck1").click(); document.querySelector("#gkAck2").click(); document.querySelector("#gkAckBtn").click(); });
      await page.evaluate(() => document.querySelector("#gkDemoBtn").click());
      await page.waitFor(`!document.querySelector("#gkReadBtn").disabled`, 8000);
      await page.evaluate(() => document.querySelector("#gkReadBtn").click());
      await page.waitFor(`/ไม่เหมือนป้ายทะเบียน|อ่านป้ายไม่ได้/.test(document.querySelector("#gkStatus").textContent) || !!window.__LQ_PK.kit.lane.read`, 120000, 250);
      const a = await page.evaluate(() => ({ st: document.querySelector("#gkStatus").textContent, plate: document.querySelector("#gkPlate").value, read: window.__LQ_PK.kit.lane.read,
        det: window.__LQ_PK.kit.lane.det }));
      assert(!a.read && !a.plate, "no suggestion for a non-plate " + JSON.stringify(a));
      assert(/ไม่เหมือนป้ายทะเบียน/.test(a.st), "status explains that the box does not look like a plate " + JSON.stringify(a));
      // the guard taps the board: a person chose the box, so it is read WITHOUT the plate check (and still has to be
      // confirmed). The board's text ("ห้อง 1234", Prompt font) is one the Thai OCR reads reliably, so the tap must give a read
      // (a "could not read" status would not prove the check was skipped).
      await page.evaluate(() => { window.__LQ_PK.kit.readNow({ x: 200 / 640, y: 175 / 360, w: 240 / 640, h: 112 / 360 }); });
      await page.waitFor(`!!window.__LQ_PK.kit.lane.read || /อ่านป้ายไม่ได้/.test(document.querySelector("#gkStatus").textContent)`, 60000, 250);
      const t = await page.evaluate(() => ({ read: window.__LQ_PK.kit.lane.read, st: document.querySelector("#gkStatus").textContent, plate: document.querySelector("#gkPlate").value,
        det: window.__LQ_PK.kit.lane.det }));
      console.log("       tap on the board → " + JSON.stringify({ key: t.read && t.read.key, tapped: t.read && t.read.tapped, plate: t.plate }));
      assert(!!t.read && t.read.tapped === true && !!t.read.key, "a tapped non-plate box is read (marked tapped) " + JSON.stringify(t));
      assert(t.det && t.det.tapped === true, "the read used the tapped box " + JSON.stringify(t.det));
      // the same board was refused by the plate check on the Read press above (no suggestion, "not a plate" status), so a
      // read here proves the tap skipped the check
      await page.close();
    });

    await check("tools/plate-field-eval.mjs end-to-end on a generated folder (temp dir): field label, exact plate read, 0 false auto-reads", async () => {
      const page = await browser.newPage(null, { initScripts: [sceneInit()] });
      await page.goto(`${base}/parking.html?cpu`);
      await page.waitFor("!!(window.GateKit && window.LQPlate)", 15000);
      const imgs = await page.evaluate(async () => {
        await Promise.all([document.fonts.load("600 46px Prompt", "กข 0123456789"), document.fonts.load("500 24px Prompt", "กรุงเทพมหานคร"), document.fonts.load("700 60px Prompt", "794")]);
        const S = window.__LQ_SCENES, c = document.createElement("canvas"), out = {};
        window.GateKit.drawDemo(c, "1กข 2345", "bangkok"); out["plate.png"] = c.toDataURL("image/png");
        S.town(c); out["town.png"] = c.toDataURL("image/png");
        S.room(c); out["room.png"] = c.toDataURL("image/png");
        S.km(c); out["broken.png"] = c.toDataURL("image/png"); // corrupted below
        return out;
      });
      await page.close();
      const dir = mkdtempSync(join(tmpdir(), "lq-plate-field-e2e-"));
      try {
        for (const [f, u] of Object.entries(imgs)) {
          const b = Buffer.from(u.split(",")[1], "base64");
          // broken.png: the PNG signature, then garbage (no image header): passes the type check, the browser cannot decode it
          writeFileSync(join(dir, f), f === "broken.png" ? Buffer.concat([b.subarray(0, 8), Buffer.from("this is not an image header".repeat(4))]) : b);
        }
        writeFileSync(join(dir, "IMG_0001.HEIC"), Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from("ftypheic"), Buffer.alloc(40)])); // iPhone default
        writeFileSync(join(dir, "plates-photo-labels.csv"), ["file,category,plate,province,x0,y0,x1,y1,split,sure,notes",
          "plate.png,white,1กข 2345,bangkok,200,175,440,287,,y,demo plate", "town.png,none,,,,,,,,,town sign", "room.png,none,,,,,,,,,room board",
          "broken.png,white,กข 1,,,,,,,y,broken file", "IMG_0001.HEIC,white,กข 2,,,,,,,y,iphone heic"].join("\n"));
        const T = await import(pathToFileURL(join(repo, "tools", "plate-field-eval.mjs")).href);
        const out = await T.run(T.parseArgs(["--dir", dir, "--synthetic", "0"], {}));
        const rep = T.formatReport(out.summary, { source: out.source });
        console.log("       " + rep.split("\n").slice(-4).join("\n       "));
        assert(out.source === "field (owner photos)" && /field \(owner photos\)/.test(rep), "field source label");
        assert(out.summary.white && out.summary.white.after.exact.x === 1, "demo plate read exactly by the shipped path " + JSON.stringify(out.flags[0]));
        const why = Object.fromEntries(out.failed.map(f => [f.file, f.error]));
        assert(out.n === 3 && Object.keys(why).length === 2, "the two bad photos are listed, the run goes on " + JSON.stringify(out.failed));
        assert(/could not decode/.test(why["broken.png"] || "") && /convert to JPEG/.test(why["IMG_0001.HEIC"] || ""), "reasons " + JSON.stringify(why));
        assert(out.summary.none.photos === 2 && out.summary.none.after.false === 0 && out.summary.none.guard1.false === 0, "no false auto-read on the signs " + JSON.stringify(out.flags));
      } finally { rmSync(dir, { recursive: true, force: true }); }
    });
  } finally { await browser.close(); }
}
