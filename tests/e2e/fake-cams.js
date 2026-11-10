/* tests/e2e/fake-cams.js — init script (Page.addScriptToEvaluateOnNewDocument) that fakes N cameras.
 * Config (read lazily on every call, so tests may change it at runtime):
 *   window.__LQ_FAKE_CAMS = {n:3, mode:'ok'|'muteOthers'|'throwOthers'}
 *     ok          every device streams independently
 *     muteOthers  opening a device mutes every OTHER live fake track (track.muted = true + 'mute' event), like a phone
 *                 that can only feed one camera at a time
 *     throwOthers opening a device ends every OTHER live fake track (stop + 'ended' event)
 *   optional: res: {w, h} = the camera's largest mode (default: every device is 640x480 whatever is asked). With res, a
 *     request with width / height "ideal" gets min(ideal, res) like a browser picking the closest mode;
 *     failAbove: N = a request whose ideal width is above N rejects with NotReadableError (a camera / USB link that
 *     cannot start at that size); failAboveIds: [deviceId, ...] = failAbove applies to these devices only.
 *     window.__LQ_FAKE.requests = every video constraint asked for, in order; .opens = [{id, w, h}] every stream given.
 * Each deviceId ('fake-cam-1'..) streams canvas.captureStream(15) from its own 640x480 canvas: a solid device colour
 * (window.__LQ_FAKE.colors[i]) with one white rectangle at the scripted box, so a page can read pixels back.
 * window.__LQ_FAKE = {devices(), boxes(deviceId|slot, now), unplug(deviceId), replug(deviceId), freeze(deviceId, on), live(), colors, requests, opens}
 *   freeze(id, true): the device stops painting its canvas -> captureStream delivers no new frames (a frozen camera /
 *   USB driver: the track stays "live", requestVideoFrameCallback stops firing) — used by the "stalled" health tests
 * window.__LQ_FAKE_DET(key, now) -> [{x,y,w,h,score:0.95}] scripted boxes (key = deviceId or slot 'c1'..'c4').
 * Test-only: nothing here is loaded by production pages.
 */
