/* lensiq-camera.js — LQCam: one camera factory (the primitive), a multi-camera hub on top of it, and one inference scheduler.
 * Browser: window.LQCam · Node: module.exports (pure helpers + createScheduler; DOM parts are guarded by typeof document).
 * Privacy: nothing here stores or sends images. Persisted keys hold only device ids/labels, names, roles and numbers.
 *
 * PURE HELPERS (Node-testable)
 *   fallbackChain({deviceId, facing, ideal:{width,height}, frameRate}) -> constraint objects (video part of getUserMedia)
 *     [ {deviceId:{exact}, ...ideal}, {facingMode:{ideal:facing}, ...ideal}, {...ideal}, true ]
 *     no deviceId -> no step 1 · no facing -> no step 2 · no ideal/frameRate -> no step 3 (it would equal `true`).
 *     ideal/frameRate are expanded to {width:{ideal}, height:{ideal}, frameRate:{ideal}}.
 *   errorKind(err) -> 'denied'|'insecure'|'busy'|'notfound'|'overconstrained'|'unknown'
 *   errorText(err) -> Thai message (also handles CapacityError / DuplicateCamera / NoFreeCamera / Ended)
 *   parseCams(json|object) -> {v:1, cams:[{slot, deviceId, label, name, role}]}   tolerant: garbage -> {v:1, cams:[]}
 *   serializeCams(state|cams[]) -> string
 *   nextSlot(cams) -> 'c1'..'c4' | null
 *   pickNext(entries:[{key, enabled, vt, weight}]) -> key|null    min virtual time among enabled; ties by key
 *   mapSeatToImage(seatSide, cameraFacesOccupants=true) -> 'imageLeft'|'imageRight'|'largest'   ('right', true) -> 'imageLeft'
 *   readCapacity(storage, now) / writeCapacity(storage, maxLive, now) -> "lq-camcap" = {v:1, maxLive, at} (decrease-only; expires after 7 days)
 *
 * DOM
 *   listCameras() -> Promise<[{deviceId, groupId, label, facing:'user'|'environment'|null}]>
 *     labels/ids may be empty before permission: start() a camera first, then list again.
 *   create(video, opts) -> Cam
 *     opts = {facing='user', ideal=null, frameRate?, mirror='auto' (auto = facing==='user'), torch=false, persistKey=null,
 *             autoPause=true, strictDevice=false, onChange?(cam, ev), onError?(cam, err)}
 *     strictDevice: when a deviceId is requested only that device is tried (ideal, then 640x480@15) — used by the hub so a
 *       missing device is never silently replaced by another (duplicate) camera.
 *     ev.type in 'started'|'stopped'|'paused'|'resumed'|'devices'|'ended'|'muted'|'unmuted'|'error'
 *     Cam = {video, start(deviceId?) -> Promise<MediaStream>, stop(), pause(), resume(), flip(), setTorch(on) -> Promise<boolean>,
 *            attach(container) (flip button + <select>, hidden when <2 devices), refreshDevices(), destroy(),
 *            get active, paused, deviceId, label, facing, mirrored, torchSupported, stream, devices; lastError}
 *     Rules: start() stops the previous stream first; walks fallbackChain on overconstrained/notfound/busy (busy only on a
 *       deviceId step); denied/insecure abort at once. persistKey stores {deviceId,label} (old plain-string ids are read too);
 *       a stored deviceId that no longer exists is re-matched by label. Track 'ended'/'mute' surface as events.
 *       autoPause: visibilitychange/pagehide pause, visible/pageshow resume — only if it was active.
 *       The video element gets muted + playsinline. Mirroring is NOT applied to the element: pages read cam.mirrored.
 *   createHub({ns, max=4, grid, tile?(cam)->HTMLElement, facing='environment', idealOne={1280x720}, idealMany={640x480},
 *              frameRateMany=15, probeMs=800, onChange?(hub, ev)}) -> Hub
 *     Hub = {cams, capacity, add({deviceId?, name?, role?}) -> Promise<HubCam>, remove(slot), restore() -> Promise<HubCam[]>,
 *            cam(slot), rename(slot,name), setRole(slot,role), startAll(), stopAll(), save(), resetCapacity(), destroy()}
 *     HubCam = Cam & {slot, name, role, tile, overlay:<canvas>, status:'idle'|'starting'|'live'|'paused'|'error', settings,
 *                     saveSettings(), lastInferAt, inferMsEma, intervalMsEma, frames, noteInfer(t0, ms)}
 *     Keys: `${ns}-cams` = serializeCams · `${ns}-cam-${slot}` = page settings JSON · 'lq-camcap' = {v:1,maxLive,at} (global).
 *     add(): duplicate deviceId -> Error 'DuplicateCamera'; no unused device -> Error 'NoFreeCamera'; at max or at a known
 *       capacity -> Error 'CapacityError' (.max). Capacity is PROVEN only when an EARLIER live track ends or mutes within
 *       probeMs of opening the new one: the new stream is stopped, earlier cameras are restarted explicitly, lq-camcap is
 *       lowered and 'CapacityError' (.max) is thrown. NotReadable on the new device is a device error (capacity untouched).
 *       With >= 2 cams every cam is re-applied with idealMany@frameRateMany (applyConstraints, restart on failure).
 *   createScheduler({targetHz=10, maxBusy=0.7}) -> {add(key, fn, {weight=1, cam?}), remove, setEnabled, start, stop,
 *              setTargetHz, stats() -> {[key]:{hz, ms, n, err}}}
 *     One setTimeout loop, one busy flag. next delay = max(1000/targetHz - elapsed, elapsed*(1/maxBusy-1)).
 *     Virtual time is turn-based: vt[key] += 1/weight per run, so equal weights get equal turns (per-camera Hz stays
 *     equal even when one camera's frames cost more); weight 2 gets twice the turns. With opts.cam the scheduler
 *     calls cam.noteInfer(t0, ms) to keep lastInferAt / inferMsEma / intervalMsEma / frames current.
 */
