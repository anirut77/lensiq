/* pricing.js — draft pricing page (pricing.html). Everything is marked "ร่าง" (draft).
 * Plans are shown only when the API Worker says pricing_enabled (admin toggle) or with ?preview=1.
 * Checkout (PromptPay via Opn) is offered only when the Worker reports billing_enabled (which also requires
 * FREE_MODE=false). Offline / no API: the page just says the service is free.
 */
(function () {
  "use strict";
  var $ = function (/** @type {string} */ id) { return /** @type {any} */ (document.getElementById(id)); };
  var API = /** @type {any} */ (window).LQApi;
  // Fallback copy of the draft plans (same as backend/migrations/0003_seed_plans.sql) for ?preview=1 without an API.
  var DRAFT = [
    { id: "free", name_th: "ฟรี", price_month_satang: 0, price_year_satang: 0, perks: ["ทุกหน้าใช้งานบนเครื่อง", "ผู้ช่วยเขียนคำทำนาย AI 3 ครั้ง/วัน", "สถิติย้อนหลัง 7 วัน"] },
    { id: "pro", name_th: "โปร", price_month_satang: 99000, price_year_satang: 990000, perks: ["ผู้ช่วยเขียน AI 100 ครั้ง/เดือน", "สถิติย้อนหลัง 90 วัน + ส่งออก CSV", "ฮับรวมยอด 3 จุด"] },
    { id: "business", name_th: "ธุรกิจ", price_month_satang: 390000, price_year_satang: 3900000, perks: ["ผู้ช่วยเขียน AI 600 ครั้ง/เดือน", "สถิติย้อนหลัง 400 วัน", "ฮับรวมยอด 20 จุด", "ใบกำกับภาษีเต็มรูป"] },
    { id: "enterprise", name_th: "องค์กร", price_month_satang: null, price_year_satang: null, perks: ["ไม่จำกัด", "ติดตั้งในเครือข่ายองค์กร / SLA", "DPA และเอกสาร PDPA"] }
  ];
  var period = "month";
  var info = /** @type {any} */ ({ pricing_enabled: false, billing_enabled: false, free_mode: true, vat_registered: false });
  var chosen = "";

  var baht = function (/** @type {number|null} */ s) { return s == null ? "ติดต่อฝ่ายขาย" : s === 0 ? "0 บาท" : (s / 100).toLocaleString("th-TH") + " บาท"; };

  function render() {
    var g = $("prGrid"); g.textContent = "";
    DRAFT.forEach(function (p) {
      var price = period === "year" ? p.price_year_satang : p.price_month_satang;
      var card = document.createElement("article");
      card.className = "pr-card";
      var h = document.createElement("h2"); h.textContent = p.name_th; card.appendChild(h);
      var pr = document.createElement("p"); pr.className = "pr-price";
      pr.textContent = baht(price) + (price ? (period === "year" ? " / ปี" : " / เดือน") : "");
      var tag = document.createElement("span"); tag.className = "pr-tag"; tag.textContent = "ร่าง"; pr.appendChild(tag);
      card.appendChild(pr);
      var ul = document.createElement("ul");
      p.perks.forEach(function (x) { var li = document.createElement("li"); li.textContent = x; ul.appendChild(li); });
      card.appendChild(ul);
      if (info.billing_enabled && price) {
        var b = document.createElement("button"); b.type = "button"; b.className = "pr-btn"; b.textContent = "เลือกแพ็กเกจนี้";
        b.addEventListener("click", function () { chosen = p.id; $("prCheckout").hidden = false; $("prCheckout").scrollIntoView({ behavior: "smooth" }); });
        card.appendChild(b);
      }
      g.appendChild(card);
    });
    $("prVat").textContent = info.vat_registered ? "ราคารวมภาษีมูลค่าเพิ่ม 7% แล้ว" : "ราคายังไม่รวมเงื่อนไขภาษี (ร่าง) — จะออกใบเสร็จรับเงินตามสถานะการจดทะเบียน VAT ของผู้ขาย";
  }

  document.querySelectorAll(".pr-toggle button").forEach(function (b) {
    b.addEventListener("click", function () {
      period = String(b.getAttribute("data-period"));
      document.querySelectorAll(".pr-toggle button").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      render();
    });
  });

  $("prForm").addEventListener("submit", function (/** @type {Event} */ ev) {
    ev.preventDefault();
    var f = /** @type {any} */ (ev.target);
    var box = $("prQr"); box.textContent = "กำลังสร้าง QR…";
    // Turnstile is required by the Worker for checkout (fail closed)
    API.turnstile("checkout").then(function (/** @type {string} */ tok) {
      return API.postJSON("/v1/billing/checkout", {
        plan_id: chosen, period: period, accept_terms: !!f.accept.checked,
        buyer: { name: f.name.value, email: f.email.value, tax_id: f.tax_id.value, address: f.address.value, branch: f.branch.value }
      }, { headers: tok ? { "X-Turnstile-Token": tok } : {} });
    }).then(function (/** @type {any} */ r) {
      if (!r) { box.textContent = "สร้างรายการชำระเงินไม่สำเร็จ กรุณาตรวจข้อมูลแล้วลองใหม่"; return; }
      box.textContent = "";
      var img = document.createElement("img"); img.alt = "QR PromptPay"; img.width = 240; img.height = 240; box.appendChild(img);
      var st = document.createElement("p"); st.textContent = "สแกนด้วยแอปธนาคาร · ยอด " + baht(r.amount_satang); box.appendChild(st);
      // the buyer keeps these to link the paid plan to themselves (the server stores only a hash of the token)
      var keep = document.createElement("p"); keep.className = "pr-small";
      keep.textContent = "เก็บรหัสคำสั่งซื้อนี้ไว้ (ใช้ยืนยันสิทธิ์แพ็กเกจ แสดงเพียงครั้งเดียว): " + r.customer_id + " / " + r.order_token;
      box.appendChild(keep);
      fetch(API.url(r.qr_path), { credentials: "omit" }).then(function (x) { return x.ok ? x.blob() : null; }).then(function (b) { if (b) img.src = URL.createObjectURL(b); });
      var n = 0;
      var t = setInterval(function () {
        if (++n > 180) { clearInterval(t); st.textContent = "QR หมดอายุ กรุณาสร้างใหม่"; return; }
        API.getJSON(r.status_path).then(function (/** @type {any} */ s) {
          if (!s || s.status === "pending") return;
          clearInterval(t);
          st.textContent = s.status === "successful" ? "ชำระเงินสำเร็จ · เลขที่เอกสาร " + s.receipt_no : "การชำระเงินไม่สำเร็จ (" + s.status + ")";
          if (s.status === "successful") img.remove();
        });
      }, 5000);
    });
  });

  var preview = /[?&]preview=1\b/.test(location.search);
  var show = function () {
    $("prFree").hidden = !info.free_mode;
    var on = info.pricing_enabled || preview;
    $("prPlans").hidden = !on;
    $("prHidden").hidden = on;
    if (on) render();
  };
  if (API && API.enabled()) API.getJSON("/v1/billing/plans").then(function (/** @type {any} */ r) { if (r) info = r; show(); });
  else show();
})();
