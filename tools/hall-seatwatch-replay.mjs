#!/usr/bin/env node
// tools/hall-seatwatch-replay.mjs — replays a CONSENTED recording of a mock-exam seat-watch session (consent form option B,
// every person in the room; docs/pilot/PILOT-HALL-SEATWATCH.md §11) through the hall page's own detector call
// (LQExam.HALL_DET, COCO-SSD default or YOLOX-Nano, optional 2 x 2 tiles) and LQExam.createHallMonitor, in headless Chrome on
// this machine. Output: an event file in the exam-hall export format with room-timer seconds (`ts`), scored by
// tools/hall-seatwatch-score.mjs like a live log. Lets the same session be scored with another detector (A/B on the SAME
// events) without a second laptop.
//
//   node tools/hall-seatwatch-replay.mjs --video REC.mp4 --seats seats.json --out H1-replay.json
//        [--start-timer mm:ss] [--fps 3] [--detector coco|yolox] [--tiles] [--labels labels.csv --block H1] [--min-leave 30]
//
//   --start-timer  the room timer at the first frame of the video (read it off the timer in the picture; default 00:00)
//   --labels/--block  walk mode is ON during that block's STAFF_WALK rows with walk_mode "on" (as the operator pressed it live)
// Privacy: frames are extracted with ffmpeg into a temporary folder that is deleted at the end; the video, the frames and the
// output stay outside the repo; nothing leaves the machine. Limit: frames at a fixed rate, the live page runs at 2–5 a second.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseClock, parseLabelSheet } from "./hall-seatwatch-score.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const E = createRequire(import.meta.url)(join(repo, "lensiq-exam.js"));
const inRepo = p => { const r = relative(repo, resolve(p)); return r === "" || (!r.startsWith("..") && !isAbsolute(r)); };

export function parseArgs(argv) {
  const a = { video: null, seats: null, out: null, startTimer: 0, fps: 3, detector: "coco", tiles: false, labels: null, block: null, minLeave: 30 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = () => argv[++i];
    if (k === "--video") a.video = v(); else if (k === "--seats") a.seats = v(); else if (k === "--out") a.out = v();
    else if (k === "--start-timer") a.startTimer = parseClock(v()); else if (k === "--fps") a.fps = Number(v());
    else if (k === "--detector") a.detector = v(); else if (k === "--tiles") a.tiles = true;
    else if (k === "--labels") a.labels = v(); else if (k === "--block") a.block = v(); else if (k === "--min-leave") a.minLeave = Number(v());
    else throw new Error(`unknown argument ${k}`);
  }
  for (const k of ["video", "seats", "out"]) if (!a[k]) throw new Error(`--${k} is required`);
  if (inRepo(a.video) || inRepo(a.out)) throw new Error("the video and the output must be outside the repo (recordings of people never go into git)");
  if (!(a.fps >= 2 && a.fps <= 5)) throw new Error("--fps must be 2–5 (the page's range)");
  if (!["coco", "yolox"].includes(a.detector)) throw new Error("--detector coco|yolox");
  if (!!a.labels !== !!a.block) throw new Error("--labels and --block go together");
  return a;
}
export function readSeats(text) {
  const j = JSON.parse(text), list = Array.isArray(j) ? j : j && Array.isArray(j.seats) ? j.seats : [];
  const seats = E.cleanSeats(list);
  if (!seats.length) throw new Error("no seats in the seat file (export them on exam-hall.html: “export seat layout”)");
  return seats;
}
export const frameTimes = (durSec, fps) => Array.from({ length: Math.floor(durSec * fps + 1e-9) }, (_, i) => i / fps);
export function walkPeriods(sheetText, block) {
  return parseLabelSheet(sheetText).events.filter(e => e.block === block && e.type === "STAFF_WALK" && e.walk === "on").map(e => [e.start, e.end]);
}
export const walkAt = (periods, s) => periods.some(([a, b]) => s >= a && s <= b);
/** monitor events (t = ms of video time) -> exam-hall export with room-timer seconds */
export function eventFile(evs, o) {
  const msgs = evs.map((e, i) => {
    const m = { v: 1, type: "ev", room: "REPLAY", node: "replayreplay", src: "hall", seat: e.seat || "", sig: e.sig, lvl: e.lvl, t: Math.round(e.t),
      ts: Math.round((o.startTimer + e.t / 1000) * 1000) / 1000, id: "r" + (i + 1).toString(36) };
    for (const k of ["dur", "n"]) if (Number.isFinite(e[k])) m[k] = e[k];
    return m;
  });
  return { format: "lensiq-exam", v: 1, msgs, replay: { fps: o.fps, detector: o.detector, tiles: !!o.tiles, startTimer: o.startTimer, frames: o.frames,
    video: basename(o.video || ""), note: "replayed at a fixed frame rate; the live page runs at a variable 2-5 rounds per second" } };
}

