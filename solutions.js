/* solutions.js — solutions.html: status filter (all / available to try now / coming soon; owner decision 223) for the sector catalogue,
 * remembered per browser (localStorage "lq-sol-filter", wrapped in try/catch), plus the print button. The catalogue
 * itself is static markup (data-i18n), so it reads without JavaScript. Test hook: window.__LQSOL = {set(f), count()}. */
(function () {
  "use strict";
  const T = (key, thai, vars) => window.LQI18N ? window.LQI18N.tf(key, thai, vars) : thai.replace(/\{(\w+)\}/g, (m, k) => vars && vars[k] != null ? vars[k] : m);
  const KEY = "lq-sol-filter", OK = ["all", "now", "soon"];
  const btns = /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".sl-filter [data-f]")]);
  const cards = /** @type {HTMLElement[]} */ ([...document.querySelectorAll(".sl-card")]);
  let cur = "all";
  try { const v = localStorage.getItem(KEY); if (OK.includes(v)) cur = v; } catch { /* storage blocked */ }
  // demo-only cards ([data-demo-only], decision 223) are listed only in demo mode (nav.js sets html.lq-demo)
  const listed = c => !c.hasAttribute("data-demo-only") || document.documentElement.classList.contains("lq-demo");
  function count() { return cards.filter(c => !c.hidden && listed(c)).length; }
  function apply() {
    for (const b of btns) b.setAttribute("aria-pressed", b.dataset.f === cur ? "true" : "false");
    for (const c of cards) c.hidden = cur !== "all" && c.dataset.status !== cur;
    for (const s of document.querySelectorAll(".sl-sec")) {
      const any = /** @type {HTMLElement[]} */ ([...s.querySelectorAll(".sl-card")]).some(c => !c.hidden && listed(c));
      const none = /** @type {HTMLElement|null} */ (s.querySelector(".sl-none"));
      if (none) none.hidden = any;
    }
    const el = document.getElementById("slCount");
    if (el) el.textContent = T("sl.count", "แสดง {n} จาก {total} รายการ", { n: count(), total: cards.filter(listed).length });
  }
  function set(f) {
    if (!OK.includes(f)) return;
    cur = f;
    try { localStorage.setItem(KEY, f); } catch { /* ignore */ }
    apply();
  }
  btns.forEach(b => b.addEventListener("click", () => set(b.dataset.f)));
  const pr = document.getElementById("slPrint");
  if (pr) pr.addEventListener("click", () => { const keep = cur; set("all"); window.print(); set(keep); });
  window.addEventListener("lq-lang", apply);
  apply();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", apply);
  /** @type {any} */ (window).__LQSOL = { set, count, get filter() { return cur; } };
})();