(function (root) {
  "use strict";
  const hasDOM = typeof document !== "undefined";
  const SLOTS = ["c1", "c2", "c3", "c4"];
  const CAP_KEY = "lq-camcap";
  const BACK = /back|rear|environment|world|หลัง/i, FRONT = /front|user|facetime|face|หน้า/i;

  // ================= pure helpers =================
  function idealC(ideal, frameRate) {
    const c = {};
    if (ideal && ideal.width) c.width = { ideal: ideal.width };
    if (ideal && ideal.height) c.height = { ideal: ideal.height };
    if (frameRate) c.frameRate = { ideal: frameRate };
    return c;
  }
  function fallbackChain({ deviceId, facing, ideal, frameRate } = {}) {
    const base = idealC(ideal, frameRate), steps = [];
    if (deviceId) steps.push({ deviceId: { exact: deviceId }, ...base });
    if (facing) steps.push({ facingMode: { ideal: facing }, ...base });
    if (Object.keys(base).length) steps.push({ ...base });
    steps.push(true);
    return steps;
  }
  function errorKind(err) {
    const n = (err && err.name) || "";
    if (/^(NotAllowedError|PermissionDeniedError|SecurityError)$/.test(n)) return "denied";
    if (n === "Insecure") return "insecure";
    if (/^(NotReadableError|TrackStartError|AbortError)$/.test(n)) return "busy";
    if (/^(NotFoundError|DevicesNotFoundError)$/.test(n)) return "notfound";
    if (/^(OverconstrainedError|ConstraintNotSatisfiedError)$/.test(n)) return "overconstrained";
    return "unknown";
  }
  function errorText(err) {
    const n = (err && err.name) || "";
    if (n === "CapacityError") return `อุปกรณ์นี้เปิดกล้องพร้อมกันได้สูงสุด ${err.max || 1} ตัว — มือถือส่วนใหญ่เปิดได้ทีละกล้อง ใช้ 1 เครื่องต่อ 1 จุด`;
    if (n === "DuplicateCamera") return "กล้องนี้ถูกเพิ่มไว้แล้ว";
    if (n === "NoFreeCamera") return "ไม่มีกล้องว่างให้เพิ่ม — ทุกกล้องที่พบถูกใช้งานอยู่แล้ว";
    if (n === "Ended") return "กล้องหลุดการเชื่อมต่อหรือถูกปิด";
    return {
      denied: "ไม่ได้รับอนุญาตให้ใช้กล้อง กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์",
      insecure: "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด",
      busy: "กล้องนี้ถูกใช้งานอยู่ หรือแบนด์วิธ USB ไม่พอ",
      notfound: "ไม่พบกล้องในเครื่องนี้",
      overconstrained: "กล้องไม่รองรับความละเอียดที่ขอ",
      unknown: "เปิดกล้องไม่สำเร็จ"
    }[errorKind(err)];
  }
  const str = (v, max = 200) => (typeof v === "string" ? v.slice(0, max) : "");
  function parseCams(json) {
    let o = json;
    if (typeof json === "string") { try { o = JSON.parse(json); } catch { o = null; } }
    const out = { v: 1, cams: [] };
    const list = Array.isArray(o) ? o : o && typeof o === "object" && Array.isArray(o.cams) ? o.cams : [];
    const used = new Set();
    for (const c of list) {
      if (!c || typeof c !== "object" || !SLOTS.includes(c.slot) || used.has(c.slot)) continue;
      used.add(c.slot);
      out.cams.push({ slot: c.slot, deviceId: str(c.deviceId, 512), label: str(c.label), name: str(c.name, 60), role: str(c.role, 20) || "both" });
    }
    out.cams.sort((a, b) => a.slot.localeCompare(b.slot));
    return out;
  }
  function serializeCams(state) {
    const cams = Array.isArray(state) ? state : (state && state.cams) || [];
    return JSON.stringify(parseCams({ v: 1, cams: cams.map(c => ({ slot: c.slot, deviceId: c.deviceId, label: c.label, name: c.name, role: c.role })) }));
  }
  function nextSlot(cams) {
    const used = new Set((cams || []).map(c => c && c.slot));
    return SLOTS.find(s => !used.has(s)) || null;
  }
  function pickNext(entries) {
    let best = null;
    for (const e of entries || []) {
      if (!e || e.enabled === false) continue;
      if (!best || e.vt < best.vt || (e.vt === best.vt && String(e.key) < String(best.key))) best = e;
    }
    return best ? best.key : null;
  }
  function mapSeatToImage(seatSide, cameraFacesOccupants = true) {
    if (seatSide !== "right" && seatSide !== "left") return "largest";
    const left = seatSide === "right";
    return (cameraFacesOccupants ? left : !left) ? "imageLeft" : "imageRight";
  }
  // a proven limit expires after CAP_TTL_MS (new camera plugged in, browser update...) and is then probed again
  const CAP_TTL_MS = 7 * 864e5;
  function readCapacity(storage, now = Date.now()) {
    try {
      const o = JSON.parse(storage.getItem(CAP_KEY));
      if (!(o && o.v === 1 && Number.isInteger(o.maxLive) && o.maxLive >= 1)) return null;
      if (Number.isFinite(o.at) && now - o.at > CAP_TTL_MS) return null;
      return o.maxLive;
    } catch { return null; }
  }
  function writeCapacity(storage, maxLive, now = Date.now()) {
    const cur = readCapacity(storage, now);
    const v = Math.max(1, cur == null ? maxLive : Math.min(cur, maxLive));
    try { storage.setItem(CAP_KEY, JSON.stringify({ v: 1, maxLive: v, at: now })); } catch { /* storage full */ }
    return v;
  }

  // ================= scheduler (no DOM needed) =================
  function createScheduler({ targetHz = 10, maxBusy = 0.7 } = {}) {
    const E = new Map(); // key -> {key, fn, weight, enabled, vt, n, err, ms, times:[], cam}
    let timer = null, running = false, busy = false, hz = targetHz;
    const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
    const minVt = () => { let m = Infinity; for (const e of E.values()) if (e.enabled && e.vt < m) m = e.vt; return m === Infinity ? 0 : m; };
    function schedule(d) { if (running) { clearTimeout(timer); timer = setTimeout(tick, Math.max(0, d)); } }
    async function tick() {
      timer = null;
      if (!running || busy) return;
      const key = pickNext([...E.values()]);
      if (key == null) return schedule(1000 / hz);
      const e = E.get(key);
      busy = true;
      const t0 = now();
      try { await e.fn(); } catch (err) { e.err++; console.warn("scheduler", key, err); }
      const elapsed = now() - t0;
      busy = false;
      e.vt += 1 / (e.weight > 0 ? e.weight : 1);
      e.n++; e.ms = e.n === 1 ? elapsed : e.ms * 0.8 + elapsed * 0.2;
      const t1 = now(); e.times.push(t1); while (e.times.length && t1 - e.times[0] > 2000) e.times.shift();
      if (e.cam && typeof e.cam.noteInfer === "function") { try { e.cam.noteInfer(t0, elapsed); } catch { /* ignore */ } }
      schedule(Math.max(1000 / hz - elapsed, elapsed * (1 / maxBusy - 1)));
    }
    return {
      add(key, fn, { weight = 1, cam = null } = {}) {
        const prev = E.get(key);
        E.set(key, { key, fn, weight, enabled: prev ? prev.enabled : true, vt: prev ? prev.vt : minVt(), n: prev ? prev.n : 0, err: prev ? prev.err : 0, ms: prev ? prev.ms : 0, times: prev ? prev.times : [], cam });
        if (running && !timer && !busy) schedule(0);
      },
      remove(key) { E.delete(key); },
      setEnabled(key, on) {
        const e = E.get(key); if (!e) return;
        if (on && !e.enabled) { e.enabled = true; e.vt = Math.max(e.vt, minVt()); }
        else if (!on) e.enabled = false;
      },
      start() { if (running) return; running = true; schedule(0); },
      stop() { running = false; clearTimeout(timer); timer = null; },
      setTargetHz(h) { if (h > 0) hz = h; },
      get running() { return running; },
      stats() {
        const o = {}, t = now();
        for (const e of E.values()) {
          const ts = e.times.filter(x => t - x <= 2000);
          const span = ts.length > 1 ? (ts[ts.length - 1] - ts[0]) / 1000 : 0;
          o[e.key] = { hz: span > 0 ? Math.round(((ts.length - 1) / span) * 10) / 10 : 0, ms: Math.round(e.ms * 10) / 10, n: e.n, err: e.err };
        }
        return o;
      }
    };
  }

  // ================= DOM: single camera =================
  const facingOf = (label, fallback = null) => (BACK.test(label || "") ? "environment" : FRONT.test(label || "") ? "user" : fallback);
  async function listCameras() {
    if (!hasDOM || !navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return [];
    let all = [];
    try { all = await navigator.mediaDevices.enumerateDevices(); } catch { return []; }
    return all.filter(d => d.kind === "videoinput").map(d => ({ deviceId: d.deviceId, groupId: d.groupId, label: d.label, facing: facingOf(d.label) }));
  }
  const named = (name, msg, extra) => Object.assign(new Error(msg || name), { name }, extra || {});
  const lsGet = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } };
  const lsDel = k => { try { localStorage.removeItem(k); } catch { /* ignore */ } };
  function readPersist(key) {
    const raw = lsGet(key); if (!raw) return null;
    let v; try { v = JSON.parse(raw); } catch { v = raw; }
    if (typeof v === "string") return v ? { deviceId: v, label: "" } : null;
    if (v && typeof v === "object" && typeof v.deviceId === "string") return { deviceId: v.deviceId, label: str(v.label) };
    return null;
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function create(video, o = {}) {
    const opt = { facing: "user", ideal: null, frameRate: undefined, mirror: "auto", torch: false, persistKey: null, autoPause: true, strictDevice: false, ...o };
    let stream = null, deviceId = "", label = "", facing = opt.facing, devices = [], paused = false, autoResume = false;
    let torchSupported = false, torchOn = false, destroyed = false, gen = 0;
    const uis = [], offs = [];
    const emit = (type, extra) => { try { opt.onChange && opt.onChange(api, { type, ...(extra || {}) }); } catch (e) { console.error(e); } };
    const fail = err => { api.lastError = err; emit("error", { error: err }); try { opt.onError && opt.onError(api, err); } catch (e) { console.error(e); } };
    const on = (t, ev, fn, o2) => { t.addEventListener(ev, fn, o2); offs.push(() => t.removeEventListener(ev, fn, o2)); };

    function halt() {
      gen++;
      if (stream) stream.getTracks().forEach(t => t.stop());
      stream = null;
      if (video && video.srcObject) video.srcObject = null;
    }
    function chainFor(id, face) {
      const want = { deviceId: id, facing: face, ideal: opt.ideal, frameRate: opt.frameRate };
      if (id && opt.strictDevice) return [{ deviceId: { exact: id }, ...idealC(opt.ideal, opt.frameRate) }, { deviceId: { exact: id }, ...idealC({ width: 640, height: 480 }, 15) }];
      return fallbackChain(want);
    }
    async function open(id, face) {
      const steps = chainFor(id, face);
      let last = null;
      for (const v of steps) {
        try { return await navigator.mediaDevices.getUserMedia({ video: v, audio: false }); }
        catch (e) {
          last = e;
          const k = errorKind(e), devStep = v && typeof v === "object" && v.deviceId;
          if (k === "denied" || k === "insecure") throw e;
          if (k === "overconstrained" || k === "notfound") continue;
          if (k === "busy" && devStep) continue;
          throw e;
        }
      }
      throw last || named("NotFoundError");
    }
    async function resolveStored() {
      const p = opt.persistKey ? readPersist(opt.persistKey) : null;
      if (!p) return "";
      const list = await listCameras();
      if (!list.length || list.every(d => !d.deviceId)) return p.deviceId;
      if (list.some(d => d.deviceId === p.deviceId)) return p.deviceId;
      const m = p.label && list.find(d => d.label === p.label);
      return m ? m.deviceId : "";
    }
    async function start(id, { face } = {}) {
      if (destroyed) throw named("InvalidStateError", "camera destroyed");
      if (!hasDOM || !root.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        const e = named("Insecure", "insecure context"); api.lastError = e; throw e;
      }
      halt();
      const my = gen;
      paused = false;
      const want = id || (face ? "" : await resolveStored());
      let s;
      try { s = await open(want, face || facing || opt.facing); }
      catch (e) { api.lastError = e; emit("error", { error: e }); throw e; }
      if (my !== gen || destroyed) { s.getTracks().forEach(t => t.stop()); throw named("AbortError", "superseded"); }
      stream = s; api.lastError = null;
      const tr = s.getVideoTracks()[0];
      const st = (tr && tr.getSettings && tr.getSettings()) || {};
      deviceId = st.deviceId || want || "";
      label = (tr && tr.label) || "";
      facing = st.facingMode || facingOf(label) || face || (id ? opt.facing : facing || opt.facing);
      if (tr) {
        const onEnd = () => { if (stream === s) { stream = null; const e = named("Ended", "track ended"); api.lastError = e; emit("ended", { error: e }); } };
        tr.addEventListener("ended", onEnd);
        tr.addEventListener("mute", () => { if (stream === s) emit("muted"); });
        tr.addEventListener("unmute", () => { if (stream === s) emit("unmuted"); });
      }
      try {
        const caps = tr && tr.getCapabilities ? tr.getCapabilities() : {};
        torchSupported = !!(caps && caps.torch);
      } catch { torchSupported = false; }
      video.muted = true; video.playsInline = true; video.autoplay = true;
      video.setAttribute("playsinline", ""); video.setAttribute("muted", "");
      video.srcObject = s;
      try { await video.play(); } catch (e) { if (e.name !== "AbortError") throw e; }
      if (!video.videoWidth) await new Promise(r => { const t = setTimeout(r, 4000); video.addEventListener("loadedmetadata", () => { clearTimeout(t); r(); }, { once: true }); });
      if (my !== gen) throw named("AbortError", "superseded");
      if (opt.persistKey && deviceId) lsSet(opt.persistKey, JSON.stringify({ deviceId, label }));
      if (opt.torch && torchSupported) { torchOn = false; await setTorch(true); }
      emit("started", { deviceId, label });
      refreshDevices();
      return s;
    }
    async function setTorch(onOff) {
      const tr = stream && stream.getVideoTracks()[0];
      if (!tr || !torchSupported) return false;
      try { await tr.applyConstraints({ advanced: [{ torch: !!onOff }] }); torchOn = !!onOff; return true; } catch { return false; }
    }
    async function refreshDevices() {
      devices = await listCameras();
      for (const ui of uis) {
        ui.hidden = devices.length < 2;
        const [flip, sel] = ui.children;
        flip.textContent = facing === "environment" ? "ใช้กล้องหน้า" : "ใช้กล้องหลัง";
        sel.innerHTML = devices.map((d, i) => `<option value="${esc(d.deviceId)}">${esc((d.label || "กล้อง " + (i + 1)).replace(/[<&]/g, ""))}</option>`).join("");
        if (deviceId) sel.value = deviceId;
      }
      emit("devices", { devices });
      return devices;
    }
    async function flip() {
      const target = facing === "environment" ? "user" : "environment";
      if (!devices.length) await refreshDevices();
      const byLabel = devices.find(d => d.facing === target && d.deviceId && d.deviceId !== deviceId);
      const before = deviceId;
      if (byLabel) return start(byLabel.deviceId);
      const s = await start("", { face: target });
      if (deviceId === before && devices.length > 1) {
        const i = devices.findIndex(d => d.deviceId === deviceId);
        const nx = devices[(i + 1) % devices.length];
        if (nx && nx.deviceId && nx.deviceId !== before) return start(nx.deviceId);
      }
      return s;
    }
    function pause() {
      if (!stream) return;
      halt(); paused = true; emit("paused");
    }
    async function resume() {
      if (!paused) return stream;
      paused = false;
      const s = await start(deviceId || "");
      emit("resumed");
      return s;
    }
    function stop() { autoResume = false; const was = !!stream || paused; halt(); paused = false; if (was) emit("stopped"); }

    if (hasDOM && opt.autoPause) {
      on(document, "visibilitychange", () => {
        if (document.hidden) { if (stream) { autoResume = true; pause(); } }
        else if (autoResume) { autoResume = false; resume().catch(fail); }
      });
      on(root, "pagehide", () => { if (stream) { autoResume = true; pause(); } });
      on(root, "pageshow", e => { if (e.persisted && autoResume && !document.hidden) { autoResume = false; resume().catch(fail); } });
    }
    if (hasDOM && navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
      on(navigator.mediaDevices, "devicechange", () => { refreshDevices(); });
    }

    const api = {
      video, start: id => start(id), stop, pause, resume, flip, setTorch, refreshDevices,
      attach(el) {
        uis.push(el); el.hidden = true;
        el.innerHTML = `<button class="btn ghost" type="button">ใช้กล้องหลัง</button><select aria-label="เลือกกล้อง"></select>`;
        el.children[0].onclick = () => flip().catch(fail);
        el.children[1].onchange = e => start(e.target.value).catch(fail);
        refreshDevices();
      },
      destroy() {
        stop(); destroyed = true;
        offs.splice(0).forEach(f => f());
        uis.splice(0).forEach(el => { el.innerHTML = ""; el.hidden = true; });
      },
      get active() { return !!stream && stream.active && stream.getVideoTracks().some(t => t.readyState === "live"); },
      get paused() { return paused; },
      get deviceId() { return deviceId; },
      get label() { return label; },
      get facing() { return facing; },
      get mirrored() { return opt.mirror === "auto" ? facing === "user" : !!opt.mirror; },
      get torchSupported() { return torchSupported; },
      get torch() { return torchOn; },
      get stream() { return stream; },
      get devices() { return devices; },
      lastError: null
    };
    return api;
  }

  // ================= DOM: hub (1..max cameras) =================
  function createHub(o = {}) {
    const opt = { ns: "lq", max: 4, grid: null, tile: null, facing: "environment", idealOne: { width: 1280, height: 720 }, idealMany: { width: 640, height: 480 }, frameRateMany: 15, probeMs: 800, onChange: null, ...o };
    const K = { cams: `${opt.ns}-cams`, set: slot => `${opt.ns}-cam-${slot}` };
    const cams = [];
    const LS = (() => { try { return hasDOM ? localStorage : null; } catch { return null; } })(); // Safari: blocked storage throws on access
    let capacity = LS ? readCapacity(LS) : null, destroyed = false;
    const emit = (type, extra) => { try { opt.onChange && opt.onChange(hub, { type, ...(extra || {}) }); } catch (e) { console.error(e); } };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const liveTrack = c => c.stream && c.stream.getVideoTracks()[0];

    function setStatus(c, s, extra) {
      if (c.status === s && !extra) return;
      c.status = s;
      if (c.tile) c.tile.dataset.status = s;
      emit("status", { slot: c.slot, status: s, ...(extra || {}) });
    }
    function buildTile(c) {
      let tile = opt.tile ? opt.tile(c) : null;
      if (!tile) {
        tile = document.createElement("div");
        tile.className = "lq-tile";
        tile.style.position = "relative";
      }
      if (!tile.contains(c.video)) tile.appendChild(c.video);
      if (!tile.contains(c.overlay)) tile.appendChild(c.overlay);
      tile.dataset.slot = c.slot;
      if (opt.grid && !opt.grid.contains(tile)) opt.grid.appendChild(tile);
      return tile;
    }
    function makeCam(slot, { name, role, deviceId, label } = {}) {
      const video = document.createElement("video");
      video.muted = true; video.playsInline = true; video.autoplay = true;
      video.setAttribute("playsinline", ""); video.setAttribute("muted", "");
      video.className = "lq-video";
      const overlay = document.createElement("canvas");
      overlay.className = "lq-overlay";
      const many = cams.length >= 1;
      let c;
      const cam = create(video, {
        facing: opt.facing, mirror: false, strictDevice: true, autoPause: true,
        ideal: many ? opt.idealMany : opt.idealOne, frameRate: many ? opt.frameRateMany : undefined,
        onChange(_, ev) {
          if (!c) return;
          if (ev.type === "started") { setStatus(c, "live"); save(); }
          else if (ev.type === "paused") setStatus(c, "paused");
          else if (ev.type === "stopped") setStatus(c, "idle");
          else if (ev.type === "ended") { if (!c._probing) setStatus(c, "error", { error: ev.error }); }
          else if (ev.type === "muted") { /* reported, status unchanged unless probing proves capacity */ }
          emit(ev.type, { slot: c.slot, ...ev });
        }
      });
      c = cam;
      let settings = {};
      try { const v = JSON.parse(lsGet(K.set(slot))); if (v && typeof v === "object") settings = v; } catch { /* ignore */ }
      Object.assign(c, {
        slot, name: name || `กล้อง ${slot.slice(1)}`, role: role || "both", wantDeviceId: deviceId || "", savedLabel: label || "",
        overlay, status: "idle", settings, lastInferAt: 0, inferMsEma: 0, intervalMsEma: 0, frames: 0, tile: null, _probing: false,
        saveSettings() { lsSet(K.set(slot), JSON.stringify(c.settings || {})); },
        noteInfer(t0, ms) {
          if (c.lastInferAt) { const iv = t0 - c.lastInferAt; c.intervalMsEma = c.intervalMsEma ? c.intervalMsEma * 0.8 + iv * 0.2 : iv; }
          c.lastInferAt = t0; c.frames++;
          c.inferMsEma = c.inferMsEma ? c.inferMsEma * 0.8 + ms * 0.2 : ms;
        }
      });
      c.tile = buildTile(c);
      c.tile.dataset.status = "idle";
      return c;
    }
    function save() {
      lsSet(K.cams, serializeCams(cams.map(c => ({ slot: c.slot, deviceId: c.deviceId || c.wantDeviceId, label: c.label || c.savedLabel, name: c.name, role: c.role }))));
    }
    async function applyMany() {
      const many = cams.filter(c => c.stream).length >= 2;
      const ideal = many ? opt.idealMany : opt.idealOne;
      const cons = idealC(ideal, many ? opt.frameRateMany : undefined);
      for (const c of cams) {
        const tr = liveTrack(c);
        if (!tr) continue;
        try { await tr.applyConstraints(cons); }
        catch { try { await c.start(c.deviceId); } catch (e) { setStatus(c, "error", { error: e }); } }
      }
    }
    async function freeDevice() {
      const list = await listCameras();
      const used = new Set(cams.map(c => c.deviceId || c.wantDeviceId).filter(Boolean));
      if (!list.length) return "";
      if (list.every(d => !d.deviceId)) return ""; // no permission yet: let the facing chain choose
      const free = list.find(d => d.deviceId && !used.has(d.deviceId));
      if (!free) throw named("NoFreeCamera", "no unused camera");
      return free.deviceId;
    }

    // public add() calls run one at a time: two quick clicks must not both pick the same free device
    let addQ = Promise.resolve();
    function add(a) { const r = addQ.then(() => addNow(a)); addQ = r.catch(() => {}); return r; }
    async function addNow({ deviceId, name, role, slot, label, _restore } = {}) {
      if (destroyed) throw named("InvalidStateError", "hub destroyed");
      if (cams.length >= opt.max) throw named("CapacityError", `max ${opt.max}`, { max: opt.max, reason: "max" });
      const liveBefore = cams.filter(c => c.active);
      if (capacity != null && liveBefore.length >= capacity) throw named("CapacityError", `capacity ${capacity}`, { max: capacity, reason: "known" });
      if (deviceId && cams.some(c => (c.deviceId || c.wantDeviceId) === deviceId)) throw named("DuplicateCamera", "camera already added");
      const id = deviceId || (await freeDevice());
      const s = slot && SLOTS.includes(slot) && !cams.some(c => c.slot === slot) ? slot : nextSlot(cams);
      if (!s) throw named("CapacityError", `max ${opt.max}`, { max: opt.max, reason: "max" });
      const c = makeCam(s, { name, role, deviceId: id, label });
      cams.push(c);
      cams.sort((a, b) => a.slot.localeCompare(b.slot));
      emit("added", { slot: s });

      // capacity probe: only an EARLIER live track ending/muting proves a limit
      let proven = false;
      const watchers = [];
      for (const p of liveBefore) {
        const tr = liveTrack(p); if (!tr) continue;
        p._probing = true;
        // a track that ends/mutes while the page is hidden or the hub is being torn down proves nothing
        const hit = () => { if (!destroyed && !(hasDOM && document.hidden) && p.status !== "paused") proven = true; };
        tr.addEventListener("ended", hit); tr.addEventListener("mute", hit);
        watchers.push(() => { tr.removeEventListener("ended", hit); tr.removeEventListener("mute", hit); p._probing = false; });
      }
      setStatus(c, "starting");
      let err = null;
      try { await c.start(id); }
      catch (e) { err = e; }
      // a saved camera id that no longer exists (camera swapped, Safari site data cleared): fall back to any camera once
      if (err && _restore && id && /Overconstrained|NotFound/.test(err.name || "") && !destroyed) {
        try { err = null; await c.start(""); } catch (e) { err = e; }
      }
      if (destroyed) { c.destroy(); removeTile(c); const i = cams.indexOf(c); if (i >= 0) cams.splice(i, 1); throw named("InvalidStateError", "hub destroyed"); }
      if (liveBefore.length) {
        if (!err) await sleep(opt.probeMs);
        // only a track that still exists and has ended/muted counts (a camera the user stopped or a hidden tab does not)
        if (!(hasDOM && document.hidden)) for (const p of liveBefore) { const tr = liveTrack(p); if (tr && p.status !== "paused" && (tr.readyState === "ended" || tr.muted)) proven = true; }
      }
      watchers.forEach(f => f());
      if (proven) {
        c.destroy(); removeTile(c); { const i = cams.indexOf(c); if (i >= 0) cams.splice(i, 1); }
        emit("removed", { slot: s });
        for (const p of liveBefore) {
          try { await p.start(p.deviceId || p.wantDeviceId); } catch (e) { setStatus(p, "error", { error: e }); }
        }
        capacity = LS ? writeCapacity(LS, liveBefore.length) : liveBefore.length;
        save(); await applyMany();
        const ce = named("CapacityError", `capacity ${capacity}`, { max: capacity, reason: "proven" });
        emit("capacity", { max: capacity });
        throw ce;
      }
      if (err) {
        if (_restore) { setStatus(c, "error", { error: err }); c.lastError = err; save(); return c; }
        c.destroy(); removeTile(c); { const i = cams.indexOf(c); if (i >= 0) cams.splice(i, 1); }
        emit("removed", { slot: s });
        throw err;
      }
      save();
      await applyMany();
      return c;
    }
    function removeTile(c) { if (c.tile && c.tile.parentNode) c.tile.parentNode.removeChild(c.tile); }
    function remove(slot) {
      const i = cams.findIndex(c => c.slot === slot); if (i < 0) return false;
      const c = cams[i];
      c.destroy(); removeTile(c); cams.splice(i, 1);
      lsDel(K.set(slot));
      save(); emit("removed", { slot });
      applyMany();
      return true;
    }
    async function restore() {
      const st = parseCams(lsGet(K.cams));
      const out = [];
      let list = [];
      try { list = await listCameras(); } catch { /* ignore */ }
      for (const e of st.cams) {
        if (cams.some(c => c.slot === e.slot)) continue;
        let id = e.deviceId;
        if (list.length && list.some(d => d.deviceId) && !list.some(d => d.deviceId === id)) {
          const m = e.label && list.find(d => d.label === e.label && !cams.some(c => c.deviceId === d.deviceId));
          if (m) id = m.deviceId;
        }
        try { out.push(await addNow({ deviceId: id, name: e.name, role: e.role, slot: e.slot, label: e.label, _restore: true })); }
        catch (err) {
          if (err.name === "CapacityError") break;
          console.warn("restore", e.slot, err);
        }
      }
      return out;
    }
    async function startAll() {
      for (const c of cams) {
        if (c.active) continue;
        setStatus(c, "starting");
        try { await c.start(c.deviceId || c.wantDeviceId); } catch (e) { setStatus(c, "error", { error: e }); }
      }
      await applyMany();
    }
    function stopAll() { for (const c of cams) c.stop(); }

    const hub = {
      get cams() { return cams; },
      get capacity() { return capacity; },
      add, remove, restore, startAll, stopAll, save,
      cam: slot => cams.find(c => c.slot === slot) || null,
      rename(slot, name) { const c = hub.cam(slot); if (c) { c.name = str(name, 60) || c.name; save(); emit("renamed", { slot }); } },
      setRole(slot, role) { const c = hub.cam(slot); if (c) { c.role = str(role, 20) || "both"; save(); emit("role", { slot, role: c.role }); } },
      resetCapacity() { lsDel(CAP_KEY); capacity = null; emit("capacity", { max: null }); },
      destroy() { destroyed = true; for (const c of cams.splice(0)) { c.destroy(); removeTile(c); } }
    };
    return hub;
  }

  const api = {
    fallbackChain, errorKind, errorText, parseCams, serializeCams, nextSlot, pickNext, mapSeatToImage,
    readCapacity, writeCapacity, createScheduler, listCameras, create, createHub, SLOTS, CAP_KEY
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") root.LQCam = api;
})(typeof window !== "undefined" ? window : globalThis);
