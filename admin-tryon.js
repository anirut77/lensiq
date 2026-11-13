/* admin-tryon.js — Try-On catalogue section of the back office (admin.html tab "tryon"; backend/src/tryon.js).
 *
 * Uses the admin session, request helper and tab loaders of admin.js (window.__LQAdmin). Roles (decided on the Worker):
 * owner and tryon_admin publish / hide / delete; tryon_editor saves drafts and sends them for review.
 * Images: the merchant picks a product photo; on THIS device it is resized (≤ 1024 px), every face found by the Product
 * Check face blur (LQPCRun.faceRuns -> LQPC.faceBlurPlan -> LQPCRun.faceBlur, BlazeFace on 3 × 3 tiles, threshold 0.5,
 * pad 0.15) is blurred and pixelated, a plain background is cut out (studio-core borderKeyAlpha + refineMatte), and the
 * editor must tick "no visible face or person remains" before the upload button works. If the face detector cannot run,
 * nothing is uploaded (never an unblurred picture). Measured limit of the blur: 27.6–34.7 % of real faces missed, mostly
 * small ones (public datasets, docs/product-check/FACE-BLUR-RESULTS.md) — hence the human tick.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), A = W.__LQAdmin, $ = id => /** @type {any} */ (document.getElementById(id));
  if (!A || !$("atList")) return;
  const G = A.G, h = A.h;
  const st = { data: /** @type {any} */ (null), cur: /** @type {any} */ (null), up: /** @type {any} */ (null) };
  const role = () => { const m = A.me(); return m ? String(m.role) : ""; };
  const canPublish = () => role() === "owner" || role() === "tryon_admin";
  const CAT = { glasses: "แว่นตา", hats: "หมวก", earrings: "ต่างหู", necklaces: "สร้อยคอ", tops: "เสื้อ",
    outerwear: "เสื้อคลุม / แจ็กเก็ต", dresses: "ชุดเดรส", skirts: "กระโปรง", trousers: "กางเกง" };
  const NOTE = { face: "วางบนใบหน้าแบบสด: ใช้ภาพด้านหน้าของสินค้าชิ้นเดียว พื้นเรียบ", pose: "วางตามคอ ไหล่ และชายเสื้อ (ภาพ 2 มิติ ไม่แสดงการทิ้งตัว): ภาพวางราบด้านหน้า กางแขนเสื้อ พื้นเรียบ" };
  const STATUS = { draft: "ร่าง", in_review: "รออนุมัติ", published: "เผยแพร่แล้ว", hidden: "ซ่อน" };
  const catName = c => G("at.cat." + c, CAT[c] || c), stName = s => G("at.st." + s, STATUS[s] || s);
  const err = e => (e && e.code ? G("at.e." + e.code, A.friendly(e)) : A.friendly(e));

  function load() {
    A.call("/tryon/items").then(r => { st.data = r; render(); }, e => A.msg(err(e), true));
  }
  A.loaders.tryon = load;

  function render() {
    const d = st.data; if (!d) return;
    $("atStore").textContent = d.store === "r2" ? G("at.store.r2", "ที่เก็บภาพ: Cloudflare R2") : G("at.store.d1", "ที่เก็บภาพ: ฐานข้อมูล D1 (สำรอง ภาพละไม่เกิน 1 MB) — ยังไม่ได้เปิด R2");
    const box = $("atList"); box.textContent = "";
    if (!d.items.length) { box.appendChild(h("p", { class: "ad-muted", text: G("at.none", "ยังไม่มีสินค้า") })); return; }
    d.items.forEach(it => {
      const btn = (act, key, th) => h("button", { class: "ad-btn ad-ghost", type: "button", "data-act": act, text: G(key, th) });
      const acts = [btn("edit", "at.act.edit", "แก้ไข")];
      if (canPublish()) {
        if (it.status !== "published") acts.push(btn("published", "at.act.publish", "เผยแพร่"));
        if (it.status === "published") acts.push(btn("hidden", "at.act.hide", "ซ่อน"));
        acts.push(btn("delete", "at.act.delete", "ลบ"));
      }
      box.appendChild(h("div", { class: "ar-row", "data-id": it.id, "data-status": it.status },
        h("div", { class: "am-title", translate: "no" }, it.name_th),
        h("div", { class: "am-meta" }, catName(it.category) + " · " + stName(it.status) + " · " +
          (it.asset ? G("at.hasImg", "มีภาพ {w}×{h}", { w: it.asset.w, h: it.asset.h }) : G("at.noImg", "ยังไม่มีภาพ"))),
        h("div", { class: "ad-row" }, ...acts)));
    });
  }
  $("atList").addEventListener("click", ev => {
    const b = ev.target && ev.target.closest && ev.target.closest("button[data-act]"); if (!b) return;
    const id = b.closest(".ar-row").getAttribute("data-id"), act = b.getAttribute("data-act"), it = st.data.items.find(x => x.id === id);
    if (act === "edit") return edit(it);
    if (act === "delete") {
      if (!window.confirm(G("at.q.delete", "ลบสินค้านี้และภาพของสินค้าถาวร?"))) return;
      return A.call("/tryon/items/" + id, { method: "DELETE" }).then(() => { A.msg(G("at.done", "บันทึกแล้ว")); load(); }, e => A.msg(err(e), true));
    }
    A.call("/tryon/items/" + id + "/status", { method: "POST", body: { status: act } }).then(() => { A.msg(G("at.done", "บันทึกแล้ว")); load(); }, e => A.msg(err(e), true));
  });

  /* ---------- form ---------- */
  const f = /** @type {any} */ ($("atForm"));
  function fillSelects() {
    const cat = $("atCat"); cat.textContent = "";
    (st.data ? st.data.categories : []).forEach(c => cat.appendChild(h("option", { value: c.id, text: catName(c.id) })));
    const s = $("atStatus"); s.textContent = "";
    (canPublish() ? ["draft", "in_review", "published", "hidden"] : ["draft", "in_review"]).forEach(v => s.appendChild(h("option", { value: v, text: stName(v) })));
  }
  const catNote = () => { const c = (st.data.categories || []).find(x => x.id === $("atCat").value); $("atCatNote").textContent = c ? G("at.note." + c.anchor, NOTE[c.anchor]) : ""; };
  $("atCat").addEventListener("change", catNote);
  const baht = s => (s == null ? "" : String(s / 100));
  function edit(it) {
    st.cur = it || null; fillSelects(); f.reset(); $("atErr").hidden = true;
    if (it) {
      f.category.value = it.category; f.name_th.value = it.name_th || ""; f.name_en.value = it.name_en || ""; f.name_zh.value = it.name_zh || "";
      f.price.value = baht(it.price); f.sale_price.value = baht(it.sale_price); f.vat_included.checked = !!it.vat_included;
      f.sizes.value = (it.sizes || []).join(", "); f.colours.value = (it.colours || []).map(c => c.name + ":" + c.hex).join(", ");
      f.product_url.value = it.product_url || ""; f.notes.value = it.notes || ""; f.status.value = it.status;
    }
    catNote(); resetUpload();
    $("atImgBox").hidden = !it; $("atEdit").hidden = false; $("atEdit").scrollIntoView({ block: "nearest" });
  }
  $("atNew").addEventListener("click", () => edit(null));
  $("atCancel").addEventListener("click", () => { $("atEdit").hidden = true; st.cur = null; });
  const satang = v => { const t = String(v || "").trim(); if (!t) return null; const n = Math.round(Number(t.replace(/,/g, "")) * 100); return Number.isFinite(n) ? n : NaN; };
  f.addEventListener("submit", ev => {
    ev.preventDefault();
    const list = v => String(v || "").split(",").map(x => x.trim()).filter(Boolean);
    const body = {
      category: f.category.value, name_th: f.name_th.value.trim(), name_en: f.name_en.value.trim() || null, name_zh: f.name_zh.value.trim() || null,
      price: satang(f.price.value), sale_price: satang(f.sale_price.value), vat_included: !!f.vat_included.checked, sizes: list(f.sizes.value),
      colours: list(f.colours.value).map(c => { const [name, hex] = c.split(":").map(x => x.trim()); return { name, hex }; }),
      product_url: f.product_url.value.trim() || null, notes: f.notes.value.trim() || null, status: f.status.value
    };
    const p = st.cur ? A.call("/tryon/items/" + st.cur.id, { method: "PUT", body }) : A.call("/tryon/items", { method: "POST", body });
    $("atSave").disabled = true;
    p.then(r => { A.msg(G("at.done", "บันทึกแล้ว")); st.cur = r.item; $("atImgBox").hidden = false; load(); },
      e => { $("atErr").textContent = err(e); $("atErr").hidden = false; }).then(() => { $("atSave").disabled = false; });
  });

  /* ---------- image: resize -> face blur (Product Check) -> cut-out -> human tick -> upload ---------- */
  function resetUpload() {
    st.up = null; $("atFile").value = ""; $("atNoFace").checked = false; $("atUpload").disabled = true; $("atPrev").hidden = true; $("atBlurInfo").textContent = "";
  }
  const syncUpload = () => { $("atUpload").disabled = !(st.up && $("atNoFace").checked); };
  $("atNoFace").addEventListener("change", syncUpload);
  $("atFile").addEventListener("change", async () => {
    const file = $("atFile").files && $("atFile").files[0]; resetUploadKeepFile();
    if (!file) return;
    if (!/^image\/(png|webp|jpeg)$/.test(file.type) || file.size > 10 * 1024 * 1024) { $("atBlurInfo").textContent = G("at.img.bad", "ใช้ได้เฉพาะ PNG, WebP หรือ JPEG ไม่เกิน 10 MB"); return; }
    $("atBlurInfo").textContent = G("at.img.scan", "กำลังหาใบหน้าในภาพบนเครื่องนี้ เพื่อเบลอก่อนอัปโหลด…");
    try {
      const bmp = await createImageBitmap(file), frame = document.createElement("canvas");
      frame.width = bmp.width; frame.height = bmp.height; frame.getContext("2d").drawImage(bmp, 0, 0);
      const LQPC = W.LQPC, LQPCRun = W.LQPCRun, set = LQPC.FACE_BLUR;
      let fr;
      try { fr = await LQPCRun.faceRuns(frame, null, { tiles: set.tiles, grid: set.grid, overlap: set.overlap, upscale: set.upscale, close: set.close, maxSide: 1024 }); }
      catch (e) { fr = { loaded: false, error: String(e) }; }
      const plan = LQPC.faceBlurPlan(fr, fr.w, fr.h, { threshold: set.threshold, pad: set.pad, tiles: set.tiles,
        need: ["frame", ...(set.tiles ? ["tiles"] : []), ...(set.close ? ["close"] : []), "upload"], crop: fr.crop, scale: fr.scale });
      // the detector could not run: never upload a picture that was not checked
      if (plan.textOnly) { $("atBlurInfo").textContent = G("at.img.noDetector", "หาใบหน้าบนเครื่องนี้ไม่ได้ ({r}) จึงไม่อัปโหลดภาพ ลองเบราว์เซอร์อื่น", { r: plan.reason }); return; }
      const up = fr.upload, n = LQPCRun.faceBlur(up, plan.regions);
      if ($("atCut").checked) cutOut(up);
      const pv = $("atPrev"); pv.width = up.width; pv.height = up.height; pv.getContext("2d").drawImage(up, 0, 0); pv.hidden = false;
      st.up = { canvas: up, faces: n };
      $("atBlurInfo").textContent = n ? G("at.img.blurred", "เบลอบริเวณใบหน้าแล้ว {n} จุด ตรวจภาพอีกครั้งก่อนอัปโหลด", { n })
        : G("at.img.noFace", "ไม่พบใบหน้าในภาพ ตรวจภาพอีกครั้งก่อนอัปโหลด (ใบหน้าที่เล็กมากอาจหาไม่พบ)");
      syncUpload();
    } catch (e) { console.warn(e); $("atBlurInfo").textContent = G("at.img.err", "เปิดภาพนี้ไม่ได้"); }
  });
  function resetUploadKeepFile() { st.up = null; $("atNoFace").checked = false; $("atUpload").disabled = true; $("atPrev").hidden = true; }
  /** plain background -> transparent (studio-core border key + guided-filter refine), in place */
  function cutOut(c) {
    const SC = W.StudioCore; if (!SC) return;
    const x = c.getContext("2d"), im = x.getImageData(0, 0, c.width, c.height), px = im.data;
    const a = SC.refineMatte(px, SC.borderKeyAlpha(px, c.width, c.height), c.width, c.height, { k: 3 });
    for (let i = 0; i < a.length; i++) px[i * 4 + 3] = Math.round(px[i * 4 + 3] * a[i]);
    x.putImageData(im, 0, 0);
  }
  const toB64 = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = rej; r.readAsDataURL(blob); });
  const blobOf = (c, type, q) => new Promise(res => c.toBlob(res, type, q));
  $("atUpload").addEventListener("click", async () => {
    if (!st.up || !st.cur || !$("atNoFace").checked) return; // the human check is required
    const max = (st.data && st.data.max_bytes) || 1000000, c = st.up.canvas;
    let blob = await blobOf(c, "image/png"), mime = "image/png";
    if (!blob || blob.size > max) { blob = await blobOf(c, "image/webp", .9); mime = "image/webp"; }
    if (!blob || blob.size > max) { $("atBlurInfo").textContent = G("at.img.big", "ภาพใหญ่เกินไปหลังย่อ ลองภาพที่เล็กกว่า"); return; }
    $("atUpload").disabled = true;
    const body = { mime, data: await toB64(blob), w: c.width, h: c.height, face_check: { ran: true, faces: st.up.faces, confirmed: true } };
    A.call("/tryon/items/" + st.cur.id + "/asset", { method: "PUT", body }).then(() => { A.msg(G("at.img.done", "อัปโหลดภาพแล้ว")); resetUpload(); load(); },
      e => { A.msg(err(e), true); syncUpload(); });
  });
})();
