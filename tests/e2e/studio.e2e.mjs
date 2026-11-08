// tests/e2e/studio.e2e.mjs — สตูดิโอแต่งชุด (studio.html?cpu): full pipeline on a synthetic portrait drawn on a canvas
// (no real person's photo in the repo), vector + PNG garment, retouch, background, brush, export PNG/JPEG/ID sheet,
// camera capture through fake cams, no console errors, no horizontal overflow at 390/1280 and the privacy scan.
// Also checks photobooth.html still works with the shared photobooth-outfits.js / studio-core.js.
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Synthetic portrait (head, hair, face features, neck, red T-shirt) on a soft studio gradient + sensor-like noise. */
const PORTRAIT = `(() => {
  const W = 900, H = 1100, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"), g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#c9d3dc"); g.addColorStop(1, "#aab6c2"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const cx = 450, skin = "#d9a989";
  x.fillStyle = "#b8343a"; x.beginPath(); x.moveTo(cx - 90, 640); x.bezierCurveTo(cx - 220, 660, cx - 330, 690, cx - 360, 800); x.lineTo(cx - 400, H); x.lineTo(cx + 400, H); x.lineTo(cx + 360, 800); x.bezierCurveTo(cx + 330, 690, cx + 220, 660, cx + 90, 640); x.fill();
  x.fillStyle = skin; x.fillRect(cx - 70, 520, 140, 140);
  x.beginPath(); x.ellipse(cx, 640, 90, 30, 0, 0, Math.PI); x.fill();
  x.fillStyle = "#2b1d16"; x.beginPath(); x.ellipse(cx, 330, 175, 200, 0, 0, 7); x.fill();
  x.fillStyle = skin; x.beginPath(); x.ellipse(cx, 400, 150, 190, 0, 0, 7); x.fill();
  x.fillStyle = "#2b1d16"; x.beginPath(); x.ellipse(cx, 255, 160, 70, 0, Math.PI, 2 * Math.PI); x.fill();
  x.fillStyle = "#3a2a20"; [-1, 1].forEach(s => { x.fillRect(cx + s * 60 - 35, 335, 70, 12); });
  x.fillStyle = "#fff"; [-1, 1].forEach(s => { x.beginPath(); x.ellipse(cx + s * 60, 375, 26, 12, 0, 0, 7); x.fill(); });
  x.fillStyle = "#3b2a1e"; [-1, 1].forEach(s => { x.beginPath(); x.arc(cx + s * 60, 375, 10, 0, 7); x.fill(); });
  x.strokeStyle = "rgba(120,70,50,.6)"; x.lineWidth = 5; x.beginPath(); x.moveTo(cx, 390); x.lineTo(cx - 14, 460); x.lineTo(cx + 8, 468); x.stroke();
  x.fillStyle = "#a8524c"; x.beginPath(); x.ellipse(cx, 515, 45, 13, 0, 0, 7); x.fill();
  x.fillStyle = "rgba(120,60,40,.7)"; x.beginPath(); x.arc(cx + 70, 470, 4, 0, 7); x.fill(); // blemish
  const id = x.getImageData(0, 0, W, H), d = id.data; let s = 7;
  for (let i = 0; i < d.length; i += 4) { s = (s * 1103515245 + 12345) & 0x7fffffff; const n = (s / 0x7fffffff - .5) * 10; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(id, 0, 0);
  return c;
})()`;

/** Garment PNG with transparency (a plain jacket shape, no insignia) as a File for the "เพิ่มชุด" input. */
const GARMENT_FILE = `(async () => {
  // a whole garment with a transparent margin (garmentPhotoCheck refuses one cut off at the frame edge)
  const W = 700, H = 600, c = document.createElement("canvas"); c.width = W; c.height = H;
  const x = c.getContext("2d"), cx = 350, yb = H - 60;
  x.fillStyle = "#24314d"; x.beginPath(); x.moveTo(cx - 70, 40); x.bezierCurveTo(cx - 160, 55, cx - 250, 70, cx - 270, 150); x.lineTo(cx - 300, yb); x.lineTo(cx + 300, yb); x.lineTo(cx + 270, 150); x.bezierCurveTo(cx + 250, 70, cx + 160, 55, cx + 70, 40); x.closePath(); x.fill();
  x.fillStyle = "#f4f4f2"; x.beginPath(); x.moveTo(cx - 70, 40); x.lineTo(cx, 220); x.lineTo(cx + 70, 40); x.closePath(); x.fill();
  // an open neckline, as on a real garment (with a flat closed top the neck anchor is ambiguous and the photo check says "tilted")
  x.globalCompositeOperation = "destination-out"; x.beginPath(); x.ellipse(cx, 40, 60, 45, 0, 0, 7); x.fill(); x.globalCompositeOperation = "source-over";
  const b = await new Promise(r => c.toBlob(r, "image/png"));
  return new File([b], "jacket-test.png", { type: "image/png" });
})()`;

