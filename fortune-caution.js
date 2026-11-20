/* fortune-caution.js — shell of the "สิ่งที่ควรระวัง" section (item 177), behind LENSIQ_FORTUNE_CAUTIONS (off): closed on every reading;
 * core + rule packs load only after the disclaimer (per tab); gone under the crisis or calm flag. V, SCHOOLS: tools/fortune-caution-pack.mjs. */
(function (root) {
  "use strict";
  var V = "e7821180";
  var ACK = "lq-caution-ack";
  /** @param {string} th @param {string} en @param {string} zh */
  var T = function (th, en, zh) { return { th: th, en: en, zh: zh }; };
  var TEXT = {
    title: T("สิ่งที่ควรระวัง", "Things to be mindful of", "需要留意的事项"),
    open: T("เปิดดูสิ่งที่ควรระวัง", "Show things to be mindful of", "查看需要留意的事项"),
    disclaimer: T("คำทำนายในส่วนนี้เป็นการคาดการณ์ของระบบตามหลักความเชื่อของศาสตร์นี้ ไม่ได้ชี้ขาดว่าสิ่งใดถูกหรือผิด จริงหรือไม่จริง โปรดใช้วิจารณญาณของคุณเองในการตัดสินใจ",
      "This section is this system's prediction according to the beliefs of this discipline. It does not decide what is right or wrong, true or untrue. Please use your own judgement.",
      "本部分是本系统依据该术数的传统信仰所作的推测，并不判定任何事情的对错或真假。请运用您自己的判断。"),
    accept: T("รับทราบ และเปิดอ่าน", "I understand, show me", "我已了解，继续查看"),
    later: T("ไม่อ่านตอนนี้", "Not now", "暂不查看"),
    fail: T("โหลดข้อมูลไม่สำเร็จ ลองอีกครั้ง", "Could not load this part. Please try again.", "加载失败，请重试。"),
    retry: T("ลองอีกครั้ง", "Try again", "重试"),
  };
  if (typeof module !== "undefined" && module.exports) { module.exports = { TEXT: TEXT, ACK_KEY: ACK, V: V }; return; }
  var W = /** @type {any} */ (root), d = document, mem = false, /** @type {any[]} */ live = [], /** @type {Record<string, Promise<any>>} */ got = {};
  var SCHOOLS = {"all":{"horoscope":["cn","th"],"bazi":["cn"],"taksa":["th"],"zodiac":["cn"],"astro":["w"]},"live":{}};
  var K = ".lq-caution-sec", CSS = K + "{margin:16px 0;padding:12px 14px;border:1px solid rgba(127,127,127,.4);border-radius:12px}" +
    K + " h3{margin:0 0 8px;font-size:1.05em}" + K + " h4{margin:14px 0 4px;font-size:1em}" + K + " h5{margin:10px 0 2px;font-size:.95em}" +
    K + " p{margin:4px 0}" + K + " ol{margin:4px 0;padding-left:1.5em}" + K + " li{margin:2px 0}" +
    K + " button{min-height:44px;padding:8px 14px;margin:6px 8px 0 0;border:1px solid;border-radius:10px;background:none;color:inherit;font:inherit}" +
    ".lq-caution-tag{font-size:.8em;opacity:.75;white-space:nowrap}.lq-caution-top{font-size:.9em;opacity:.8}" +
    "html[data-lq-calm] " + K + ",html[data-lq-crisis] " + K + "{display:none!important}";
  var calm = function () { var c = W.LQFortuneCrisis; try { return !c || !!(c.calmOn(d) || c.distress(d)); } catch (e) { return true; } };
  var acked = function () { try { return mem || W.sessionStorage.getItem(ACK) === "1"; } catch (e) { return mem; } };
  var kill = function () { live.forEach(function (s) { if (s.parentNode) s.parentNode.removeChild(s); }); live = []; };
  var el = function (tag, cls, text) { var e = d.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  var btn = function (cls, text, fn) { var b = el("button", cls, text); b.type = "button"; b.addEventListener("click", fn); return b; };
  /** load a lazy file once (a failed load is forgotten for "try again") @param {string} src */
  function load(src) {
    if (!got[src]) {
      got[src] = new Promise(function (res, rej) {
        var s = el("script", ""); s.src = src + "?v=" + V;
        s.onload = res;
        s.onerror = function () { delete got[src]; if (s.parentNode) s.parentNode.removeChild(s); rej(new Error(src)); };
        d.head.appendChild(s);
      });
    }
    return got[src];
  }
  function hook() {
    if (W.__lqCautionHook) return;
    W.__lqCautionHook = 1;
    W.addEventListener("lq-crisis", kill);
    try {
      new MutationObserver(function () { var h = d.documentElement; if (h.hasAttribute("data-lq-calm") || h.hasAttribute("data-lq-crisis")) kill(); })
        .observe(d.documentElement, { attributes: true, attributeFilter: ["data-lq-calm", "data-lq-crisis"] });
    } catch (e) { /* the CSS rule still hides it */ }
    if (!d.getElementById("lq-caution-style")) { var st = el("style", ""); st.id = "lq-caution-style"; st.textContent = CSS; d.head.appendChild(st); }
  }
  /** mount the closed section of one reading (replaces the host's earlier one) -> the section or null @param {HTMLElement} host @param {any} input */
  function mount(host, input) {
    var dr = W.LENSIQ_FORTUNE_CAUTIONS_DRAFTS === true, sc = input && ((dr ? SCHOOLS.all : SCHOOLS.live) || {})[input.domain];
    // a page with a rule it may show only (Chinese / Western: their switch; draft wording: the drafts switch)
    sc = (sc || []).filter(function (x) { return x === "th" || W.LENSIQ_FORTUNE_CAUTIONS_CN_WEST === true; });
    if (W.LENSIQ_FORTUNE_CAUTIONS !== true || !host || !sc.length) return null;
    [].slice.call(host.querySelectorAll(".lq-caution-sec")).forEach(function (/** @type {any} */ s) { s.parentNode.removeChild(s); });
    if (calm()) return null;
    hook();
    var l = input.lang || (W.LQI18N && W.LQI18N.lang) || "th", lang = l === "en" || l === "zh" ? l : "th";
    var sec = el("section", "lq-caution-sec");
    sec.setAttribute("aria-label", TEXT.title[lang]);
    var guard = function () { if (calm()) { kill(); return true; } return !sec.isConnected; };
    var clear = function () { sec.textContent = ""; sec.appendChild(el("h3", "lq-caution-title", TEXT.title[lang])); };
    function closed() {
      clear();
      sec.appendChild(btn("lq-caution-open", TEXT.open[lang], function () { if (!guard()) { if (acked()) show(); else disc(); } }));
    }
    function disc() {
      clear();
      var box = el("div", "lq-caution-disc");
      box.appendChild(el("p", "", TEXT.disclaimer[lang]));
      box.appendChild(btn("lq-caution-accept", TEXT.accept[lang], function () {
        if (guard()) return;
        mem = true;
        try { W.sessionStorage.setItem(ACK, "1"); } catch (e) { /* storage blocked: remembered for this page only */ }
        show();
      }));
      box.appendChild(btn("lq-caution-later", TEXT.later[lang], closed));
      sec.appendChild(box);
    }
    function show() {
      clear();
      load("fortune-caution-core.js").then(function () {
        return Promise.all(W.LQFortuneCautionCore.files(input.domain, lang, dr).map(load));
      }).then(function () {
        if (guard()) return;
        var C = W.LQFortuneCautionCore;
        var m = C.build(Object.assign({}, input, { lang: lang }), { drafts: dr, cnWest: W.LENSIQ_FORTUNE_CAUTIONS_CN_WEST === true });
        if (!m) { if (sec.parentNode) sec.parentNode.removeChild(sec); return; }
        clear();
        var b = el("div", "lq-caution-body");
        b.innerHTML = C.html(m);
        sec.appendChild(b);
        sec.appendChild(btn("lq-caution-close", C.LABELS.close[lang], closed));
      }, function () {
        if (guard()) return;
        clear();
        var f = el("div", "lq-caution-fail");
        f.appendChild(el("p", "", TEXT.fail[lang]));
        f.appendChild(btn("lq-caution-retry", TEXT.retry[lang], show));
        sec.appendChild(f);
      });
    }
    closed();
    host.appendChild(sec);
    live.push(sec);
    return sec;
  }
  W.LQFortuneCaution = { mount: mount, TEXT: TEXT, ACK_KEY: ACK, V: V };
})(typeof window !== "undefined" ? window : globalThis);
