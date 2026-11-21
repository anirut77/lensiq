// tools/examlab-phone-separation.mjs — owner decision 217 ก (2026-11-21): the Exam lab A2 TUNING set
// (~/LENSIQ-field/evals/examlab-phone-tune/) must share nothing with the locked A2 set (~/LENSIQ-field/evals/examlab-phone/):
// no Open Images id, no image sha256, no image file name and no Flickr photo. Pure: takes manifest.jsonl and ATTRIBUTION.csv
// texts, returns the overlaps (empty lists = separated). Used by tests/unit/examlab-phone-tune-separation.test.js (repo copies,
// runs in CI) and by tools/examlab-phone-tune-eval.mjs before every tuning measurement (field copies).

/** @param {string} text manifest.jsonl @returns {Array<{id: string, file: string, sha256: string}>} */
export function manifestRows(text) {
  return text.trim().split(/\r?\n/).filter(Boolean).map(l => JSON.parse(l));
}

/** Flickr photo ids from the landing_url column (…/photos/<user>/<photo id>) @param {string} text ATTRIBUTION.csv */
export function flickrPhotos(text) {
  const out = new Set();
  for (const l of text.trim().split(/\r?\n/).slice(1)) {
    const m = /flickr\.com\/photos\/[^/\s,]+\/(\d+)/.exec(l);
    if (m) out.add(m[1]);
  }
  return out;
}

/** @param {{manifest: string, attribution: string}} locked @param {{manifest: string, attribution: string}} tune */
export function overlaps(locked, tune) {
  const L = manifestRows(locked.manifest), T = manifestRows(tune.manifest);
  const set = (/** @type {any[]} */ rows, /** @type {string} */ k) => new Set(rows.map(r => r[k]));
  const both = (/** @type {Set<string>} */ a, /** @type {Iterable<string>} */ b) => [...b].filter(x => a.has(x));
  return {
    ids: both(set(L, "id"), T.map(r => r.id)),
    sha256: both(set(L, "sha256"), T.map(r => r.sha256)),
    files: both(set(L, "file"), T.map(r => r.file)),
    flickr: both(flickrPhotos(locked.attribution), flickrPhotos(tune.attribution)),
    counts: { locked: L.length, tune: T.length }
  };
}

/** throws unless the two sets share nothing @param {{manifest: string, attribution: string}} locked @param {{manifest: string, attribution: string}} tune */
export function assertSeparated(locked, tune) {
  const o = overlaps(locked, tune);
  const bad = ["ids", "sha256", "files", "flickr"].filter(k => /** @type {any} */ (o)[k].length);
  if (bad.length) throw new Error("examlab-phone-separation: tuning set overlaps the locked set: " + bad.map(k => `${k} ${/** @type {any} */ (o)[k].length}`).join(", "));
  return o;
}
