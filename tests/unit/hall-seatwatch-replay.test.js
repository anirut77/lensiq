// tests/unit/hall-seatwatch-replay.test.js — tools/hall-seatwatch-replay.mjs: replays a CONSENTED recording of a mock-exam
// session through the hall page's own detector call and LQExam.createHallMonitor, so the same session can be scored
// (tools/hall-seatwatch-score.mjs) and re-scored with another detector. Pure parts here: arguments and the "outside the
// repo" rule for the video and the output, the frame plan, walk-mode periods from the label sheet, the event file
// (room-timer seconds `ts`), the shared detector settings. Locked before the tool (evals-locks/gate-hall-h.sha256).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const repo = path.join(__dirname, "..", "..");
const load = () => import(path.join(repo, "tools", "hall-seatwatch-replay.mjs"));
const E = require("../../lensiq-exam.js");

test("detector settings shared with exam-hall.js (one source: LQExam.HALL_DET)", () => {
  const D = E.HALL_DET;
  assert.ok(Object.isFrozen(D));
  assert.deepEqual({ ...D }, { minScore: 0.35, personScore: 0.4, max: 40, detW: 416, coco: Object.freeze({ person: 0, phone: 76 }), yolox: Object.freeze({ person: 0, phone: 67 }) });
  const fs = require("node:fs");
  const page = fs.readFileSync(path.join(repo, "exam-hall.js"), "utf8");
  assert.match(page, /E\.HALL_DET/);
});

test("arguments: video, seats, output outside the repo; fps 2-5 like the page", async () => {
  const { parseArgs } = await load();
  const a = parseArgs(["--video", "/x/s.mp4", "--seats", "/x/seats.json", "--out", "/x/H1-replay.json", "--start-timer", "00:12"]);
  assert.equal(a.fps, 3); assert.equal(a.startTimer, 12); assert.equal(a.detector, "coco"); assert.equal(a.tiles, false);
  assert.throws(() => parseArgs(["--video", path.join(repo, "s.mp4"), "--seats", "/x/s.json", "--out", "/x/o.json"]), /outside the repo/);
  assert.throws(() => parseArgs(["--video", "/x/s.mp4", "--seats", "/x/s.json", "--out", path.join(repo, "o.json")]), /outside the repo/);
  assert.throws(() => parseArgs(["--video", "/x/s.mp4", "--seats", "/x/s.json", "--out", "/x/o.json", "--fps", "9"]), /fps/);
  assert.throws(() => parseArgs(["--seats", "/x/s.json", "--out", "/x/o.json"]), /--video/);
});

test("seat file: the exam-hall seat export (or a plain list) -> clean seats", async () => {
  const { readSeats } = await load();
  const seats = readSeats(JSON.stringify({ format: "lensiq-exam-seats", v: 1, seats: [{ id: "A1", poly: [[0.1, 0.1], [0.2, 0.1], [0.2, 0.2]] }, { id: "bad", poly: [] }] }));
  assert.deepEqual(seats.map(s => s.id), ["A1"]);
  assert.equal(readSeats(JSON.stringify([{ id: "B1", poly: [[0, 0], [1, 0], [1, 1]] }])).length, 1);
  assert.throws(() => readSeats("{}"), /no seats/);
});

test("frame plan and walk-mode periods (STAFF_WALK with walk_mode on, from the label sheet of that block)", async () => {
  const { frameTimes, walkPeriods, walkAt } = await load();
  assert.deepEqual(frameTimes(2, 3), [0, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3]);
  const sheet = ["session_id,block,row,source,planned_time,event_type,seat,target_seat,on_time,actual_start,actual_end,walk_mode,object_on_chair,note,labeller",
    "S1,H1,1,scripted,01:00,STAFF_WALK,STAFF,,Y,,,on,,,a", "S1,H1,2,scripted,03:00,STAFF_WALK,STAFF,,Y,,,off,,,a", "S1,H2,1,scripted,00:10,STAFF_WALK,STAFF,,Y,,,on,,,a"].join("\n");
  const w = walkPeriods(sheet, "H1");
  assert.deepEqual(w, [[60, 90]]);
  assert.equal(walkAt(w, 75), true); assert.equal(walkAt(w, 95), false);
});

test("event file: exam-hall export format, room-timer seconds, the replay settings recorded, no image", async () => {
  const { eventFile } = await load();
  const f = eventFile([{ seat: "A1", sig: "empty", lvl: "info", t: 21000, dur: 20000 }, { seat: "", sig: "room", lvl: "info", t: 30000 }],
    { startTimer: 12, fps: 3, detector: "coco", tiles: false, video: "/x/s.mp4", frames: 100 });
  assert.equal(f.format, "lensiq-exam");
  assert.equal(f.msgs.length, 2);
  assert.equal(f.msgs[0].type, "ev"); assert.equal(f.msgs[0].src, "hall"); assert.equal(f.msgs[0].ts, 33);
  assert.equal(f.msgs[0].dur, 20000);
  assert.deepEqual(f.replay, { fps: 3, detector: "coco", tiles: false, startTimer: 12, frames: 100, video: "s.mp4",
    note: "replayed at a fixed frame rate; the live page runs at a variable 2-5 rounds per second" });
  assert.doesNotMatch(JSON.stringify(f), /data:|base64|blob:/);
});
