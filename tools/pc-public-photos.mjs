#!/usr/bin/env node
// tools/pc-public-photos.mjs — Product Check P1: interim PUBLIC photo set so P2 (on-device OCR / barcode) can be measured
// before the owner's photos arrive (design §9.1). Source: Open Food Facts / Open Beauty Facts.
//
//   node tools/pc-public-photos.mjs OUT_DIR [--per-country th=140,cn=15,...] [--dry-run]
//
// Licences: OFF / OBF database = ODbL 1.0; product images = CC BY-SA 3.0 (contributors). Images are used LOCALLY for
// evaluation only: never committed, never shipped, never redistributed (design §4.5, risk PR11). OUT_DIR must be outside the
// repo (e.g. ~/LENSIQ-field/product-check/public-photos/). Ground truth = what OFF provides (barcode, product name, brands,
// countries, categories), labelled "public dataset, community-entered, unverified".
// Images showing a person are removed afterwards by tools/pc-face-filter (macOS Vision) or the P2 face gate; see
// docs/product-check/TEST-SETS.md.
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertOutsideRepo } from "./pc-texts.mjs";

export const UA = "LENSIQ-ProductCheck-eval/0.1 (research; contact via github.com/anirut77)";
export const LICENCE = { database: "ODbL-1.0", images: "CC-BY-SA-3.0", note: "local evaluation only; not committed or redistributed" };
export const GROUND_TRUTH_LABEL = "public dataset, community-entered, unverified";
/** country code -> [OFF countries_tags value, default quota] */
export const COUNTRIES = {
  th: ["en:thailand", 140], cn: ["en:china", 15], jp: ["en:japan", 15], kr: ["en:south-korea", 15],
  my: ["en:malaysia", 15], us: ["en:united-states", 15], eu: ["en:france", 8], de: ["en:germany", 7],
};
const FIELDS = "code,product_name,product_name_en,product_name_th,brands,countries_tags,categories_tags,selected_images,lang";

/** OFF image folder for a barcode: 13+ digit codes split 3/3/3/rest, shorter codes as-is. @param {string} code */
export function imageFolder(code) {
  const c = String(code);
  return c.length >= 9 ? c.replace(/^(\d{3})(\d{3})(\d{3})(\d+)$/, "$1/$2/$3/$4") : c;
}

/**
 * Front + ingredients image URLs (400 px) for one product. Uses `selected_images` (OFF / OBF v2 search) when present,
 * otherwise rebuilds the URL from the `images` map (search.openfoodfacts.org). Prefers the product language, then en, th.
 * @param {any} p @param {string} [host] images host
 */
export function pickImages(p, host = "images.openfoodfacts.org") {
  const out = [];
  for (const kind of ["front", "ingredients"]) {
    const disp = p?.selected_images?.[kind]?.display;
    if (disp) {
      const url = disp[p.lang] || disp.en || disp.th || Object.values(disp)[0];
      if (url) out.push({ kind, url });
      continue;
    }
    const imgs = p?.images || {};
    const key = [p.lang, "en", "th"].map(l => `${kind}_${l}`).find(k => imgs[k]) || Object.keys(imgs).find(k => k.startsWith(kind + "_"));
    if (key && imgs[key]?.rev) out.push({ kind, url: `https://${host}/images/products/${imageFolder(p.code)}/${key}.${imgs[key].rev}.400.jpg` });
  }
  return out;
}

