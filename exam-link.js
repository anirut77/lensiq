/* exam-link.js — LQExamLink: moves LENSIQ Exam messages (JSON events, never frames) between the candidate / camera pages
 * and the room dashboard. Every message in and out goes through LQExam.cleanMsg() (strict allowlist; unknown keys reject
 * the whole message).
 *
 * Transports
 *   1. BroadcastChannel "lq-exam:<room>" — same browser on the same device (demo, or a dashboard tab next to a node tab).
 *   2. Relay (optional, OFF unless configured): a LAN/server relay with a pairing code, modelled on the multi-device
 *      /api/agg pattern of store.html. Configure with window.LENSIQ_EXAM_RELAY = "https://host" or the page's advanced
 *      settings. Endpoints (to be provided by server.py or backend/ — see docs/EXAM.md):
 *        POST {relay}/api/exam/push   Authorization: Bearer <code>   body {msgs:[...]}   -> {ok:true}
 *        GET  {relay}/api/exam/pull?room=&since=   Authorization: Bearer <code>   -> {msgs:[...], next}
 *      The page CSP connect-src must list the relay origin when it is not same-origin.
 *   3. File: exportFile(msgs) downloads a JSON array; the dashboard imports it (no network at all).
 *
 * API: create({room, onMessage(msg, via), relay?, code?, pollMs=2000}) -> {send(msg) -> boolean, close(), relayOn, sent, recv}
 *      newNodeId() -> 12 lowercase letters/digits (random per device, not tied to a person)
 *      exportFile(name, msgs) · parseFile(text) -> {msgs, rejected}
 */
(function (root) {
  "use strict";
  const E = () => root.LQExam;
  function newNodeId() {
    const a = new Uint8Array(12); (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach((_, i) => { a[i] = Math.random() * 256; });
    return Array.from(a, b => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
  }
  function relayBase(opt) {
    const v = String(opt || root.LENSIQ_EXAM_RELAY || "").trim().replace(/\/+$/, "");
    if (!v) return "";
    try { const u = new URL(v, root.location && root.location.href); return u.protocol === "https:" || u.hostname === "localhost" || u.hostname === "127.0.0.1" ? u.origin : ""; } catch (e) { return ""; }
  }
  /** @param {{room?: string, onMessage?: (m: any, via: string) => void, relay?: string, code?: string, pollMs?: number}} [o] */
  function create({ room, onMessage, relay, code, pollMs = 2000 } = {}) {
    let bc = null, closed = false, timer = null, since = 0, queue = [];
    const stats = { sent: 0, recv: 0, rejected: 0, relayErr: 0 };
    const base = relayBase(relay), token = String(code || "").trim();
    const deliver = (m, via) => {
      const c = E().cleanMsg(m);
      if (!c.ok || c.msg.room !== room) { stats.rejected++; return; }
      stats.recv++; try { onMessage && onMessage(c.msg, via); } catch (e) { console.warn(e); }
    };
    try { bc = new BroadcastChannel("lq-exam:" + room); bc.onmessage = e => deliver(e.data, "local"); } catch (e) { bc = null; }
    async function flush() {
      if (!base || !token || !queue.length) return;
      const msgs = queue.splice(0, 50);
      try {
        const r = await fetch(base + "/api/exam/push", { method: "POST", cache: "no-store", credentials: "omit", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ msgs }) });
        if (!r.ok) throw new Error("HTTP " + r.status);
      } catch (e) { stats.relayErr++; queue = msgs.concat(queue).slice(-500); }
    }
    async function poll() {
      if (closed) return;
      try {
        const r = await fetch(`${base}/api/exam/pull?room=${encodeURIComponent(room)}&since=${since}`, { cache: "no-store", credentials: "omit", headers: { Authorization: "Bearer " + token } });
        if (r.ok) { const j = await r.json(); (j.msgs || []).forEach(m => deliver(m, "relay")); if (Number.isFinite(j.next)) since = j.next; }
        else stats.relayErr++;
      } catch (e) { stats.relayErr++; }
      await flush();
      if (!closed) timer = setTimeout(poll, pollMs);
    }
    if (base && token) timer = setTimeout(poll, 50);
    return {
      send(m) {
        const c = E().cleanMsg(m);
        if (!c.ok) { stats.rejected++; return false; }
        stats.sent++;
        if (bc) try { bc.postMessage(c.msg); } catch (e) { /* closed */ }
        if (base && token) { queue.push(c.msg); if (queue.length > 500) queue.shift(); }
        return true;
      },
      close() { closed = true; clearTimeout(timer); try { bc && bc.close(); } catch (e) { /* ignore */ } },
      get relayOn() { return !!(base && token); }, get local() { return !!bc; }, stats
    };
  }
  function exportFile(name, msgs) {
    const b = new Blob([JSON.stringify({ format: "lensiq-exam", v: 1, msgs })], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name; document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function parseFile(text) {
    let j; try { j = JSON.parse(text); } catch (e) { return { msgs: [], rejected: 1, error: "json" }; }
    const list = Array.isArray(j) ? j : j && j.format === "lensiq-exam" && Array.isArray(j.msgs) ? j.msgs : null;
    if (!list) return { msgs: [], rejected: 1, error: "format" };
    const msgs = [], out = { msgs, rejected: 0 };
    for (const m of list.slice(0, 20000)) { const c = E().cleanMsg(m); if (c.ok) msgs.push(c.msg); else out.rejected++; }
    return out;
  }
  root.LQExamLink = { create, newNodeId, exportFile, parseFile, relayBase };
})(typeof self !== "undefined" ? self : this);
