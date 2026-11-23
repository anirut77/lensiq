/* lensiq-face-mesh68.js — face reading on a TIER-1 model (LICENSES/TIERS.md M2): MediaPipe Face Landmarker (BlazeFace short
 * range + Face Mesh V2, Apache-2.0, Google's consented smartphone AR-app images; vendor/models/face-landmarker/README.txt), the
 * same vendored file Exam lab and the look preview use. The facial-movement (blendshape) model is not in that file, so nothing
 * here can score expression or emotion. Nothing is identified, matched or stored; no frame leaves the device.
 *
 * It returns faces in the shape faceread.js already uses for face-api.js: [{ box: {x, y, width, height}, score, pts }] with pts =
 * 68 points in the iBUG-68 order (jaw 0-16, brows 17-26, nose 27-35, eyes 36-47, mouth 48-67), picked from the 478 mesh points
 * by MAP68 below. The pick is an approximation of the iBUG positions (the mesh has no point exactly on every iBUG point, the jaw
 * points sit on the face outline), so this engine has its own calibration (CAL, used through FRCore.setEngine("mp", CAL)).
 * Behind window.LENSIQ_FACEREAD_TIER1 (lensiq-config.js, off): the owner decides when it replaces face-api on faceread.
 */
(function (root) {
  "use strict";
  // iBUG-68 index -> Face Mesh index (subject's right side = image left, as in iBUG / dlib)
  var MAP68 = [
    127, 234, 93, 132, 58, 172, 136, 150, 152, 377, 365, 397, 288, 361, 323, 454, 356, // 0-16 jaw / face outline
    70, 63, 105, 66, 107,                    // 17-21 right brow (outer -> inner)
    336, 296, 334, 293, 300,                 // 22-26 left brow (inner -> outer)
    168, 197, 5, 4,                          // 27-30 nose bridge -> tip
    75, 97, 2, 326, 305,                     // 31-35 nose base
    33, 160, 158, 133, 153, 144,             // 36-41 right eye
    362, 385, 387, 263, 373, 380,            // 42-47 left eye
    61, 39, 37, 0, 267, 269, 291, 405, 314, 17, 84, 181, // 48-59 outer lip
    78, 82, 13, 312, 308, 317, 14, 87        // 60-67 inner lip
  ];
  var MODEL = "vendor/models/face-landmarker/face_landmarker_lm.task";
  // Calibration for FRCore.setEngine("mp", CAL), by the method faceread.js documents for NORMS ([median, IQR / 1.349]; raw thresholds at
  // the percentiles named there; hairline keys only where the hairline was found): Face Research Lab London Set (CC BY 4.0), the 34
  // dev ids of the locked split, neutral front; 33 passed the quality check, hairline found on 29. Never the 68 test ids C1 / C2 measure.
  // tools/faceread-calibrate-mp.mjs -> ~/LENSIQ-field/evals/faceread-90/calibration-mp.json (locked, evals-locks/faceread-90.sha256).
  // Starting values for a belief-based reading only; not population values.
  var CAL = {"NORMS": {"lengthRatio": [1.332, 0.05341], "jawRatio": [0.8842, 0.01684], "foreheadRatio": [0.943, 0.04154], "chinWidth": [0.6946, 0.01822], "chinAngle": [132.6, 8.708], "jawCorner": [161.1, 2.594], "lowerShare": [0.3643, 0.02464], "upperShare": [0.292, 0.022], "middleShare": [0.3429, 0.01889], "mlRatio": [0.9309, 0.09108], "browEye": [1.581, 0.07379], "browGap": [0.2936, 0.02685], "browRise": [-0.1281, 0.04024], "browArch": [0.1553, 0.01757], "interBrow": [1.075, 0.06384], "eyeAspect": [3.226, 0.3196], "eyeGap": [1.178, 0.06924], "eyeTilt": [0.05683, 0.03643], "underEye": [0.5896, 0.04307], "templeW": [0.4029, 0.0642], "noseLen": [0.7625, 0.04869], "alarWidth": [0.7131, 0.05694], "noseBridge": [0.5316, 0.02351], "philtrumShare": [0.2167, 0.01717], "mouthW": [0.7929, 0.04306], "lipTotal": [0.2643, 0.03566], "lipRatio": [0.7035, 0.08423], "mouthTilt": [-0.02116, 0.02487], "cheekProm": [1.179, 0.02054], "cheekL": [1.183, 0.02511], "cheekR": [1.181, 0.02144], "foreheadH": [0.8552, 0.1223], "templeSpan": [0.8263, 0.02357], "jawLowW": [0.7967, 0.01796], "browAsym": [0.008676, 0.01101], "mouthAsym": [0.01272, 0.01307], "alarAsym": [0.0121, 0.01321], "eyeAsym": [0.01187, 0.00907]}, "THRESH": {"browHigh": 0.3094, "browLow": 0.2732, "eyeWide": 1.282, "eyeClose": 1.11, "mouthUp": -0.009078, "browGapWide": 1.12, "browGapNarrow": 1.033, "philLong": 0.2334, "philShort": 0.2102, "chinBroad": 0.7052, "chinPointed": 0.6806, "chinAngleBroad": 138.6, "chinAnglePointed": 126.9}, "fallbackRatio": 0.8552};

  /** MediaPipe result (normalised 0..1 landmarks) -> faceread detections in pixels of a W x H input */
  function toDets(res, W, H) {
    var faces = (res && res.faceLandmarks) || [];
    return faces.map(function (L) {
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (var i = 0; i < L.length; i++) { var x = L[i].x * W, y = L[i].y * H; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return { box: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }, score: 1,
        pts: MAP68.map(function (k) { return [L[k].x * W, L[k].y * H]; }) };
    });
  }

  /** FRCore's reference values (NORMS, THRESH, HAIR.fallbackRatio, changed in place) for this engine (on) or back to face-api's */
  function apply(FR, on) {
    if (!FR.__faBase) FR.__faBase = { N: JSON.parse(JSON.stringify(FR.NORMS)), T: Object.assign({}, FR.THRESH), fb: FR.HAIR.fallbackRatio };
    var b = FR.__faBase, N = on ? CAL.NORMS : b.N;
    Object.keys(N).forEach(function (k) { FR.NORMS[k] = N[k].slice(); });
    Object.assign(FR.THRESH, on ? CAL.THRESH : b.T);
    FR.HAIR.fallbackRatio = on ? CAL.fallbackRatio : b.fb;
    return (FR.engine = on ? "mp" : "faceapi");
  }

  /** loads the vendored Tasks Vision bundle and the model (IMAGE mode, CPU delegate, up to 3 faces for the one-person check); with FR,
   *  switches FRCore to this engine's calibration. faces(input) -> detections; a runtime failure throws an error marked lqModel (the
   *  page then shows its plain "model" line, never the raw error text) */
  async function create(base, FR) {
    base = base || new URL(".", root.location.href).href;
    var V = await import(base + "vendor/mediapipe/vision_bundle.mjs");
    var files = await V.FilesetResolver.forVisionTasks(base + "vendor/mediapipe/wasm");
    var lm = await V.FaceLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: base + MODEL, delegate: "CPU" }, runningMode: "IMAGE", numFaces: 3 });
    if (FR) apply(FR, true);
    return { lm: lm, faces: function (input) {
      try { return detect(lm, input); } catch (e) { console.error(e); throw Object.assign(new Error("face model cannot run"), { lqModel: true }); }
    } };
  }

  /** every face in a canvas / video / image -> [{box, score, pts}] */
  function detect(lm, input) {
    var W = input.videoWidth || input.naturalWidth || input.width, H = input.videoHeight || input.naturalHeight || input.height;
    return toDets(lm.detect(input), W, H);
  }

  var api = { MAP68: MAP68, MODEL: MODEL, CAL: CAL, apply: apply, toDets: toDets, create: create, detect: detect };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.LQFaceMesh68 = api;
})(typeof window !== "undefined" ? window : globalThis);
