// @ts-check
// backend/src/tryon-store.js — where try-on catalogue images (garment cut-outs only, TO-D7) are kept, behind one interface.
//
//   R2  when the Worker has an R2 binding named TRYON_BUCKET (owner dependency: R2 is not enabled on the account today;
//       creating a bucket is an owner decision). Key: "tryon/<asset id>". The D1 row keeps metadata only (data = NULL).
//   D1  fallback otherwise: the bytes as base64 in tryon_assets.data, at most D1_MAX_BYTES decoded per image (the device
//       resizes and re-encodes before upload, so a cut-out normally stays well under it).
// Interface: { kind, maxBytes, put(id, bytes, mime) -> {data}, get(row) -> Uint8Array | null, del(row) }.
import { fromB64, toB64 } from "./crypto.js";

export const D1_MAX_BYTES = 1000000;
export const R2_MAX_BYTES = 10 * 1024 * 1024;

/** @param {any} env */
export function assetStore(env) {
  const b = env && env.TRYON_BUCKET;
  if (b && typeof b.put === "function" && typeof b.get === "function") {
    const key = id => "tryon/" + id;
    return {
      kind: "r2",
      // the D1 fallback cap applies everywhere for now, so a catalogue moves between stores without re-checking images
      maxBytes: D1_MAX_BYTES,
      /** @param {string} id @param {Uint8Array} bytes @param {string} mime */
      put: async (id, bytes, mime) => { await b.put(key(id), bytes, { httpMetadata: { contentType: mime } }); return { data: null }; },
      /** @param {any} row */
      get: async row => { const o = await b.get(key(row.id)); return o ? new Uint8Array(await o.arrayBuffer()) : null; },
      /** @param {any} row */
      del: async row => { if (typeof b.delete === "function") await b.delete(key(row.id)); }
    };
  }
  return {
    kind: "d1",
    maxBytes: D1_MAX_BYTES,
    put: async (_id, bytes) => ({ data: toB64(bytes) }),
    get: async row => (row && row.data ? fromB64(row.data) : null),
    del: async () => {}
  };
}

/** The store a row was written to (a row written to R2 is read from R2 even if the binding is later removed -> null). */
export function storeFor(env, row) {
  const s = assetStore(env);
  if (row && row.store === s.kind) return s;
  if (row && row.store === "d1") return assetStore({});
  return { kind: "none", maxBytes: 0, put: async () => ({ data: null }), get: async () => null, del: async () => {} };
}