async function main(argv) {
  let a;
  try { a = parseArgs(argv); } catch (e) { console.error("hall-seatwatch-replay:", e.message); return 2; }
  const seats = readSeats(readFileSync(a.seats, "utf8"));
  const walk = a.labels ? walkPeriods(readFileSync(a.labels, "utf8"), a.block) : [];
  const tmp = mkdtempSync(join(tmpdir(), "lq-sw-frames-"));
  try {
    const ff = spawnSync("ffmpeg", ["-v", "error", "-i", a.video, "-an", "-vf", `fps=${a.fps},scale='min(1280,iw)':-2`, "-q:v", "3", join(tmp, "f%06d.jpg")], { stdio: "inherit" });
    if (ff.status !== 0) throw new Error("ffmpeg could not read the video (install ffmpeg: brew install ffmpeg)");
    const frames = readdirSync(tmp).filter(f => f.endsWith(".jpg")).sort();
    const { serve } = await import(pathToFileURL(join(repo, "tools/static-server.mjs")).href);
    const { launch } = await import(pathToFileURL(join(repo, "tests/e2e/cdp.mjs")).href);
    const srv = await serve(repo, { mounts: { "/__frames": tmp } });
    const browser = await launch();
    try {
      const page = await browser.newPage(null, {});
      await page.goto(`${srv.base}/exam-hall.html?cpu`);
      await page.waitFor("!!(window.LQExam && window.LQDetect)", 15000);
      const evs = await page.evaluate(async (o) => {
        const X = window.LQExam, D = X.HALL_DET, LD = window.LQDetect, c = D[o.detector];
        let model;
        if (o.detector === "yolox") { await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "vendor/ort/ort.wasm.min.js"; s.onload = res; s.onerror = rej; document.head.append(s); }); model = await LD.loadYolox(); }
        else { await LD.tfBackend(); model = await LD.loadCoco("vendor/models/cocossd/model.json"); }
        const mon = X.createHallMonitor(o.seats, { minLeaveMin: o.minLeave }), out = [], tiles = o.tiles ? { cols: 2, rows: 2, overlap: 0.2 } : null;
        for (let i = 0; i < o.frames.length; i++) {
          const img = new Image(); img.src = "/__frames/" + o.frames[i]; await img.decode();
          const d = o.detector === "yolox"
            ? await LD.detectPeople(model, img, { classes: [c.person, c.phone], minScore: D.minScore, max: D.max, detW: D.detW, split: "auto", tiles })
            : await LD.detectCoco(model, img, { classes: [c.person, c.phone], minScore: D.minScore, max: D.max, tiles });
          const t = (i / o.fps) * 1000, s = o.startTimer + t / 1000;
          const walk = o.walk.some(([x, y]) => s >= x && s <= y);
          for (const ev of mon.frame(t, { persons: d.filter(b => b.cls === c.person && b.score >= D.personScore), phones: d.filter(b => b.cls === c.phone) },
            { walk, elapsedMin: s / 60 })) out.push(ev);
        }
        return out;
      }, { seats, frames, fps: a.fps, detector: a.detector, tiles: a.tiles, walk, startTimer: a.startTimer, minLeave: a.minLeave });
      writeFileSync(a.out, JSON.stringify(eventFile(evs, { ...a, frames: frames.length }), null, 1));
      console.log(`hall-seatwatch-replay: ${frames.length} frames, ${evs.length} events -> ${a.out}`);
    } finally { await browser.close(); await srv.close(); }
    return 0;
  } catch (e) { console.error("hall-seatwatch-replay:", e && e.message || e); return 2; }
  finally { rmSync(tmp, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = await main(process.argv.slice(2));
