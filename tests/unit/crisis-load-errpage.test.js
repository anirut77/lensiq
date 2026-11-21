"use strict";
// tests/unit/crisis-load-errpage.test.js — follow-up G2 of owner decision 203 ค (2026-11-21): load() in tests/e2e/crisis-rules-kit.mjs
// waited only for <html lang> to be the run's language. Chrome's own network-error page carries the browser language, so in a TH run
// it has lang="th" and load() could RESOLVE on the error page; the page's checks then ran against Chrome's error page. STRICTER relock
// (relock12 of evals-locks/crisis-rules-1323.sha256): load() now resolves only when ALL of these hold, and otherwise still throws the
// classified failure (tests/e2e/load-diag.mjs):
//   - the address is not a chrome-error:// URL;
//   - the document is not Chrome's neterror document (body.neterror or #main-frame-error);
//   - the address (without the #fragment, which pages may set) is exactly the requested URL;
//   - <html lang> is the run's language (unchanged).
// The same readiness expression goes to the failure probe, so an error page is never reported as "loaded late".
//   R1 Chrome's error page in the run's language (th, en, zh-Hans) is refused: "page did not load" (navigation error)
//   R2 a neterror document at the requested address is refused (body.neterror alone, #main-frame-error alone); the probe says not ready
//   R3 another page (wrong address) in the right language is refused
//   R4 the requested page in the right language still loads (also with a #fragment); the wrong language is still refused
// A fake page runs the kit's own expressions in a vm sandbox with a fake DOM (no browser, no network).
// This file is locked: evals-locks/crisis-load-errpage.sha256 (written BEFORE load() was changed).
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const vm = require("node:vm");
const { pathToFileURL } = require("node:url");

const ROOT = path.join(__dirname, "..", "..");
const kit = () => import(pathToFileURL(path.join(ROOT, "tests", "e2e", "crisis-rules-kit.mjs")).href);
const BASE = "http://127.0.0.1:8123";
const urlOf = (p, lang) => `${BASE}/${p}.html?nosw&lang=${lang}`;
const HTML = { th: "th", en: "en", zh: "zh-Hans" };
const ERR_URL = "chrome-error://chromewebdata/";

/** a fake CDP page: every evaluate / waitFor expression runs against this fake document */
function fakePage({ href, lang, neterror = false, mainFrameError = false }) {
  const classes = new Set(neterror ? ["neterror"] : []);
  const ids = new Set(mainFrameError ? ["main-frame-error"] : []);
  const u = new URL(href);
  const one = s => (s.startsWith("#") && ids.has(s.slice(1))) || (/^body\.[\w-]+$/.test(s) && classes.has(s.slice(5)))
    || (/^\.[\w-]+$/.test(s) && classes.has(s.slice(1)));
  const body = { id: neterror ? "t" : "", className: [...classes].join(" "), classList: { contains: c => classes.has(c) },
    getElementsByTagName: () => ({ length: 40 }) };
  const document = { readyState: "complete", documentElement: { lang }, body, getElementById: id => (ids.has(id) ? { id } : null),
    querySelector: sel => (String(sel).split(",").map(s => s.trim()).some(one) ? {} : null) };
  const location = { href, origin: u.origin, protocol: u.protocol, host: u.host, pathname: u.pathname, search: u.search, hash: u.hash };
  const ctx = vm.createContext({ document, location, performance: { getEntriesByType: () => [] } });
  const evaluate = async expr => vm.runInContext(String(expr), ctx);
  return {
    goto: async () => {},
    evaluate,
    waitFor: async (expr, ms) => {
      let last;
      for (let i = 0; i < 3; i++) { last = await evaluate(expr); if (last) return last; }
      throw new Error(`waitFor timed out after ${ms} ms: ${String(expr).slice(0, 160)} (last: ${JSON.stringify(last)})`);
    }
  };
}

test("R1 Chrome's error page carrying the run's language is refused (th, en, zh): page did not load", async () => {
  const { load } = await kit();
  for (const lang of ["th", "en", "zh"]) {
    const page = fakePage({ href: ERR_URL, lang: HTML[lang], neterror: true, mainFrameError: true });
    await assert.rejects(load(page, BASE, "tarot", lang), e => {
      assert.ok(e.message.startsWith("page did not load"), `${lang}: ${e.message}`);
      assert.ok(e.lqLoad && e.lqLoad.probe && e.lqLoad.probe.href === ERR_URL, `${lang}: probe of the error page`);
      assert.equal(e.lqLoad.phase, "language applied");
      return true;
    }, `${lang}: load() must not resolve on Chrome's error page`);
  }
});

test("R2 a neterror document at the requested address is refused; the failure probe says not ready", async () => {
  const { load } = await kit();
  for (const sig of [{ neterror: true }, { mainFrameError: true }, { neterror: true, mainFrameError: true }]) {
    const page = fakePage({ href: urlOf("palm", "th"), lang: "th", ...sig });
    await assert.rejects(load(page, BASE, "palm", "th"), e => {
      assert.ok(/^(slow machine|page did not load)/.test(e.message), e.message);
      assert.equal(e.lqLoad.probe.done, false, `${JSON.stringify(sig)}: an error document is never "ready" for the probe`);
      return true;
    }, JSON.stringify(sig));
  }
});

test("R3 another page (wrong address) in the right language is refused", async () => {
  const { load } = await kit();
  for (const href of [`${BASE}/404.html`, `${BASE}/index.html?nosw&lang=th`, `${BASE}/tarot.html?lang=th`, `${BASE}/tarot.html?nosw&lang=en`]) {
    const page = fakePage({ href, lang: "th" });
    await assert.rejects(load(page, BASE, "tarot", "th"), e => {
      assert.equal(e.lqLoad.probe.done, false, href);
      assert.equal(e.lqLoad.probe.sameUrl, false, href);
      return true;
    }, href);
  }
});

test("R4 the requested page in the right language still loads (also with a #fragment); the wrong language is still refused", async () => {
  const { load } = await kit();
  for (const lang of ["th", "en", "zh"]) {
    await load(fakePage({ href: urlOf("tarot", lang), lang: HTML[lang] }), BASE, "tarot", lang);
    await load(fakePage({ href: urlOf("fortune", lang) + "#g3", lang: HTML[lang] }), BASE, "fortune", lang);
  }
  await assert.rejects(load(fakePage({ href: urlOf("tarot", "zh"), lang: "th" }), BASE, "tarot", "zh"), e => !!e.lqLoad);
  await assert.rejects(load(fakePage({ href: urlOf("tarot", "en"), lang: "zh-Hans" }), BASE, "tarot", "en"), e => !!e.lqLoad);
});