(function () {
  "use strict";
  if (window.__LQ_FAKE) return;
  const md = navigator.mediaDevices;
  if (!md) return; // insecure context: nothing to fake
  const cfg = () => Object.assign({ n: 3, mode: "ok" }, window.__LQ_FAKE_CAMS || {});
  const COLORS = [[220, 40, 40], [40, 160, 60], [40, 80, 220], [200, 160, 20]];
  const W = 640, H = 480;
  const unplugged = new Set(), frozen = new Set(), requests = [], opens = [];
  const idealOf = (v, k) => (v && typeof v === "object" && v[k] && typeof v[k] === "object" && v[k].ideal > 0 ? v[k].ideal : v && typeof v === "object" && v[k] > 0 ? v[k] : 0);
  /** size delivered for a request: 640x480 unless cfg.res is set, then min(ideal, res) */
  function sizeFor(v) {
    const res = cfg().res;
    if (!res || !(res.w > 0) || !(res.h > 0)) return { w: W, h: H };
    const iw = idealOf(v, "width"), ih = idealOf(v, "height");
    if (!iw || !ih || iw >= res.w) return { w: res.w, h: res.h };
    return { w: iw, h: ih };
  }
  const dev = new Map(); // id -> {canvas, ctx, idx, tracks:Set}
  const ids = () => Array.from({ length: Math.max(0, Math.min(4, cfg().n | 0)) }, (_, i) => "fake-cam-" + (i + 1));
  const idxOf = key => {
    if (typeof key !== "string") return -1;
    let m = /^fake-cam-(\d)$/.exec(key) || /^c(\d)$/.exec(key);
    return m ? +m[1] - 1 : -1;
  };
  function boxes(key, now = performance.now()) {
    const i = idxOf(key); if (i < 0) return [];
    const ph = ((now / 4000) + i * 0.25) % 1;
    return [{ x: 0.1 + 0.5 * ph, y: 0.25, w: 0.2, h: 0.5, score: 0.95 }];
  }
  function getDev(id) {
    let d = dev.get(id);
    if (!d) {
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      d = { canvas, ctx: canvas.getContext("2d"), idx: idxOf(id), tracks: new Set() };
      dev.set(id, d);
    }
    return d;
  }
  function draw() {
    const now = performance.now();
    for (const [id, d] of dev) {
      if (![...d.tracks].some(t => t.readyState === "live") || frozen.has(id)) continue;
      const [r, g, b] = COLORS[d.idx % COLORS.length];
      const cw = d.canvas.width, ch = d.canvas.height;
      d.ctx.fillStyle = `rgb(${r},${g},${b})`; d.ctx.fillRect(0, 0, cw, ch);
      d.ctx.fillStyle = "#fff";
      for (const bx of boxes(id, now)) d.ctx.fillRect(bx.x * cw, bx.y * ch, bx.w * cw, bx.h * ch);
    }
  }
  setInterval(draw, 50);
  const named = (name, msg) => { const e = new Error(msg || name); try { Object.defineProperty(e, "name", { value: name }); } catch { /* ignore */ } return e; };
  // DOMException-like errors (real gUM rejects with DOMException)
  const domErr = (name, msg) => { try { return new DOMException(msg || name, name); } catch { return named(name, msg); } };

  function liveTracks(exceptId) {
    const out = [];
    for (const [id, d] of dev) if (id !== exceptId) for (const t of d.tracks) if (t.readyState === "live") out.push(t);
    return out;
  }
  function endTrack(t) {
    if (t.readyState === "live") { t.stop(); t.dispatchEvent(new Event("ended")); }
  }
  function pickId(v) {
    const avail = ids().filter(id => !unplugged.has(id));
    if (v && typeof v === "object" && v.deviceId != null) {
      const c = v.deviceId;
      const exact = typeof c === "object" && c.exact != null ? [].concat(c.exact) : null;
      const ideal = typeof c === "string" ? [c] : typeof c === "object" && c.ideal != null ? [].concat(c.ideal) : [];
      if (exact) {
        const hit = exact.find(x => avail.includes(x));
        if (!hit) { const e = domErr("OverconstrainedError", "deviceId not found"); try { e.constraint = "deviceId"; } catch { /* ignore */ } throw e; }
        return hit;
      }
      const pref = ideal.find(x => avail.includes(x));
      if (pref) return pref;
    }
    if (!avail.length) throw domErr("NotFoundError", "Requested device not found");
    return avail[0];
  }

  md.enumerateDevices = async function () {
    return ids().filter(id => !unplugged.has(id)).map((id, i) => ({
      deviceId: id, groupId: "fake-group-" + id, kind: "videoinput", label: "Fake Camera " + id.slice(-1), toJSON() { return { deviceId: id, kind: "videoinput" }; }
    }));
  };
  md.getUserMedia = async function (constraints) {
    const v = constraints && constraints.video;
    if (!v) throw domErr("TypeError", "video required");
    requests.push(typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v);
    const id = pickId(v);
    const mode = cfg().mode;
    if (cfg().failAbove > 0 && idealOf(v, "width") > cfg().failAbove && (!Array.isArray(cfg().failAboveIds) || cfg().failAboveIds.includes(id))) {
      throw domErr("NotReadableError", "Could not start video source");
    }
    const d = getDev(id), size = sizeFor(v);
    opens.push({ id, w: size.w, h: size.h });
    if (d.canvas.width !== size.w || d.canvas.height !== size.h) { d.canvas.width = size.w; d.canvas.height = size.h; }
    draw(); // first frame
    const others = liveTracks(id);
    const stream = d.canvas.captureStream(15);
    const tr = stream.getVideoTracks()[0];
    let muted = false;
    Object.defineProperty(tr, "muted", { get: () => muted, configurable: true });
    Object.defineProperty(tr, "label", { get: () => "Fake Camera " + id.slice(-1), configurable: true });
    const gs = tr.getSettings.bind(tr);
    tr.getSettings = () => Object.assign({}, gs(), { deviceId: id, groupId: "fake-group-" + id, width: size.w, height: size.h });
    tr.getCapabilities = () => ({ deviceId: id, width: { min: 1, max: (cfg().res || {}).w || W }, height: { min: 1, max: (cfg().res || {}).h || H } });
    tr.applyConstraints = async () => undefined;
    tr.__fakeMute = on => { if (muted !== on) { muted = on; tr.dispatchEvent(new Event(on ? "mute" : "unmute")); } };
    d.tracks.add(tr);
    // drop dead tracks from the registry
    for (const x of [...d.tracks]) if (x !== tr && x.readyState !== "live") d.tracks.delete(x);
    if (mode === "muteOthers") setTimeout(() => others.forEach(t => t.__fakeMute && t.__fakeMute(true)), 100);
    else if (mode === "throwOthers") setTimeout(() => others.forEach(endTrack), 100);
    return stream;
  };

  window.__LQ_FAKE = {
    colors: COLORS, requests, opens,
    devices: () => ids().filter(id => !unplugged.has(id)),
    boxes,
    live: () => [...dev].filter(([, d]) => [...d.tracks].some(t => t.readyState === "live" && !t.muted)).map(([id]) => id),
    unplug(id) {
      unplugged.add(id);
      const d = dev.get(id);
      if (d) for (const t of d.tracks) endTrack(t);
      md.dispatchEvent(new Event("devicechange"));
    },
    replug(id) { unplugged.delete(id); md.dispatchEvent(new Event("devicechange")); },
    freeze(id, on = true) { if (on) frozen.add(id); else frozen.delete(id); }
  };
  window.__LQ_FAKE_DET = (key, now) => boxes(key, now);
})();