function realErrors(page) {
  return page.consoleErrors.filter(e => !(e.kind !== "exception" && /404/.test(e.text || "") && /\/api\//.test(e.url || "")));
}
async function overflowAt(page, width) {
  await page.send("Emulation.setDeviceMetricsOverride", { width, height: 900, deviceScaleFactor: 1, mobile: width < 600 });
  await sleep(400);
  const r = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  await page.send("Emulation.clearDeviceMetricsOverride");
  assert(r.sw <= r.cw + 1, `horizontal overflow at ${width}px: ` + JSON.stringify(r));
}

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  try {
    let page;
    await check("studio: page loads with ?cpu, nav group links studio, engine ready", async () => {
      page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS = { n: 1, mode: 'ok' };"] });
      await page.send("Page.setDownloadBehavior", { behavior: "deny" }).catch(() => {});
      await page.goto(`${base}/studio.html?cpu`); // default deployed mode: MediaPipe Selfie Multiclass (Apache-2.0), committed
      await assertNoWebGL(page);
      const nav = await page.evaluate(() => [...document.querySelectorAll("#navsub-photo a")].map(a => a.getAttribute("href")));
      assert(nav.includes("photobooth.html") && nav.includes("studio.html"), "nav group: " + nav);
      assert(await page.evaluate(() => document.querySelector('#navsub-photo a[href="studio.html"]').getAttribute("aria-current") === "page"), "studio is current");
      await page.waitFor(`document.querySelectorAll("#stOutfits .choice").length >= 10`, 10000);
      await page.waitFor(`/MODNet/.test(document.getElementById("stEngine").textContent) && !/กำลังโหลด/.test(document.getElementById("stEngine").textContent)`, 30000);
      // round 11: repositioned as a portrait & ID photo studio; model names only behind "technical details"; one-line disclaimer + read more
      const r11 = await page.evaluate(() => ({
        h1: document.querySelector("h1").textContent, title: document.title,
        nav: document.querySelector('#navsub-photo a[href="studio.html"]').textContent,
        first: [...document.querySelectorAll(".st-panel > details > summary")].map(s => s.textContent),
        exp: document.querySelector(".st-exp") && document.querySelector(".st-exp #stOutfits") !== null && document.getElementById("stExpTitle").textContent,
        ready: document.getElementById("stReady").textContent, techClosed: !document.querySelector(".st-techline").open, engineInTech: !!document.querySelector(".st-techline #stEngine"),
        more: !!document.querySelector(".st-more #stEngine") || !!document.querySelector(".st-more [data-i18n='studio.expect']"),
        aria: document.getElementById("stQaDraft").getAttribute("aria-label"),
        cover: document.querySelector('#stCover option[value="auto"]').textContent
      }));
      assert(/รูปติดบัตร/.test(r11.h1) && /รูปติดบัตร/.test(r11.title) && /รูปติดบัตร/.test(r11.nav), "renamed " + JSON.stringify(r11));
      assert(r11.first[0] === "ฉากหลัง" && r11.first.includes("รีทัช") && r11.first.includes("บันทึกภาพ"), "background/retouch/ID first " + r11.first);
      assert(/ทดลอง/.test(r11.exp), "outfits under the experimental section " + r11.exp);
      assert(!/MODNet|MediaPipe/.test(r11.ready) && r11.techClosed && r11.engineInTech && r11.more, "plain status line, model names in technical details " + JSON.stringify(r11));
      assert(r11.aria && r11.aria.length > 2, "#stQaDraft has an accessible name at load");
      assert(/ผมบัง/.test(r11.cover) && !/ไม่ผ่าน/.test(r11.cover), "cover 'auto' text matches the code (jaw strip open, regardless of the plain result): " + r11.cover);
    });

    await check("studio: full pipeline on a synthetic portrait (matte -> fit -> blend -> retouch) under 3 s of processing", async () => {
      await page.evaluate(`window.__studio.load(${PORTRAIT})`);
      const st0 = await page.waitFor(`window.__studio.state.phase === "done" && { g: window.__studio.state.gKey, shown: window.__studio.state.shown }`, 60000);
      // round 10: the dependable output (new background + retouch, no outfit) is the default; an outfit only when the user picks one
      assert(st0.g === "none" && st0.shown === "none", "default is no outfit " + JSON.stringify(st0));
      // round 11: pre-flight photo check in the outfit section; plain "done" status line
      const pre = await page.evaluate(() => { const el = document.getElementById("stPre"), S = window.__studio.state; return { vis: !el.hidden, items: [...el.querySelectorAll("li")].map(li => li.dataset.k), ok: S.pre && S.pre.ok, ready: document.getElementById("stReady").textContent }; });
      assert(pre.vis && ["frontal", "neck", "hair", "clothes", "framing"].every(k => pre.items.includes(k)), "pre-flight list " + JSON.stringify(pre));
      assert(/เสร็จ/.test(pre.ready) && !/MODNet/.test(pre.ready), "plain done line " + pre.ready);
      await page.evaluate(() => window.__studio.select("v:suit_navy"));
      const st = await page.evaluate(() => ({ t: window.__studio.state.timings, W: window.__studio.state.W, H: window.__studio.state.H, m: window.__studio.state.method, face: !!window.__studio.state.face, g: window.__studio.state.gKey }));
      console.log("       timings ms: " + Object.entries(st.t).map(([k, v]) => `${k}=${Math.round(v)}`).join(" ") + ` · ${st.W}x${st.H} · ${st.m} · garment ${st.g}`);
      assert(st.W === 900 && st.H === 1100, "working size");
      assert(st.m === "MODNet", "matte method " + st.m);
      const proc = st.t.matte + st.t.refine + st.t.foreground + st.t.render;
      assert(proc < 6000, "processing time " + proc); // budget 3 s on M1; headless CI machines are slower
      const px = await page.evaluate(() => {
        // the garment render itself (on screen, or kept as S.draft when the quality gate withheld it)
        const S = window.__studio.state, o = document.getElementById("stOut"), g = S.draft ? S.draft.rgba : S.out, at = (X, Y) => [...g.slice((Y * S.W + X) * 4, (Y * S.W + X) * 4 + 4)];
        return { size: [o.width, o.height], alpha: S.alpha.reduce((a, b) => a + b, 0) / S.alpha.length, corner: at(10, 10), shirt: at(150, 1050), face: at(450, 430), chest: at(450, 900), targets: S.targets, body: S.body };
      });
      assert(px.size[0] === 900 && px.size[1] === 1100, "out size");
      assert(px.alpha > .15 && px.alpha < .8, "matte covers the subject: " + px.alpha);
      assert(px.targets && px.targets.l.x < px.targets.chin.x && px.targets.r.x > px.targets.chin.x, "shoulder targets " + JSON.stringify(px.targets));
      // background replaced (default ฟ้าอ่อน #d7e7f7), face kept, red T-shirt covered by the garment
      assert(Math.abs(px.corner[0] - 0xd7) < 12 && Math.abs(px.corner[2] - 0xf7) < 12, "bg " + px.corner);
      assert(px.face[0] > 150 && px.face[0] > px.face[2], "face visible " + px.face);
      assert(!(px.chest[0] > 150 && px.chest[1] < 90), "original red shirt hidden at chest " + px.chest);
      // layer order: MediaPipe Selfie Multiclass (ORT wasm) split head/hair/neck/clothes; a neck layer reaches from the jaw to below the collar
      const ly = await page.evaluate(() => {
        const S = window.__studio.state, f = S.face, W = S.W, nk = S.cache.neck, F = S.cache.fit, x = Math.round(f.chinX);
        const collarTop = Math.round(F.N.y + F.s * (PBOutfits.CANON.collarY + (F.drop || 0)));
        let gap = 0; for (let y = Math.round(f.chinY); y < collarTop + 4; y++) if (nk.alpha[y * W + x] < .5 && S.layers.keep[y * W + x] < .5) gap++;
        return { parse: S.parse, gap, neckBelowCollar: nk.alpha[(collarTop + 6) * W + x], ratio: S.fitAuto.width / f.fw };
      });
      const fs = await import("node:fs");
      assert(ly.parse === "MediaPipe Multiclass", "default parser is the commercially licensed model: " + ly.parse);
      assert(fs.existsSync(new URL("../../vendor/models/selfie-multiclass-256-f16.onnx", import.meta.url)) && /Apache License/.test(fs.readFileSync(new URL("../../vendor/models/SELFIE-MULTICLASS-LICENSE.txt", import.meta.url), "utf8")), "model + licence vendored");
      assert(!page.requests.some(r => /faceparse-bisenet/.test(r.url)), "non-commercial BiSeNet weights are not requested by default");
      assert(ly.gap <= 2 && ly.neckBelowCollar > .9, "neck continuous from chin to collar " + JSON.stringify(ly));
      assert(ly.ratio >= 2.5 && ly.ratio <= 3.3, "shoulder width prior " + ly.ratio);
    });

    await check("studio: quality gate (studio-qa.js, all checks) runs inside every garment render; a failing render is withheld and the safe composition is shown, the draft only on request", async () => {
      await page.evaluate(() => window.__studio.render());
      const q = await page.evaluate(() => { const S = window.__studio.state; return { pass: S.qa && S.qa.pass, keys: S.qa ? Object.keys(S.qa.m) : [], t: S.timings.qa, shown: S.shown, hidden: document.getElementById("stQa").hidden }; });
      for (const k of ["neckJoin", "neckNotch", "faceIsland", "neckRel", "jawBlob", "hairCut", "hem", "shoulder", "stray"]) assert(q.keys.includes(k), "gate runs " + k + ": " + q.keys);
      assert(q.t < 1500, "QA time " + q.t);
      assert(q.shown === (q.pass ? "garment" : "safe") && !q.hidden, "shown follows the gate; a notice is always visible with an outfit " + JSON.stringify(q));
      // passing outfit = preview with the measured miss rate and a switch to the version without the outfit
      if (q.pass) {
        const p = await page.evaluate(() => document.getElementById("stQa").textContent);
        assert(/ตัวอย่าง/.test(p) && /ในชุดทดสอบ/.test(p) && /ไม่ใส่ชุด/.test(p), "preview notice: " + p);
        // round 12: the miss rate is quoted for BOTH splits from StudioQA.FIGURES (test 36 %, dev 56 %), and the calibrated-confidence
        // line uses the same figures (defect share on dev and on test), so the two messages cannot disagree
        const F = await page.evaluate(() => window.StudioQA.FIGURES);
        assert(new RegExp(F.shownBad.test.p + "%").test(p) && new RegExp(F.shownBad.dev.p + "%").test(p) && /ชุดพัฒนา/.test(p) && /ไม่ใช่คน/.test(p), "both splits quoted: " + p);
        const cf = await page.evaluate(() => ({ ...window.__studio.state.qa.conf, v: window.__studio.state.variant }));
        if (cf && cf.show === false) { const c = F[cf.v === "cover" ? "calibCover" : "calibPlain"]; assert(new RegExp((100 - c.dev.p) + "% ในชุดพัฒนา").test(p) && new RegExp((100 - c.test.p) + "% ในชุดทดสอบ").test(p), "low-confidence line on a shown outfit: " + p); }
        await page.evaluate(() => document.getElementById("stQaDraft").click());
        await page.waitFor(`window.__studio.state.shown === "plain" && document.getElementById("stQa").dataset.shown === "plain"`, 5000);
        await page.evaluate(() => document.getElementById("stQaDraft").click());
        await page.waitFor(`window.__studio.state.shown === "garment"`, 5000);
      }
      // force a failure: the garment render is withheld, the safe composition (own clothes + new background) is on screen
      const saved = await page.evaluate(() => window.StudioQA.LIMITS.neckBgPct);
      await page.evaluate(() => { window.StudioQA.LIMITS.neckBgPct = -1; return window.__studio.render(); });
      const red = () => page.evaluate(() => { const d = document.getElementById("stOut").getContext("2d").getImageData(450, 900, 1, 1).data; return d[0] > 150 && d[1] < 90; });
      const f = await page.evaluate(() => { const S = window.__studio.state, el = document.getElementById("stQa"); return { shown: S.shown, draft: !!S.draft, vis: !el.hidden, text: el.textContent, dl: !document.getElementById("stPng").disabled }; });
      assert(f.shown === "safe" && f.draft && f.vis && f.dl, "withheld " + JSON.stringify(f));
      assert(/ไม่เนียน/.test(f.text) && /เสื้อเดิม/.test(f.text) && /แบบร่าง/.test(f.text), "Thai notice + draft button: " + f.text);
      assert(await red(), "safe composition keeps the person's own (red) shirt");
      await page.evaluate(() => document.getElementById("stQaDraft").click());
      const d = await page.waitFor(`window.__studio.state.shown === "draft" && document.getElementById("stQa").dataset.shown === "draft" && document.getElementById("stQa").textContent`, 5000);
      assert(/แบบร่าง/.test(d) && !(await red()), "draft on request shows the garment with a warning: " + d);
      await page.evaluate(() => document.getElementById("stQaDraft").click());
      await page.waitFor(`window.__studio.state.shown === "safe"`, 5000);
      const fsm = await import("node:fs");
      for (const lang of ["zh", "en"]) { const t = fsm.readFileSync(new URL(`../../i18n/${lang}-studio.js`, import.meta.url), "utf8"); for (const k of ["safe", "showDraft", "preview", "plain", "showPlain", "showPreview"]) assert(t.includes(`"studio.js.qa.${k}"`), lang + " gate string " + k); }
      await page.evaluate(v => { window.StudioQA.LIMITS.neckBgPct = v; return window.__studio.render(); }, saved);
    });

    await check("studio: fails closed when the quality checker (studio-qa.js) is missing: outfit withheld, 'unchecked' banner, confirmation before export", async () => {
      await page.evaluate(() => { window.__qaSaved = window.StudioQA; delete window.StudioQA; window.__studio.state.draftOK.clear(); return window.__studio.select("v:suit_navy"); });
      const u = await page.evaluate(() => { const S = window.__studio.state, el = document.getElementById("stQa"); return { shown: S.shown, fails: S.qa && S.qa.fails, vis: !el.hidden, t: el.textContent, draft: !!S.draft }; });
      assert(u.shown === "safe" && u.fails.includes("unchecked") && u.vis && u.draft && /โหลดไม่สำเร็จ/.test(u.t), "withheld when unchecked " + JSON.stringify(u));
      await page.evaluate(() => document.getElementById("stQaDraft").click());
      const t = await page.waitFor(`window.__studio.state.shown === "unchecked" && document.getElementById("stQa").textContent`, 8000);
      assert(/ยังไม่ได้ตรวจ/.test(t), "unchecked banner: " + t);
      await page.evaluate(() => { window.__studio.lastExport = null; document.getElementById("stPng").click(); });
      const m = await page.waitFor(`document.getElementById("stConfirm").open && document.getElementById("stConfirmMsg").textContent`, 5000);
      assert(/ยังไม่ได้ตรวจ/.test(m), "confirmation for an unchecked outfit: " + m);
      await page.evaluate(() => document.getElementById("stConfirmNo").click()); await sleep(200);
      assert(await page.evaluate(() => window.__studio.lastExport === null), "cancel = no file");
      await page.evaluate(() => { window.StudioQA = window.__qaSaved; window.__studio.state.draftOK.clear(); return window.__studio.select("none"); });
      assert(await page.evaluate(() => window.__studio.state.shown === "none" && !window.__studio.state.origFallback), "checker back: no-outfit version shown");
    });

    await check("studio: a defective no-outfit render (background stuck beside the head) falls back to the untouched photo; edited version only on request, marked and confirmed", async () => {
      // paint a background slab beside the head (restore brush), joined to the head by a bridge so the clean-up cannot drop it as an island
      const at = await page.evaluate(async () => {
        const S = window.__studio.state, f = S.face, x0 = Math.min(S.W - 40, Math.round(f.cx + f.fw * 1.25)), y0 = Math.max(30, Math.round(f.chinY - f.fw * 1.1));
        for (let y = y0; y < f.chinY - 10; y += 12) StudioCore.brush(S.edit, S.W, S.H, x0, y, 26, 1);
        for (let x = Math.round(f.cx); x <= x0; x += 12) StudioCore.brush(S.edit, S.W, S.H, x, Math.round(f.chinY - f.fw * .45), 16, 1);
        S.editVer++; await window.__studio.render(); return { x: x0, y: Math.round((y0 + f.chinY) / 2) };
      });
      const g = await page.evaluate(p => { const S = window.__studio.state, el = document.getElementById("stQa"), i = (p.y * S.W + p.x) * 4, o = document.getElementById("stOut").getContext("2d").getImageData(p.x, p.y, 1, 1).data;
        let red = 0; const ov = document.getElementById("stOverlay").getContext("2d").getImageData(0, 0, S.W, S.H).data; for (let k = 0; k < ov.length; k += 16) if (ov[k] > 200 && ov[k + 1] < 60 && ov[k + 3] > 200) red++;
        return { pass: S.noq && S.noq.pass, fails: S.noq && S.noq.fails, orig: S.origFallback, same: [0, 1, 2].every(c => Math.abs(o[c] - S.px[i + c]) <= 2), vis: !el.hidden, shown: el.dataset.shown, t: el.textContent, red }; }, at);
      assert(g.pass === false && g.fails.length && g.orig && g.same && g.vis && g.shown === "orig" && /รูปเดิม/.test(g.t) && g.red > 20, "fallback to the original photo " + JSON.stringify(g));
      await page.evaluate(() => document.getElementById("stQaDraft").click());
      await page.waitFor(`window.__studio.state.noqAnyway && !window.__studio.state.origFallback && document.getElementById("stQa").dataset.shown === "noq-draft"`, 8000);
      await page.evaluate(() => { window.__studio.lastExport = null; document.getElementById("stPng").click(); });
      const m = await page.waitFor(`document.getElementById("stConfirm").open && document.getElementById("stConfirmMsg").textContent`, 5000);
      assert(/ไม่ผ่านการตรวจ/.test(m), "confirm before exporting a flagged no-outfit render: " + m);
      await page.evaluate(() => document.getElementById("stConfirmNo").click()); await sleep(200);
      await page.evaluate(() => document.getElementById("stQaDraft").click());
      await page.waitFor(`window.__studio.state.origFallback`, 8000);
      await page.evaluate(() => document.getElementById("stUndoEdit").click());
      await sleep(300); await page.evaluate(() => window.__studio.render());
      assert(await page.evaluate(() => window.__studio.state.noq.pass && !window.__studio.state.origFallback), "clean again after undoing the brush");
    });

    await check("studio: every garment renders; retouch / background / brush / handles update the result", async () => {
      const keys = await page.evaluate(() => window.__studio.garments());
      for (const k of keys.filter(k => k.startsWith("v:"))) {
        await page.evaluate(k => window.__studio.select(k), k);
        const ok = await page.evaluate(() => { const S = window.__studio.state; return !!S.out && !!S.targets; });
        assert(ok, "rendered " + k);
      }
      const sig = () => page.evaluate(() => { const d = window.__studio.state.out; let s = 0; for (let i = 0; i < d.length; i += 97) s = (s * 31 + d[i]) % 1e9; return s; });
      const s0 = await sig();
      await page.evaluate(() => { const r = document.getElementById("rSmooth"); r.value = 90; r.dispatchEvent(new Event("input")); });
      await sleep(150);
      await page.evaluate(() => window.__studio.render());
      const s1 = await sig();
      assert(s1 !== s0, "retouch changed the output");
      for (const k of ["blur", "grad", "#ffffff"]) {
        await page.evaluate(k => document.querySelector(`#stBg button[data-k="${k}"]`).click(), k);
        await sleep(150); await page.evaluate(() => window.__studio.render());
      }
      const white = await page.evaluate(() => [...document.getElementById("stOut").getContext("2d").getImageData(8, 8, 1, 1).data]);
      assert(white[0] > 245 && white[1] > 245 && white[2] > 245, "white bg " + white);
      // brush erase in the middle of the face -> background shows there
      const erased = await page.evaluate(async () => {
        document.querySelector('#stMode button[data-m="erase"]').click();
        const S = window.__studio.state; StudioCore.brush(S.edit, S.W, S.H, 450, 300, 30, -1); S.editVer++;
        await window.__studio.render();
        return [...document.getElementById("stOut").getContext("2d").getImageData(450, 300, 1, 1).data];
      });
      assert(erased[0] > 240 && erased[2] > 240, "erased to bg " + erased);
      await page.evaluate(() => document.getElementById("stUndoEdit").click());
      // drag the right-shoulder handle with real pointer events
      await page.evaluate(() => document.querySelector('#stMode button[data-m="fit"]').click());
      await sleep(200);
      const before = await page.evaluate(() => window.__studio.state.targets.r.x);
      const pt = await page.evaluate(() => {
        const S = window.__studio.state, ov = document.getElementById("stOverlay"), r = ov.getBoundingClientRect(), k = r.width / S.W;
        window.scrollBy({ top: r.top + S.targets.r.y * k - innerHeight / 2, behavior: "instant" });
        const r2 = ov.getBoundingClientRect(), x = r2.left + S.targets.r.x * k, y = r2.top + S.targets.r.y * k, hit = document.elementFromPoint(x, y);
        return { x, y, k, hit: hit && hit.id };
      });
      assert(pt.hit === "stOverlay", "overlay under the pointer: " + JSON.stringify(pt));
      for (const [type, dx] of [["mousePressed", 0], ["mouseMoved", 20], ["mouseMoved", 40], ["mouseReleased", 40]]) await page.send("Input.dispatchMouseEvent", { type, x: pt.x + dx, y: pt.y, button: "left", clickCount: 1, buttons: type === "mouseReleased" ? 0 : 1 });
      await page.waitFor(`window.__studio.state.manual && Math.abs(window.__studio.state.manual.r.x - ${before}) > 10`, 5000);
      await sleep(300); await page.evaluate(() => window.__studio.render());
      const after = await page.evaluate(() => window.__studio.state.targets.r.x);
      assert(after > before + 10, `handle moved ${before} -> ${after}`);
    });

    await check("studio: add a garment PNG (IndexedDB template), anchor editor saves fit", async () => {
      await page.evaluate(`(async () => { const f = await ${GARMENT_FILE}; const dt = new DataTransfer(); dt.items.add(f); const i = document.getElementById("stGarmentFile"); i.files = dt.files; i.dispatchEvent(new Event("change")); })()`);
      const gm = await page.waitFor(`!/กำลังเตรียม/.test(document.getElementById("stGarmentMsg").textContent) && document.getElementById("stGarmentMsg").textContent`, 20000);
      assert(/เพิ่มชุด/.test(gm) && await page.evaluate(() => window.__studio.state.gKey.startsWith("tpl:")), "garment added: " + gm);
      await sleep(300); await page.evaluate(() => window.__studio.render());
      const stored = await page.evaluate(() => PBTpl.all().then(a => a.filter(i => i.kind === "outfit").map(i => i.name)));
      assert(stored.includes("jacket-test"), "stored template " + stored);
      await page.evaluate(() => document.getElementById("stAnchorBtn").click());
      assert(await page.evaluate(() => document.getElementById("stAnchorDlg").open), "dialog open");
      await page.evaluate(() => document.getElementById("stAnchorSave").click());
      // photo templates: auto-detected anchors (neck hole, collar points, shoulder tips, hem) are saved by the editor
      const it = await page.evaluate(() => PBTpl.all().then(a => a.find(i => i.name === "jacket-test")));
      const ok = (it.anchors && it.anchors.length >= 5 && it.anchors.every(p => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.u))) || (it.fit && it.fit.chin && it.fit.l && it.fit.r);
      assert(ok, "anchors saved " + JSON.stringify(it.anchors || it.fit));
      await sleep(300); await page.evaluate(() => window.__studio.render());
      // the garment render itself (the gate may withhold it on this synthetic portrait and keep it as S.draft)
      const chest = await page.evaluate(() => { const S = window.__studio.state, g = S.draft ? S.draft.rgba : S.out, i = (950 * S.W + 450) * 4; return [...g.slice(i, i + 4)]; });
      assert(chest[2] > chest[0], "navy jacket on chest " + chest);
    });

    await check("studio: mandatory review before export (red frames, tick to continue, once per image), then PNG, JPEG, ID photo and 4x6 sheet", async () => {
      await page.evaluate(() => { window.__studio.lastExport = null; document.getElementById("stPng").click(); });
      const r0 = await page.waitFor(`document.getElementById("stReview").open && { dis: document.getElementById("stReviewGo").disabled, items: [...document.querySelectorAll("#stReviewList li")].map(li => li.dataset.k), img: (document.getElementById("stReviewImg").src || "").slice(0, 22) }`, 8000);
      assert(r0.dis && r0.items.length >= 1 && r0.img === "data:image/jpeg;base64", "review dialog " + JSON.stringify(r0));
      await page.evaluate(() => document.getElementById("stReviewNo").click()); await sleep(200);
      assert(await page.evaluate(() => window.__studio.lastExport === null), "going back writes nothing");
      // from here on the review is ticked automatically whenever it opens (each export kind and image state asks once)
      await page.evaluate(() => { window.__rvTimer = setInterval(() => { const d = document.getElementById("stReview"); if (d && d.open) { const c = document.getElementById("stReviewOk"); c.checked = true; c.dispatchEvent(new Event("change")); document.getElementById("stReviewGo").click(); } }, 40); });
      const ex = async sel => { await page.evaluate(s => { window.__studio.lastExport = null; document.querySelector(s).click(); }, sel); return page.waitFor(`window.__studio.lastExport`, 15000); };
      const png = await ex("#stPng"), jpg = await ex("#stJpg"), one = await ex("#stIdOne"), sheet = await ex("#stIdSheet");
      assert(png.type === "image/png" && png.w === 900 && png.h === 1100 && png.size > 50000, "png " + JSON.stringify(png));
      assert(jpg.type === "image/jpeg" && jpg.size > 20000, "jpg " + JSON.stringify(jpg));
      assert(one.w === 295 && one.h === 354, "1-inch ID at 300 DPI " + JSON.stringify(one));
      assert(sheet.w === 1200 && sheet.h === 1800, "4x6 sheet " + JSON.stringify(sheet));
    });

    await check("studio: outfit exports carry the corner mark, filename suffix and PNG note; draft and ID-with-outfit need confirmation; ID defaults to no outfit; ID spec check", async () => {
      await page.evaluate(() => window.__studio.select("v:suit_navy"));
      if (await page.evaluate(() => window.__studio.state.shown === "safe")) { await page.evaluate(() => document.getElementById("stQaDraft").click()); await page.waitFor(`window.__studio.state.shown === "draft"`, 8000); }
      const shown = await page.evaluate(() => window.__studio.state.shown);
      assert(shown === "garment" || shown === "draft", "outfit on screen " + shown);
      const click = sel => page.evaluate(s => { window.__studio.lastExport = null; document.querySelector(s).click(); }, sel);
      if (shown === "draft") { // a QA-failed draft: confirm first; cancel = no file
        await click("#stPng"); await page.waitFor(`document.getElementById("stConfirm").open`, 5000);
        await page.evaluate(() => document.getElementById("stConfirmNo").click()); await sleep(300);
        assert(await page.evaluate(() => window.__studio.lastExport === null && !document.getElementById("stConfirm").open), "cancelled export writes nothing");
        await click("#stPng"); await page.waitFor(`document.getElementById("stConfirm").open`, 5000); await page.evaluate(() => document.getElementById("stConfirmOk").click());
      } else await click("#stPng");
      await page.waitFor(`window.__studio.lastExport`, 15000);
      const png = await page.evaluate(async () => { const e = window.__studio.lastExport, t = StudioCore.pngTexts(new Uint8Array(await e.blob.arrayBuffer())); return { name: e.name, synth: e.synthetic, mark: e.mark, t }; });
      assert(png.synth && png.mark && /-outfit-preview-/.test(png.name) && /outfit preview/.test(png.t.Description || "") && /ภาพจำลองชุด/.test(png.t.Comment || ""), "png note " + JSON.stringify(png));
      // corner mark can be switched off for ordinary exports (not for ID photos)
      await page.evaluate(() => { document.getElementById("stMark").checked = false; });
      await click("#stJpg"); if (shown === "draft") { await page.waitFor(`document.getElementById("stConfirm").open`, 5000); await page.evaluate(() => document.getElementById("stConfirmOk").click()); }
      const jpg = await page.waitFor(`window.__studio.lastExport && { s: window.__studio.lastExport.synthetic, m: window.__studio.lastExport.mark, n: window.__studio.lastExport.name }`, 15000);
      assert(jpg.s && !jpg.m && /-outfit-preview-/.test(jpg.n), "jpeg without corner mark still carries the suffix " + JSON.stringify(jpg));
      await page.evaluate(() => { document.getElementById("stMark").checked = true; });
      // ID photo: default = the no-outfit composition, no dialog
      await click("#stIdOne");
      const id0 = await page.waitFor(`window.__studio.lastExport && { s: window.__studio.lastExport.synthetic, w: window.__studio.lastExport.w, n: window.__studio.lastExport.name }`, 15000);
      assert(!id0.s && id0.w === 295 && !/outfit-preview/.test(id0.n), "ID defaults to no outfit " + JSON.stringify(id0));
      // with the outfit (user opt-in): confirm, always marked
      await page.evaluate(() => { document.getElementById("stIdOutfit").checked = true; });
      await click("#stIdOne"); await page.waitFor(`document.getElementById("stConfirm").open`, 5000); await page.evaluate(() => document.getElementById("stConfirmOk").click());
      const id1 = await page.waitFor(`window.__studio.lastExport && { s: window.__studio.lastExport.synthetic, m: window.__studio.lastExport.mark }`, 15000);
      assert(id1.s && id1.m, "ID with outfit is marked " + JSON.stringify(id1));
      await page.evaluate(() => { document.getElementById("stIdOutfit").checked = false; });
      // ID-photo spec checker (size, head ratio, top margin, centring, plain background, exposure, outfit) + the edited-photo rules note
      await page.evaluate(() => document.getElementById("stIdCheck").click());
      const spec = await page.waitFor(`document.querySelectorAll("#stIdSpec li").length === 7 && { k: [...document.querySelectorAll("#stIdSpec li")].map(l => l.dataset.k + ":" + l.className), note: document.querySelector("#stIdSpec .note").textContent }`, 8000);
      assert(spec.k.includes("size:ok") && spec.k.includes("outfit:ok") && /ออสเตรเลีย/.test(spec.note) && /เกาหลี/.test(spec.note), "spec " + JSON.stringify(spec));
    });

    await check("studio: high-collar cover variant on request, progress text, 2400-px export of the no-outfit version", async () => {
      await page.evaluate(() => { const s = document.getElementById("stCover"); s.value = "on"; s.dispatchEvent(new Event("change")); });
      await sleep(200); await page.evaluate(() => window.__studio.render());
      const v = await page.evaluate(() => ({ variant: window.__studio.state.variant, cover: !!window.__studio.state.cache.cover || !!(window.__studio.state.draft && window.__studio.state.variant) }));
      assert(v.variant === "cover", "cover variant " + JSON.stringify(v));
      await page.evaluate(() => { const s = document.getElementById("stCover"); s.value = "auto"; s.dispatchEvent(new Event("change")); });
      // a photo larger than the 1200-px working size keeps a ≤ 2400-px original for the high-resolution export
      await page.evaluate(`(() => { const p = ${PORTRAIT}, c = document.createElement("canvas"); c.width = 1800; c.height = 2200; c.getContext("2d").drawImage(p, 0, 0, 1800, 2200); window.__studio.load(c); })()`);
      const busyTxt = await page.waitFor(`!document.getElementById("stBusy").hidden && /[0-9][/]5/.test(document.getElementById("stBusy").textContent) && document.getElementById("stBusy").textContent`, 20000);
      assert(/วินาที/.test(busyTxt), "progress + ETA: " + busyTxt);
      await page.waitFor(`window.__studio.state.phase === "done" && !document.getElementById("stHiRes").disabled`, 90000);
      await page.evaluate(() => { window.__studio.lastExport = null; document.getElementById("stHiRes").click(); });
      const hi = await page.waitFor(`window.__studio.lastExport && { w: window.__studio.lastExport.w, h: window.__studio.lastExport.h, s: window.__studio.lastExport.synthetic }`, 60000);
      assert(hi.w === 1800 && hi.h === 2200 && !hi.s, "hi-res no-outfit export " + JSON.stringify(hi));
    });

    await check("studio: camera capture through LQCam (fake camera) runs the pipeline", async () => {
      await page.evaluate(() => { document.getElementById("stNew").click(); document.getElementById("stCamBtn").click(); });
      await page.waitFor(`document.getElementById("stVideo").videoWidth > 0`, 8000);
      await page.evaluate(() => document.getElementById("stShoot").click());
      await page.waitFor(`window.__studio.state.phase === "analyzing" || window.__studio.state.phase === "rendering"`, 5000);
      const st = await page.waitFor(`window.__studio.state.phase === "done" && { W: window.__studio.state.W, H: window.__studio.state.H }`, 60000);
      assert(st.W === 640 && st.H === 480, "captured size " + JSON.stringify(st));
      assert(await page.evaluate(() => !document.getElementById("stVideo").srcObject || document.getElementById("stVideo").srcObject.getVideoTracks().every(t => t.readyState === "ended")), "camera stopped after capture");
    });

    await check("studio: no console errors, no overflow at 390/1280, privacy (no /api, no images in localStorage)", async () => {
      await overflowAt(page, 390);
      await overflowAt(page, 1280);
      await privacyScan(page);
      const posts = page.requests.filter(r => r.method !== "GET" && !r.url.startsWith("data:") && !r.url.startsWith("blob:"));
      assert(!posts.length, "no uploads: " + posts.map(r => r.url).join(", "));
      const errs = realErrors(page);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("studio: before upload, no overflow at 390 and drawer nav scrolls", async () => {
      const p = await browser.newPage(`${base}/studio.html?cpu`);
      await p.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 500, deviceScaleFactor: 2, mobile: true });
      await sleep(400);
      const r = await p.evaluate(async () => {
        document.querySelector(".nav-toggle").click(); await new Promise(r => setTimeout(r, 300));
        const m = document.getElementById("siteMenu"), cs = getComputedStyle(m);
        return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, open: document.getElementById("siteNav").classList.contains("menu-open"), scrollable: m.scrollHeight > m.clientHeight ? /auto|scroll/.test(cs.overflowY) : true };
      });
      assert(r.sw <= r.cw + 1 && r.open && r.scrollable, JSON.stringify(r));
      await p.close();
    });

    await check("photobooth: still loads with shared photobooth-outfits.js + studio-core.js, outfit choices drawn", async () => {
      const p = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS = { n: 1, mode: 'ok' };"] });
      await p.goto(`${base}/photobooth.html?cpu&fakedet`);
      await p.evaluate(() => document.querySelector('.tab[data-t="id"]').click());
      const n = await p.waitFor(`document.querySelectorAll("#outfits .choice").length >= 10 && typeof PBOutfits.draw === "function" && typeof StudioCore.harmonizeGarment === "function" && document.querySelectorAll("#outfits .choice").length`, 8000);
      assert(n >= 10, "choices " + n);
      // round 10: the civil-service preset picks an outfit, but the ID photo shows the no-outfit version first (outfit only as a marked draft)
      await p.waitFor(`typeof window.__pb === "object" && typeof StudioQA.boothCheck === "function"`, 8000);
      await p.waitFor(`/MODNet/.test(document.getElementById("engine").textContent) && !/กำลังโหลด/.test(document.getElementById("engine").textContent)`, 60000);
      await p.evaluate(`window.__pb.idFromImage(${PORTRAIT})`);
      await p.waitFor(`window.__pb.idState.cap && document.getElementById("pbOutfitDraft") !== null`, 30000);
      await p.evaluate(() => document.querySelector('#idPurpose button[data-k="gov"]').click());
      // round 12: drawn outfits are off by default (124/124 defective); the preset keeps its outfit choice but the photo uses own clothes
      const off = await p.waitFor(`window.__pb.idState.shownOutfit === "off" && { o: window.__pb.idState.outfit, note: document.getElementById("pbOutfitNote").textContent, btn: document.getElementById("pbOutfitDraft").hidden, box: document.getElementById("pbOutfitBox").hidden, gal: document.getElementById("outfitGalleryWrap").hidden, cb: document.getElementById("pbExpOutfit").checked }`, 8000);
      assert(off.o === "civil" && /ปิดไว้เป็นค่าเริ่มต้น/.test(off.note) && off.btn && off.box && off.gal && !off.cb, "outfits off by default " + JSON.stringify(off));
      assert(await p.evaluate(() => window.__pb.outfitConfirm()) === true, "nothing to confirm while outfits are off");
      await p.evaluate(() => { const c = document.getElementById("pbExpOutfit"); c.checked = true; c.dispatchEvent(new Event("change")); });
      await p.waitFor(`!document.getElementById("pbOutfitBox").hidden && !document.getElementById("outfitGalleryWrap").hidden && document.querySelectorAll("#outfitGallery .choice").length > 1`, 8000); // the switch shows the outfit choices
      const st = await p.waitFor(`window.__pb.idState.shownOutfit && { o: window.__pb.idState.outfit, s: window.__pb.idState.shownOutfit, note: !document.getElementById("pbOutfitNote").hidden }`, 8000);
      assert(st.o === "civil" && st.s === "safe" && st.note, "preset -> safe first " + JSON.stringify(st));
      await p.evaluate(() => document.getElementById("pbOutfitDraft").click());
      const d = await p.waitFor(`window.__pb.idState.shownOutfit === "draft" && (() => { const c = window.__pb.idState.last.photo, d = c.getContext("2d").getImageData(c.width - 40, c.height - 18, 36, 14).data; let m = 255; for (let i = 0; i < d.length; i += 4) m = Math.min(m, d[i]); return [m]; })()`, 8000);
      assert(d[0] < 120, "corner mark on the draft ID photo (darkest red in the corner) " + d);
      // exporting a photo with a drawn outfit asks first
      const conf = p.evaluate(() => window.__pb.outfitConfirm());
      await p.waitFor(`document.getElementById("pbConfirm").open`, 5000);
      await p.evaluate(() => document.getElementById("pbConfirmNo").click());
      assert((await conf) === false, "cancel");
      // round 11: the draft confirmation follows this photo's check result (failed / passed / not checked)
      const msgs = [];
      for (const qa of [{ pass: false, fails: ["leftover"], m: {} }, { pass: true, fails: [], m: {} }, null]) {
        const c2 = p.evaluate(q => { window.__pb.idState.boothQA = q; return window.__pb.outfitConfirm(); }, qa);
        await p.waitFor(`document.getElementById("pbConfirm").open`, 5000);
        msgs.push(await p.evaluate(() => document.getElementById("pbConfirmMsg").textContent));
        await p.evaluate(() => document.getElementById("pbConfirmNo").click()); await c2;
      }
      assert(/ไม่ผ่าน/.test(msgs[0]) && /ไม่พบปัญหา/.test(msgs[1]) && !/ไม่ผ่านการตรวจ/.test(msgs[1]) && /ยังไม่ได้ตรวจ/.test(msgs[2]), "draft confirm depends on boothQA " + JSON.stringify(msgs));
      // the "ai" (external service) state shows its own outfit note
      const ai = await p.evaluate(() => { window.__pb.idState.shownOutfit = "ai"; window.__pb.syncOutfitNote(); const el = document.getElementById("pbOutfitNote"); return { vis: !el.hidden, t: el.textContent, btn: document.getElementById("pbOutfitDraft").hidden }; });
      assert(ai.vis && /Replicate/.test(ai.t) && ai.btn, "ai outfit note " + JSON.stringify(ai));
      // mandatory review before print/download in ID mode: dialog, continue only after ticking, once per photo; result goes into the PNG
      await p.evaluate(() => document.querySelector('#idPurpose button[data-k="gov"]').click()); // back to a normal render
      await p.evaluate(() => { const b = document.getElementById("pbOutfitDraft"); if (window.__pb.idState.shownOutfit === "draft" && b) b.click(); });
      const rv = p.evaluate(() => window.__pb.reviewGate());
      await p.waitFor(`document.getElementById("pbReview").open`, 5000);
      const r0 = await p.evaluate(() => ({ dis: document.getElementById("pbReviewGo").disabled, items: [...document.querySelectorAll("#pbReviewList li")].map(li => li.dataset.k), img: (document.getElementById("pbReviewImg").src || "").slice(0, 22) }));
      assert(r0.dis && r0.items.length >= 2 && r0.items.some(k => k.startsWith("spec-")) && r0.img === "data:image/png;base64,", "review dialog " + JSON.stringify(r0));
      await p.evaluate(() => { const c = document.getElementById("pbReviewOk"); c.checked = true; c.dispatchEvent(new Event("change")); document.getElementById("pbReviewGo").click(); });
      assert((await rv) === true, "continue after ticking");
      assert(await p.evaluate(() => window.__pb.reviewGate()), "not asked again for the same photo");
      const meta = await p.evaluate(async () => { const b = await window.__pb.canvasBlob(window.__pb.idState.last.photo), u = new Uint8Array(await b.arrayBuffer()); return StudioCore.pngTexts ? StudioCore.pngTexts(u) : null; });
      const idm = meta && (meta["LENSIQ-ID-Check"] || (Array.isArray(meta) && (meta.find(x => x[0] === "LENSIQ-ID-Check") || [])[1]));
      assert(idm && /head=/.test(idm) && /reviewed-by-user=yes/.test(idm), "ID check recorded in the PNG: " + JSON.stringify(meta));
      const uncaught = p.consoleErrors.filter(e => e.kind === "exception");
      assert(!uncaught.length, "uncaught: " + JSON.stringify(uncaught.slice(0, 2)));
      await p.close();
    });
  } finally { await browser.close(); }
}
