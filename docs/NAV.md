# nav.js: the shared site header

This is the header comment of `nav.js`, moved here word for word on 2026-11-16 (branch fortune-top-compact) so the
script that every page loads stays inside the page-weight budgets (`tests/e2e/speed-budget.e2e.mjs`, `docs/SPEED.md`).

```text
/* LENSIQ shared site header.
   Usage in every page:  <header class="nav" id="siteNav"></header><script src="nav.js?v=2"></script>
   Plain script, no dependencies. Change the brand in BRAND below.
   Also provides, for every page (no extra <script> tag needed):
   - i18n: injects lensiq-i18n.js + i18n/zh-common.js (TH | EN | 中文 switch in the header; English dictionaries are
     loaded on demand by lensiq-i18n.js). Menu strings carry data-i18n keys "nav.<page>.title|desc", "nav.group.<id>",
     "nav.groupd.<id>", "nav.cta" — Thai text here is the default.
   - Header: utility strip (tagline + language, scrolls away) over the sticky main bar (logo, mega-menu groups, CTA);
     a drawer below 1024 px; a breadcrumb section header (.lq-crumbs) under the bar on every page but the home page.
   - Thai line breaking: in headings/labels/buttons each Thai word (Intl.Segmenter + loanword list) becomes a
     nowrap <span class="lq-w"> with <wbr> between words; elsewhere only known loanwords ("แดชบอร์ด") are wrapped.
     Each rewritten text node becomes one <span class="lq-run">, so textContent and flex/grid layout are unchanged.
   - window.LQModels: "กำลังโหลดโมเดล xx MB" notice + cache check for large model downloads.
   - member account chip: hands the header to lensiq-member.js (window.LQMember.mountNav) when that optional module is
     loaded (API Worker configured + member sign-in set up); otherwise nothing changes.
   - service worker registration (sw.js: cache-first for vendor/ models, versioned). Disable with ?nosw.
   - Legal footer: pages without their own <footer> get a slim one (terms / privacy / help / about links, keys foot.*);
     hidden in kiosk modes and in print. Pages with a <footer> (index, about) link the documents themselves.
   - Fortune pages: loads lensiq-report.js ("report a problem with this reading", works without a backend) and
     lensiq-merit-core.js + lensiq-merit-lint.js + lensiq-merit.js (free belief guidance under a reading, Merit MVP). */
```

Added 2026-11-16: on fortune pages nav.js also moves the 1323 help control (`#lqHelpTop`) into the top bar and opens a
confirmation before calling (owner decision 69 ค; `docs/CRISIS-RESOURCES.md`); Tab walks the open compact language switch.
