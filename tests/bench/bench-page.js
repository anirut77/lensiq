/* tests/bench/bench-page.js — window.LQB, browser side of the accuracy benchmarks.
 * Everything here calls the production code paths: LQDetect.detectCoco (store/booth/checkout person detector),
 * LQDetect.embedBox (store re-ID crop + MobileNetV2), face-api TinyFaceDetector + landmarks + descriptor / age-gender
 * with the same options as attendance.js / customers.js / signage.js. Only numbers leave the page. */
(function () {
  "use strict";
  const MODEL = "vendor/models/";
  const img = url => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("load " + url)); i.src = url; });
  const r4 = v => Math.round(v * 1e4) / 1e4;
  let coco = null, emb = null, hand = null, faceReady = false, agReady = false;
  const small = document.createElement("canvas"), cropCv = document.createElement("canvas");
  const b64 = f32 => { const u = new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };

  const LQB = {
    ready: false,
    backend: () => LQDetect.tfBackend(),
    /* people: detections for a list of frame URLs. minScore low (0.05) so thresholds can be swept offline:
       greedy NMS keeps exactly the same boxes above any higher threshold. embMin>0 -> MobileNetV2 embedding (base64
       Float32) for each det >= embMin, cropped from the detW canvas exactly like store.js frameSrc()+embedBox. */
    async people(urls, { detW = 416, minScore = 0.05, max = 100, embMin = 0, tiles = null, model = "coco", split = null } = {}) {
      const det = model === "coco" ? (coco = coco || await LQDetect.loadCoco(MODEL + "cocossd/model.json")) : await LQDetect.loadYolox(MODEL + "yolox/" + model + ".onnx");
      if (embMin > 0) emb = emb || await LQDetect.loadEmbedder(MODEL + "mobilenet/model.json");
      const out = [];
      for (const u of urls) {
        const im = await img(u);
        const t0 = performance.now();
        const dets = await LQDetect.detectPeople(det, im, { detW, minScore, max, canvas: small, tiles, split });
        const ms = performance.now() - t0;
        const row = { d: dets.map(d => [r4(d.x), r4(d.y), r4(d.w), r4(d.h), r4(d.score)]), ms: Math.round(ms) };
        if (embMin > 0) {
          let embMs = 0, n = 0;
          row.e = dets.map(d => {
            if (d.score < embMin) return null;
            const t = performance.now();
            const v = LQDetect.embedBox(emb, small, d, { pad: 0.04, canvas: cropCv });
            embMs += performance.now() - t; n++;
            return v ? b64(v) : null;
          });
          row.embMs = n ? Math.round(embMs / n) : 0;
        }
        out.push(row);
      }
      return out;
    },
    /* faces: attendance/customers pipeline. padTo>0 draws the image centred on a grey canvas of that size first
       (cropped datasets: the detector expects some context around the face). */
    async faces(urls, { inputSize = 320, scoreThreshold = 0.5, descriptor = true, ageGender = false, padTo = 0 } = {}) {
      if (!faceReady) {
        await LQDetect.tfBackend();
        await Promise.all(["tinyFaceDetector", "faceLandmark68Net", "faceRecognitionNet"].map(n => faceapi.nets[n].loadFromUri(MODEL)));
        faceReady = true;
      }
      if (ageGender && !agReady) { await faceapi.nets.ageGenderNet.loadFromUri(MODEL); agReady = true; }
      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });
      const out = [];
      for (const u of urls) {
        let src = await img(u);
        if (padTo > 0) {
          const c = document.createElement("canvas"); c.width = c.height = padTo;
          const x = c.getContext("2d"); x.fillStyle = "#808080"; x.fillRect(0, 0, padTo, padTo);
          x.drawImage(src, (padTo - src.width) / 2, (padTo - src.height) / 2); src = c;
        }
        const t0 = performance.now();
        let q = faceapi.detectAllFaces(src, opts).withFaceLandmarks();
        if (descriptor) q = q.withFaceDescriptors();
        if (ageGender) q = q.withAgeAndGender();
        const rs = await q;
        const ms = performance.now() - t0;
        if (!rs.length) { out.push({ n: 0, ms: Math.round(ms) }); continue; }
        // largest face (the pages enrol/score the main face)
        const r = rs.slice().sort((a, b) => b.detection.box.area - a.detection.box.area)[0];
        out.push({ n: rs.length, ms: Math.round(ms), score: r4(r.detection.score), desc: descriptor ? Array.from(r.descriptor, r4) : undefined,
          age: ageGender ? r4(r.age) : undefined, gender: ageGender ? r.gender : undefined, gp: ageGender ? r4(r.genderProbability) : undefined });
      }
      return out;
    }
    ,
    /* faceFrames: like faces(), but each image yields 1 + jitter "video frames" (seeded small shift / scale / exposure /
       defocus — what consecutive webcam frames of one pose look like) and quality inputs for LQTrack.faceQuality:
       box px size, detector score, 68 landmarks (for yaw), LQDetect.faceSharpness. upscale: draw the image k× larger first
       (small aligned crops such as CASIA-FaceV5 112 px), padTo: grey canvas around it. */
    async faceFrames(urls, { inputSize = 320, scoreThreshold = 0.5, padTo = 0, upscale = 1, jitter = 2, seed = 1, sizes = null } = {}) {
      if (!faceReady) {
        await LQDetect.tfBackend();
        await Promise.all(["tinyFaceDetector", "faceLandmark68Net", "faceRecognitionNet"].map(n => faceapi.nets[n].loadFromUri(MODEL)));
        faceReady = true;
      }
      const opts = new faceapi.TinyFaceDetectorOptions({ inputSize, scoreThreshold });
      let s = seed >>> 0 || 1; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const out = [];
      for (const u of urls) {
        const im = await img(u), iw = im.naturalWidth * upscale, ih = im.naturalHeight * upscale;
        const P = Math.max(padTo, iw, ih), frames = [];
        for (let k = 0; k <= jitter; k++) {
          const c = document.createElement("canvas"); c.width = c.height = P;
          const x = c.getContext("2d"); x.fillStyle = "#808080"; x.fillRect(0, 0, P, P);
          const sc = k ? 1 + (rnd() - 0.5) * 0.12 : 1, dx = k ? (rnd() - 0.5) * 0.06 * iw : 0, dy = k ? (rnd() - 0.5) * 0.06 * ih : 0;
          const br = k ? 0.85 + rnd() * 0.3 : 1, bl = k ? rnd() * 1.2 : 0;
          x.filter = `brightness(${br.toFixed(3)})` + (bl > 0.3 ? ` blur(${bl.toFixed(2)}px)` : "");
          x.drawImage(im, (P - iw * sc) / 2 + dx, (P - ih * sc) / 2 + dy, iw * sc, ih * sc);
          x.filter = "none";
          // sizes: [320, 224, 160] = LQDetect.detectFacesCascade exactly as attendance.js / customers.js call it (round 5)
          const rs = sizes ? await LQDetect.detectFacesCascade(faceapi, c, { sizes, scoreThreshold }) : await faceapi.detectAllFaces(c, opts).withFaceLandmarks().withFaceDescriptors();
          if (!rs.length) { frames.push({ n: 0 }); continue; }
          const r = rs.slice().sort((a, b) => b.detection.box.area - a.detection.box.area)[0], b = r.detection.box;
          const lm = r.landmarks.positions.map(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
          frames.push({ n: rs.length, score: r4(r.detection.score), w: Math.round(b.width), h: Math.round(b.height), desc: Array.from(r.descriptor, r4),
            q: LQTrack.faceQuality({ box: { x: b.x, y: b.y, w: b.width, h: b.height }, score: r.detection.score, landmarks: lm, sharp: LQDetect.faceSharpness(c, { x: b.x, y: b.y, w: b.width, h: b.height }) }) });
        }
        out.push(frames);
      }
      return out;
    }
    ,
    /* hands: LQHand.createDetector().detect(src, {quick, max}) exactly as signage.js (kiosk) calls it */
    async hands(urls, { quick = true, max = 3 } = {}) {
      hand = hand || LQHand.createDetector({ modelDir: MODEL + "hand/" });
      await hand.load();
      const out = [];
      for (const u of urls) {
        const im = await img(u), W = im.naturalWidth, H = im.naturalHeight;
        const t0 = performance.now();
        const hs = await hand.detect(im, { quick, max });
        out.push({ ms: Math.round(performance.now() - t0), W, H, h: hs.map(h => ({ s: r4(h.score), b: [r4(h.box.x / W), r4(h.box.y / H), r4(h.box.w / W), r4(h.box.h / H)] })) });
      }
      return out;
    }
  };
  window.LQB = LQB;
  LQDetect.tfBackend().then(() => { LQB.ready = true; }, e => { LQB.error = String(e); });
})();