/** Manifest row for one image (no image bytes). */
export function manifestRow(p, img, file, sha256, db, accessed) {
  return {
    barcode: String(p.code), product_name: p.product_name || p.product_name_en || p.product_name_th || null,
    brands: Array.isArray(p.brands) ? p.brands.join(", ") : (p.brands || null), countries: p.countries_tags || [], categories: (p.categories_tags || []).slice(0, 8),
    image_kind: img.kind, image_url: img.url, file, sha256, database: db, licence: LICENCE, accessed,
    ground_truth: GROUND_TRUTH_LABEL, fields_provided: ["barcode", "product_name", "brands", "countries", "categories"],
  };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function getJson(url) {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) }).catch(() => null);
    if (r && r.ok) return r.json();
    await sleep(7000 * (i + 1)); // OFF search is rate-limited (~10 / minute)
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const out = args.find(a => !a.startsWith("--"));
  if (!out) { console.error("usage: node tools/pc-public-photos.mjs OUT_DIR [--per-country th=140,...] [--dry-run]"); return 2; }
  assertOutsideRepo(out);
  const quotas = Object.fromEntries(Object.entries(COUNTRIES).map(([k, v]) => [k, v[1]]));
  const pc = args.find(a => a.startsWith("--per-country="));
  if (pc) for (const kv of pc.split("=").slice(1).join("=").split(",")) { const [k, n] = kv.split("="); quotas[k] = +n; }
  const imgDir = join(out, "images");
  mkdirSync(imgDir, { recursive: true });
  const manifestFile = join(out, "manifest.jsonl");
  const have = existsSync(manifestFile) ? readFileSync(manifestFile, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  const seen = new Set(have.map(r => r.barcode));
  const accessed = new Date().toISOString().slice(0, 10);
  const rows = [...have];
  for (const [cc, [tag]] of Object.entries(COUNTRIES)) {
    let got = new Set(have.filter(r => r.country_stratum === cc).map(r => r.barcode)).size;
    // food: search.openfoodfacts.org (the v2 /search endpoint was down on 2026-11-09); beauty (th only): OBF v2 search
    const sources = [{ db: "OFF", url: (page) => `https://search.openfoodfacts.org/search?q=${encodeURIComponent(`countries_tags:"${tag}"` + (cc === "th" ? " AND code:885*" : ""))}&page_size=100&page=${page}&fields=code,product_name,product_name_en,product_name_th,brands,countries_tags,categories_tags,lang,images`, hits: (j) => j?.hits }];
    if (cc === "th") sources.unshift({ db: "OBF", cap: 30, url: (page) => `https://world.openbeautyfacts.org/api/v2/search?countries_tags_en=thailand&fields=${FIELDS}&page_size=100&page=${page}`, hits: (j) => j?.products });
    for (const src of sources) {
      const start = got, limit = (n) => src.cap ? n - start >= src.cap : false;
      for (let page = 1; page <= 12 && got < quotas[cc] && !limit(got); page++) {
        const list = src.hits(await getJson(src.url(page)));
        if (!list?.length) break;
        for (const p of list) {
          if (got >= quotas[cc] || limit(got) || !p.code || seen.has(String(p.code))) continue;
          const imgs = pickImages(p, src.db === "OBF" ? "images.openbeautyfacts.org" : "images.openfoodfacts.org");
          const name = p.product_name || p.product_name_en || p.product_name_th;
          if (!imgs.length || !name) continue;
          seen.add(String(p.code));
          let saved = 0;
          for (const img of imgs) {
            const file = `${cc}-${p.code}-${img.kind}.jpg`;
            if (args.includes("--dry-run")) { saved++; continue; }
            const r = await fetch(img.url, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(60000) }).catch(() => null);
            if (!r || !r.ok) continue;
            const buf = Buffer.from(await r.arrayBuffer());
            writeFileSync(join(imgDir, file), buf);
            const row = { ...manifestRow(p, img, file, createHash("sha256").update(buf).digest("hex"), src.db, accessed), country_stratum: cc };
            rows.push(row); writeFileSync(manifestFile, JSON.stringify(row) + "\n", { flag: "a" });
            saved++;
            await sleep(150);
          }
          if (saved) got++;
        }
        await sleep(3000);
      }
    }
    console.log(`${cc}: ${got} products`);
  }
  console.log(`${rows.length} images in ${manifestFile}`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(c => { process.exitCode = c; }, e => { console.error(e.message); process.exitCode = 2; });
}
