#!/usr/bin/env node
// tools/print-samples.mjs — PDF samples of the paper report for the owner's approval (owner order 2026-11-16, testers item B).
// Produces a reading on each page the way a person would (headless Chrome, the same recipes as the locked e2e kit), presses
// the page's own print button and saves what Chrome prints (Page.printToPDF = Playwright page.pdf()). The person's name and
// birth data are left out (the "include" switch stays off, the default). No image of a person is used: the face page reads a
// synthetic camera (tests/e2e/fake-cams.js) and the camera photo is never printed.
//   node tools/print-samples.mjs [outDir] [--colour | --photo | --fortune]   default ~/Desktop/LENSIQ-review/print; --colour: the two *-colour.pdf samples
//   --fortune (owner inbox 2026-11-21 entry 26): A4 and 80 mm, Thai, horoscope (text page), palm and face reading, every switch at
//   its default (photo OFF, name / birth data OFF): what a person gets when they press print without changing anything
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../tests/e2e/cdp.mjs";
import { assertFreeSpace } from "./disk-guard.mjs";

assertFreeSpace({ label: "tools/print-samples.mjs" }); // stops with exit 75 when free disk space is under 5 GB, before the server or Chrome

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ARGS = process.argv.slice(2), COLOUR = ARGS.includes("--colour"), PHOTO = ARGS.includes("--photo"), FORTUNE = ARGS.includes("--fortune");
const OUT = ARGS.find(a => !a.startsWith("--")) || join(homedir(), "Desktop", "LENSIQ-review", "print");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const S = JSON.stringify;
const fakeCams = readFileSync(join(REPO, "tests", "e2e", "fake-cams.js"), "utf8");
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const READ = {
  palm: async p => {
    await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
    await p.evaluate(() => document.getElementById("plStartCam").click());
    await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
    await p.evaluate(d => { window.__dets = d; }, [{ x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" }]);
    await sleep(600);
    await p.evaluate(() => document.getElementById("plSnap").click());
    await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
    await p.evaluate(() => document.getElementById("plRead").click());
    await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
  },
  horoscope: async p => {
    await p.evaluate(setSel("hsDay", "15")); await p.evaluate(setSel("hsMonth", "8")); await p.evaluate(setSel("hsYear", "2533"));
    await p.evaluate(() => document.getElementById("hsGo").click()); await p.waitFor(sections(3), 20000);
  },
  tarot: async p => {
    await p.evaluate(() => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="work"]') && document.querySelector('input[value="work"]').click(); document.getElementById("trStart").click(); });
    await sleep(600); await p.evaluate(() => document.getElementById("trAuto").click()); await sleep(900); await p.evaluate(() => document.getElementById("trReveal").click());
    await p.waitFor(sections(3), 25000);
  },
  faceread: async p => {
    await p.evaluate(() => document.getElementById("frStartCam").click());
    await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
    await p.evaluate(d => { window.__dets = d; }, [{ x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 }]);
    await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
    await p.evaluate(() => document.getElementById("frRead").click());
    await p.waitFor(`!document.getElementById("frResult").hidden && ` + sections(3), 20000);
  },
};
const PAPER = { A4: { paperWidth: 8.27, paperHeight: 11.69 }, A5: { paperWidth: 5.83, paperHeight: 8.27 }, "80mm": { paperWidth: 3.15, paperHeight: 11.69 } };
// --colour (owner decision 82 ก): the two revised colour samples only
// --photo (owner order 2026-11-17): the annotated photo, synthetic camera only (no image of a person): photo on / off, and 80 mm
const PHOTO_JOBS = [["faceread", "A4", "6-faceread-A4-TH-photo-on.pdf", true], ["faceread", "A4", "7-faceread-A4-TH-photo-off.pdf", false],
  ["palm", "A4", "8-palm-A4-TH-photo-on.pdf", true], ["palm", "A4", "9-palm-A4-TH-photo-off.pdf", false], ["faceread", "80mm", "10-faceread-80mm-receipt-TH.pdf", true]];
const FORTUNE_JOBS = [["horoscope", "A4", "1-horoscope-A4-TH.pdf"], ["horoscope", "80mm", "2-horoscope-80mm-TH.pdf"],
  ["palm", "A4", "3-palm-A4-TH.pdf"], ["palm", "80mm", "4-palm-80mm-TH.pdf"], ["faceread", "A4", "5-faceread-A4-TH.pdf"], ["faceread", "80mm", "6-faceread-80mm-TH.pdf"]];
const JOBS = FORTUNE ? FORTUNE_JOBS : PHOTO ? PHOTO_JOBS : COLOUR ? [["horoscope", "A4", "1-horoscope-A4-TH-colour.pdf"], ["tarot", "A4", "2-tarot-A4-TH-colour.pdf"]] : [
  ["horoscope", "A4", "1-horoscope-A4-TH.pdf"], ["tarot", "A4", "2-tarot-A4-TH.pdf"], ["faceread", "A4", "3-faceread-A4-TH.pdf"],
  ["horoscope", "A5", "4-horoscope-A5-TH.pdf"], ["tarot", "80mm", "5-tarot-80mm-receipt-TH.pdf"],
];

const port = await new Promise((res, rej) => { const s = createServer(); s.unref(); s.on("error", rej); s.listen(0, "127.0.0.1", () => { const { port: p } = s.address(); s.close(() => res(p)); }); });
const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1", "--directory", REPO], { stdio: "ignore" });
const base = `http://127.0.0.1:${port}`;
for (let i = 0; i < 100; i++) { try { if ((await fetch(base + "/index.html")).ok) break; } catch { await sleep(100); } }
mkdirSync(OUT, { recursive: true });
const browser = await launch();
const done = [];
try {
  for (const [p, size, file, photoOn] of JOBS) {
    const cam = p === "faceread" || p === "palm";
    const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`, `window.print = () => { window.__printed = (window.__printed || 0) + 1; };`].concat(cam ? [fakeCams, detScript] : []) });
    try {
      await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
      await page.goto(`${base}/${p}.html${cam ? "?cpu&fakedet&nosw" : "?nosw"}`);
      await page.waitFor(`document.readyState === "complete"`, 10000);
      await sleep(500);
      await READ[p](page);
      await page.waitFor(`!!window.LQShare && [...document.querySelectorAll('[data-lq-sp="print"]')].some(b => b.offsetParent)`, 5000);
      await page.evaluate(() => window.LQShare.printReady());
      if (photoOn != null) await page.evaluate(on => { const c = document.querySelector("[data-lq-sp-photo] input"); if (c && c.checked !== on) c.click(); }, photoOn);
      if (size === "80mm") await page.evaluate(on => window.LQPrint.print(on == null ? { size: "80mm" } : { size: "80mm", photo: on }), photoOn == null ? null : photoOn);
      else await page.evaluate(() => [...document.querySelectorAll('[data-lq-sp="print"]')].find(b => b.offsetParent).click());
      await page.waitFor(`!!document.querySelector("#lqPrint.lqp")`, 5000);
      await page.send("Emulation.setEmulatedMedia", { media: "print" });
      await sleep(300);
      if (size === "80mm") { await page.evaluate(() => window.LQPrint.fitReceipt()); await sleep(100); }
      const pdf = await page.send("Page.printToPDF", Object.assign({ printBackground: true, preferCSSPageSize: true }, PAPER[size]));
      writeFileSync(join(OUT, file), Buffer.from(pdf.data, "base64"));
      done.push(file);
      console.log("wrote", join(OUT, file));
    } finally { await page.close(); }
  }
} finally { await browser.close(); server.kill(); }
console.log(done.length + " sample(s) in " + OUT);
