/* tests/e2e/face-capture-cam.js — init script for tests/e2e/face-capture*.e2e.mjs: ONE fake phone with a front and a back
 * camera whose picture is a SYNTHETIC face (tests/fixtures/face-capture/face-model.js must be injected first; flat shapes,
 * no photo, no real person), and the fake-detector seam (?fakedet) returning that face's 68 points.
 * window.__FC = {
 *   set(scene, n=1)   scene = face-model shot options ({profile, d, yaw, pitch, roll, tx, ty}) + render options
 *                     ({dark, backlight, glare, glasses, blur, noise}); n = faces the detector reports (2 = a second,
 *                     smaller face beside the first; 0 = none)
 *   wobble(on)        the detector's face moves 0.2 eye distances back and forth every 300 ms (a person who does not hold still)
 *   W, H              picture size (default 720 x 1280, a phone held upright)
 *   requests          every video constraint asked for; facings: the facing of every stream given
 * }
 */
(function () {
  "use strict";
  if (window.__FC) return;
  var Mdl = window.__FCModel;
  var md = navigator.mediaDevices || new EventTarget();
  try { Object.defineProperty(navigator, "mediaDevices", { get: function () { return md; }, configurable: true }); } catch (e) { /* pinned already */ }
  var FC = window.__FC = { W: 720, H: 1280, scene: { profile: "iphone-front-16x9", d: 350 }, n: 1, ver: 1, requests: [], facings: [], wob: false };
  var cache = { ver: 0, shot: null, img: null, second: null };
  function compute() {
    if (cache.ver === FC.ver) return cache;
    var sc = FC.scene, o = Object.assign({}, sc, { W: FC.W, H: FC.H });
    var s = Mdl.shot(o);
    var img = Mdl.render(Object.assign({}, sc, { W: FC.W, H: FC.H, pts: s.pts, seed: 11 }));
    var second = FC.n >= 2 ? Mdl.shot({ profile: sc.profile, d: (sc.d || 350) * 1.8, tx: 0.18, ty: 0.3, W: FC.W, H: FC.H }) : null;
    if (second) { // draw the second (smaller) face on the picture too
      var img2 = Mdl.render({ W: FC.W, H: FC.H, pts: second.pts, seed: 3 }), x0 = 0, x1 = Math.round(FC.W * 0.36);
      for (var y = 0; y < FC.H; y++) for (var x = x0; x < x1; x++) { var i = (y * FC.W + x) * 4; for (var k = 0; k < 4; k++) img.data[i + k] = img2.data[i + k]; }
    }
    cache = { ver: FC.ver, shot: s, img: img, second: second };
    return cache;
  }
  FC.set = function (scene, n) { FC.scene = scene; FC.n = n == null ? 1 : n; FC.ver++; };
  FC.wobble = function (on) { FC.wob = !!on; };
  var norm = function (pts, dx) { return pts.map(function (p) { return [(p[0] + dx) / FC.W, p[1] / FC.H]; }); };
  function det(pts, dx) {
    var xs = pts.map(function (p) { return p[0] + dx; }), ys = pts.map(function (p) { return p[1]; });
    var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    return { x: x0 / FC.W, y: y0 / FC.H, w: (x1 - x0) / FC.W, h: (y1 - y0) / FC.H, score: 0.95, pts: norm(pts, dx) };
  }
  window.__LQ_FAKE_DET = function (key, now) {
    if (!FC.n) return [];
    var c = compute(), iod = Math.hypot(c.shot.pts[45][0] - c.shot.pts[36][0], c.shot.pts[45][1] - c.shot.pts[36][1]) * 0.66;
    var dx = FC.wob ? (Math.floor((now || performance.now()) / 300) % 2 ? 0.2 * iod : -0.2 * iod) : 0;
    var out = [det(c.shot.pts, dx)];
    if (c.second) out.push(det(c.second.pts, 0));
    return out;
  };
  var canvases = [];
  setInterval(function () {
    var c = compute();
    canvases.forEach(function (cv) {
      if (cv.width !== FC.W || cv.height !== FC.H) { cv.width = FC.W; cv.height = FC.H; }
      cv.getContext("2d").putImageData(new ImageData(c.img.data, FC.W, FC.H), 0, 0);
    });
  }, 66);
  md.enumerateDevices = function () {
    return Promise.resolve([
      { deviceId: "fc-front", groupId: "fc", kind: "videoinput", label: "Front camera", toJSON: function () { return {}; } },
      { deviceId: "fc-back", groupId: "fc", kind: "videoinput", label: "Back camera", toJSON: function () { return {}; } }]);
  };
  md.getUserMedia = function (cons) {
    if (!cons || !cons.video) return Promise.reject(new TypeError("video required"));
    var v = cons.video === true ? {} : cons.video;
    FC.requests.push(JSON.parse(JSON.stringify(v)));
    var fm = v.facingMode && (v.facingMode.exact || v.facingMode.ideal || v.facingMode), id = v.deviceId && (v.deviceId.exact || v.deviceId);
    var facing = id === "fc-back" ? "environment" : id === "fc-front" ? "user" : fm === "environment" ? "environment" : "user";
    FC.facings.push(facing);
    var cv = document.createElement("canvas"); cv.width = FC.W; cv.height = FC.H; canvases.push(cv);
    cv.getContext("2d").putImageData(new ImageData(compute().img.data, FC.W, FC.H), 0, 0);
    var s = cv.captureStream(15), tr = s.getVideoTracks()[0], gs = tr.getSettings ? tr.getSettings.bind(tr) : function () { return {}; };
    tr.getSettings = function () { return Object.assign({}, gs(), { facingMode: facing, deviceId: facing === "user" ? "fc-front" : "fc-back", width: FC.W, height: FC.H }); };
    Object.defineProperty(tr, "label", { get: function () { return facing === "user" ? "Front camera" : "Back camera"; } });
    tr.addEventListener("ended", function () { var i = canvases.indexOf(cv); if (i >= 0) canvases.splice(i, 1); });
    var stop = tr.stop.bind(tr); tr.stop = function () { var i = canvases.indexOf(cv); if (i >= 0) canvases.splice(i, 1); stop(); };
    return Promise.resolve(s);
  };
})();
