// tests/e2e/research-switch.e2e.mjs — round 16 S2 customer-build switch, in headless Chrome with the REAL face-api models
// (no ?fakedet) so the network requests are real:
//   default = customer mode on every page of the fixed inventory (signage, neuro, booth, photobooth) + cameras.html#profile;
//   customer mode requests NO age_gender_model / face_expression_model weights (positive control: the research demo does);
//   the research demo toggle works from cameras.html#profile and from a page, is stored per device and switches off again;
//   a forced customer install (LENSIQ_RESEARCH_DEMO = false, or LENSIQ_PROFILE = "commercial") cannot be overridden;
//   the notice + licence label read in TH / EN / ZH and fit a 360 px phone.
import { assert } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const RESEARCH_W = /age_gender_model|face_expression_model/;
const CLEAR = "try{ if(!sessionStorage.getItem('__rs')){ localStorage.clear(); sessionStorage.setItem('__rs','1'); } }catch(e){}";
const ON = "try{ localStorage.setItem('lq-research-demo','on') }catch(e){}";
const research = page => page.requests.filter(r => RESEARCH_W.test(r.url)).map(r => r.url.replace(/^.*\//, ""));
const errorsOf = page => page.consoleErrors.filter(e => !/fonts\.(googleapis|gstatic)|favicon/.test((e.url || "") + " " + (e.text || "")));

// page -> how its face models start and which base model request proves they did
const PAGES = {
  signage: { start: async p => { await p.evaluate(() => document.getElementById("startFace").click()); }, base: /face_landmark_68_model/ },
  neuro: { start: async () => {}, base: /face_landmark_68_model/ },
  // speed pass 2026-11-14: booth loads its models when the camera opens (tests/e2e/speed-models.e2e.mjs), so it is opened
  booth: { start: async p => { await p.evaluate(() => document.getElementById("camStart").click()); }, base: /face_recognition_model/ },
  photobooth: { start: async () => {}, base: /face_landmark_68_model/ }
};

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const open = async (path, extra = []) => {
    const page = await browser.newPage(null, { initScripts: [fakeCams, "window.__LQ_FAKE_CAMS={n:1,mode:'ok'}", CLEAR, ...extra], timeout: 30000 });
    await page.goto(`${base}/${path}`);
    return page;
  };
  /** load the page with real models, start it, wait for the base face model, then settle and list research requests */
  const runPage = async (name, extra = []) => {
    const page = await open(`${name}.html?cpu&nosw`, extra);
    await page.waitFor("window.LQResearch && document.querySelector('.lq-research')", 8000);
    await PAGES[name].start(page);
    return page;
  };
  try {
    await check("default = customer mode on cameras.html#profile: toggle OFF, unlocked, licence label + F5 link", async () => {
      const page = await open("cameras.html#profile");
      await page.waitFor("document.getElementById('lqResearch')", 6000);
      const r = await page.evaluate(() => {
        const box = document.querySelector("#profile .lq-research"), cb = document.getElementById("lqResearch");
        return { profile: window.LENSIQ_PROFILE, ag: window.LENSIQ_AGE_GENDER, ex: window.LENSIQ_EXPRESSION, on: cb.checked, dis: cb.disabled,
          text: box.textContent, href: box.querySelector("a.lq-r-liclink").getAttribute("href"), store: localStorage.getItem("lq-research-demo") };
      });
      assert(r.profile === "commercial" && r.ag === false && r.ex === false, "customer flags " + JSON.stringify(r));
      assert(!r.on && !r.dis && r.store === null, "toggle off by default, not locked, nothing stored " + JSON.stringify(r));
      assert(/^.*เดโมงานวิจัย — โมเดลใบอนุญาตวิจัย \(อายุ\/เพศ, สีหน้า\) ห้ามใช้เชิงพาณิชย์/.test(r.text), "label " + r.text);
      assert(/UTKFace/.test(r.text) && /F5/.test(r.text) && r.href === "LICENSES/THIRD_PARTY.md", "licence label + link");
      assert(/ปิดอยู่ \(โหมดลูกค้า ค่าเริ่มต้น\)/.test(r.text), "state text");
      assert(!errorsOf(page).length, "console errors: " + JSON.stringify(errorsOf(page).slice(0, 3)));
      await page.close();
    });

    for (const name of Object.keys(PAGES)) {
      await check(`${name}: customer mode loads NO age/gender or expression weights (real models); research demo does (control)`, async () => {
        const page = await runPage(name);
        const st = await page.evaluate(() => ({
          profile: window.LENSIQ_PROFILE, why: document.querySelector(".lq-research .lq-r-why").textContent,
          cb: !!document.querySelector(".lq-research input[type=checkbox]")
        }));
        assert(st.profile === "commercial" && /โหมดลูกค้า/.test(st.why) && /F5/.test(st.why) && st.cb, `${name}: notice ` + JSON.stringify(st));
        if (name === "neuro") {
          // the page opens and explains; the expression model is its core, so the camera is not opened at all
          await page.waitFor("/โหมดลูกค้า: ปิดโมเดลสีหน้า/.test(document.getElementById('engine').textContent)", 6000);
          await sleep(2500);
          assert(await page.evaluate(() => !document.getElementById("video").srcObject), "neuro: camera not opened");
          assert(!page.requests.some(r => /_model/.test(r.url)), "neuro: no face model requested at all");
        } else {
          await page.waitFor(`performance.getEntriesByType("resource").some(e => ${PAGES[name].base}.test(e.name))`, 45000);
          await sleep(2500);
        }
        assert(research(page).length === 0, `${name}: research weights requested in customer mode: ` + research(page).join(", "));
        if (name === "signage") {
          const hidden = await page.evaluate(() => document.getElementById("demoOpt").hidden && [...document.querySelectorAll('[data-lic="expr"]')].every(e => e.hidden));
          assert(hidden, "signage: age/gender option + expression labels not shown");
        }
        if (name === "booth") await page.waitFor("/ปิดโมเดลสีหน้าในโหมดลูกค้า/.test(document.getElementById('emo').textContent)", 4000);
        await page.close();

        const ctl = await runPage(name, [ON]);
        assert(await ctl.evaluate(() => window.LENSIQ_PROFILE === "demo" && document.querySelector(".lq-research input").checked), `${name}: research demo on`);
        await ctl.waitFor(`performance.getEntriesByType("resource").some(e => /face_expression_model/.test(e.name))`, 45000);
        assert(research(ctl).some(u => /face_expression_model/.test(u)), `${name}: control sees the expression request`);
        await ctl.close();
      });
    }

    await check("toggle works: cameras.html#profile ON -> stored per device, reload = demo; OFF again -> customer", async () => {
      const page = await open("cameras.html#profile");
      await page.waitFor("document.getElementById('lqResearch')", 6000);
      let nav = page.waitFor("window.LENSIQ_PROFILE === 'demo'", 8000);
      await page.evaluate(() => document.getElementById("lqResearch").click());
      await nav;
      await page.waitFor("document.getElementById('lqResearch') && document.getElementById('lqResearch').checked", 6000);
      assert(await page.evaluate(() => localStorage.getItem("lq-research-demo") === "on" && window.LENSIQ_EXPRESSION === true &&
        /เปิดอยู่ในเครื่องนี้เท่านั้น/.test(document.querySelector(".lq-r-state").textContent)), "on + stored");
      // the same device, another page: on there too; switch it off from the page itself
      await page.goto(`${base}/neuro.html?cpu&nosw&fakedet`);
      await page.waitFor("window.__nm && window.__nm.ready", 8000);
      assert(await page.evaluate(() => document.getElementById("lqResearch-neuro").checked &&
        /เดโมงานวิจัยเปิดอยู่/.test(document.querySelector(".lq-r-why").textContent)), "neuro sees the device setting");
      nav = page.waitFor("window.LENSIQ_PROFILE === 'commercial' && document.getElementById('lqResearch-neuro')", 8000);
      await page.evaluate(() => document.getElementById("lqResearch-neuro").click());
      await nav;
      assert(await page.evaluate(() => localStorage.getItem("lq-research-demo") === "off" && !document.getElementById("lqResearch-neuro").checked && !window.__nm.ready), "off again from the page");
      await page.close();
    });

    for (const [label, op] of [["LENSIQ_RESEARCH_DEMO = false", "window.LENSIQ_RESEARCH_DEMO = false"], ["LENSIQ_PROFILE = \"commercial\"", "window.LENSIQ_PROFILE = 'commercial'"]]) {
      await check(`forced customer install (${label}) + stored toggle "on": stays customer, toggle locked, no research weights`, async () => {
        const page = await runPage("signage", [ON, op]);
        const r = await page.evaluate(() => {
          const cb = document.querySelector(".lq-research input");
          const before = cb.checked; cb.click();
          return { profile: window.LENSIQ_PROFILE, locked: window.LENSIQ_RESEARCH.locked, dis: cb.disabled, before, after: cb.checked, set: window.LQResearch.set(true),
            store: localStorage.getItem("lq-research-demo"), st: document.querySelector(".lq-r-state").textContent };
        });
        assert(r.profile === "commercial" && r.locked && r.dis && !r.before && !r.after && r.set === false, "locked " + JSON.stringify(r));
        assert(r.store === "on", "the stored value is simply ignored " + r.store);
        assert(/ผู้ติดตั้งล็อกโหมดลูกค้าไว้/.test(r.st), "locked text " + r.st);
        await page.waitFor(`performance.getEntriesByType("resource").some(e => /face_landmark_68_model/.test(e.name))`, 45000);
        await sleep(2000);
        assert(research(page).length === 0, "research weights requested: " + research(page).join(", "));
        await page.reload();
        assert(await page.evaluate(() => window.LENSIQ_PROFILE === "commercial"), "still customer after reload");
        await page.close();
      });
    }

    await check("notice + licence label in English and Chinese (no Thai), fits 360 px on all five pages", async () => {
      const page = await open("cameras.html?nosw&lang=en#profile");
      await page.waitFor("document.querySelector('.lq-research') && /^Research demo/.test(document.querySelector('.lq-research label').textContent)", 8000);
      const en = await page.evaluate(() => document.querySelector(".lq-research").textContent);
      assert(/Research demo — research-licence models \(age\/gender, expression\), not for commercial use/.test(en) && !/[฀-๿]/.test(en), "en " + en);
      await page.goto(`${base}/cameras.html?nosw&lang=zh#profile`);
      await page.waitFor("document.querySelector('.lq-research') && /^研究演示/.test(document.querySelector('.lq-research label').textContent)", 8000);
      const zh = await page.evaluate(() => document.querySelector(".lq-research").textContent);
      assert(/研究许可模型/.test(zh) && !/[฀-๿]/.test(zh), "zh " + zh);
      // live language switch re-fills the text
      await page.evaluate(() => window.LQI18N.setLang("en"));
      await page.waitFor("/^Research demo/.test(document.querySelector('.lq-research label').textContent)", 4000);
      await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 760, deviceScaleFactor: 1, mobile: true });
      const wide = [];
      for (const pg of ["cameras.html#profile", "signage.html?cpu&fakedet&nosw", "neuro.html?cpu&fakedet&nosw", "booth.html?cpu&fakedet&nosw", "photobooth.html?cpu&fakedet&nosw"]) {
        await page.goto(`${base}/${pg}`);
        await page.waitFor("document.querySelector('.lq-research')", 8000);
        await sleep(300);
        const r = await page.evaluate(() => {
          const b = document.querySelector(".lq-research").getBoundingClientRect();
          return { right: b.right, sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth };
        });
        if (r.right > r.cw + 1 || r.sw > r.cw) wide.push(pg + " " + JSON.stringify(r));
      }
      assert(!wide.length, "overflow at 360 px: " + wide.join("; "));
      await page.close();
    });
  } finally {
    await browser.close();
  }
}
