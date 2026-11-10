// tools/lib/xls-biff8.mjs — minimal, dependency-free reader for legacy Excel 97–2003 .xls files (CFB container +
// BIFF8 workbook stream). Build-time only (tools/pc-tmt-build.mjs); never shipped to the browser.
//
//   readXls(buffer) -> {sheets: [{name, rows: string[][]}]}   every cell as a string ("" when empty)
//
// Supported cells: LABELSST (shared strings, CONTINUE-split strings handled), LABEL, NUMBER, RK, MULRK, FORMULA (+STRING),
// BOOLERR. Not supported (not used by the TMT files): encrypted workbooks, BIFF5 and older, rich formatting.
// Written for LENSIQ round 17 P4 because no XLS parser is a dependency of this repo (MIT, same as the repo).

const ENDOFCHAIN = 0xfffffffe;

/** Read a CFB (OLE2) container and return the bytes of the named stream. @param {Buffer} b @param {string[]} names */
export function cfbStream(b, names) {
  if (b.readUInt32LE(0) !== 0xe011cfd0 || b.readUInt32LE(4) !== 0xe11ab1a1) throw new Error("not a CFB / .xls file");
  const secSize = 1 << b.readUInt16LE(30), miniSize = 1 << b.readUInt16LE(32);
  const nFat = b.readUInt32LE(44), dirStart = b.readUInt32LE(48), miniCutoff = b.readUInt32LE(56);
  const miniFatStart = b.readUInt32LE(60), difatStart = b.readUInt32LE(68), nDifat = b.readUInt32LE(72);
  const sec = n => b.subarray(512 + n * secSize, 512 + (n + 1) * secSize);
  const fatSecs = [];
  for (let i = 0; i < 109 && fatSecs.length < nFat; i++) fatSecs.push(b.readUInt32LE(76 + i * 4));
  for (let d = difatStart, k = 0; k < nDifat && d !== ENDOFCHAIN; k++) {
    const s = sec(d);
    for (let i = 0; i < secSize / 4 - 1 && fatSecs.length < nFat; i++) fatSecs.push(s.readUInt32LE(i * 4));
    d = s.readUInt32LE(secSize - 4);
  }
  const fat = [];
  for (const f of fatSecs) { const s = sec(f); for (let i = 0; i < secSize / 4; i++) fat.push(s.readUInt32LE(i * 4)); }
  const chain = (start, table) => { const out = []; for (let s = start, g = 0; s !== ENDOFCHAIN && s < table.length && g < 1e7; g++) { out.push(s); s = table[s]; } return out; };
  const read = (start, size) => Buffer.concat(chain(start, fat).map(sec)).subarray(0, size);
  const dir = read(dirStart, chain(dirStart, fat).length * secSize);
  const entries = [];
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const nl = dir.readUInt16LE(o + 64);
    entries.push({ name: dir.subarray(o, o + Math.max(0, nl - 2)).toString("utf16le"), type: dir[o + 66], start: dir.readUInt32LE(o + 116), size: dir.readUInt32LE(o + 120) });
  }
  const e = entries.find(x => names.includes(x.name) && x.type === 2);
  if (!e) throw new Error("stream not found: " + names.join(" / "));
  if (e.size >= miniCutoff) return read(e.start, e.size);
  const root = entries[0];
  const miniStream = read(root.start, root.size);
  const miniFat = [];
  for (const s of chain(miniFatStart, fat)) { const x = sec(s); for (let i = 0; i < secSize / 4; i++) miniFat.push(x.readUInt32LE(i * 4)); }
  return Buffer.concat(chain(e.start, miniFat).map(n => miniStream.subarray(n * miniSize, (n + 1) * miniSize))).subarray(0, e.size);
}

/** Decode an RK number. @param {number} rk */
function rkValue(rk) {
  let v;
  if (rk & 2) v = rk >> 2;
  else { const buf = Buffer.alloc(8); buf.writeUInt32LE(rk & 0xfffffffc, 4); v = buf.readDoubleLE(0); }
  return rk & 1 ? v / 100 : v;
}
const num = v => (Number.isInteger(v) ? String(v) : String(Math.round(v * 1e9) / 1e9));

/** Shared string table from the SST record and its CONTINUE records. @param {Buffer[]} parts */
function readSst(parts) {
  let pi = 0, p = 8;
  const total = parts[0].readUInt32LE(4);
  const out = [];
  const need = () => { if (p >= parts[pi].length) { pi++; p = 0; if (pi >= parts.length) throw new Error("SST truncated"); } };
  const skip = n => { while (n > 0) { need(); const k = Math.min(n, parts[pi].length - p); p += k; n -= k; } };
  for (let i = 0; i < total && pi < parts.length; i++) {
    need();
    const cur = () => parts[pi];
    const cch = cur().readUInt16LE(p); p += 2;
    let flags = cur()[p]; p += 1;
    let rt = 0, sz = 0;
    if (flags & 8) { rt = cur().readUInt16LE(p); p += 2; }
    if (flags & 4) { sz = cur().readUInt32LE(p); p += 4; }
    let s = "", left = cch;
    while (left > 0) {
      if (p >= cur().length) { pi++; p = 0; flags = parts[pi][p]; p += 1; } // a CONTINUE restates the char width
      const wide = flags & 1, avail = Math.floor((cur().length - p) / (wide ? 2 : 1)), n = Math.min(left, avail);
      s += wide ? cur().subarray(p, p + n * 2).toString("utf16le") : cur().subarray(p, p + n).toString("latin1");
      p += n * (wide ? 2 : 1); left -= n;
    }
    skip(rt * 4 + sz);
    out.push(s);
  }
  return out;
}

/** @param {Buffer} buf @returns {{sheets: {name: string, rows: string[][]}[]}} */
export function readXls(buf) {
  const wb = cfbStream(buf, ["Workbook", "Book"]);
  const recs = [];
  for (let o = 0; o + 4 <= wb.length;) { const t = wb.readUInt16LE(o), l = wb.readUInt16LE(o + 2); recs.push({ t, o, d: wb.subarray(o + 4, o + 4 + l) }); o += 4 + l; }
  const sheets = [];
  let sst = [];
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.t === 0x0085) { // BOUNDSHEET
      const cch = r.d[6], wide = r.d[7] & 1;
      sheets.push({ off: r.d.readUInt32LE(0), name: wide ? r.d.subarray(8, 8 + cch * 2).toString("utf16le") : r.d.subarray(8, 8 + cch).toString("latin1"), rows: [] });
    } else if (r.t === 0x00fc) { // SST + CONTINUE
      const parts = [r.d];
      while (recs[i + 1] && recs[i + 1].t === 0x003c) parts.push(recs[++i].d);
      sst = readSst(parts);
    }
  }
  const byOff = new Map(recs.map((r, i) => [r.o, i]));
  for (const sh of sheets) {
    const rows = sh.rows, set = (r, c, v) => { (rows[r] = rows[r] || [])[c] = v; };
    let pendingFormula = null;
    for (let i = (byOff.get(sh.off) ?? recs.length) + 1; i < recs.length && recs[i].t !== 0x000a; i++) {
      const { t, d } = recs[i];
      if (t === 0x00fd) set(d.readUInt16LE(0), d.readUInt16LE(2), sst[d.readUInt32LE(6)] ?? "");
      else if (t === 0x0203) set(d.readUInt16LE(0), d.readUInt16LE(2), num(d.readDoubleLE(6)));
      else if (t === 0x027e) set(d.readUInt16LE(0), d.readUInt16LE(2), num(rkValue(d.readUInt32LE(6))));
      else if (t === 0x00bd) {
        const r = d.readUInt16LE(0), c0 = d.readUInt16LE(2), n = (d.length - 6) / 6;
        for (let k = 0; k < n; k++) set(r, c0 + k, num(rkValue(d.readUInt32LE(4 + k * 6 + 2))));
      } else if (t === 0x0204) {
        const cch = d.readUInt16LE(6), wide = d[8] & 1;
        set(d.readUInt16LE(0), d.readUInt16LE(2), wide ? d.subarray(9, 9 + cch * 2).toString("utf16le") : d.subarray(9, 9 + cch).toString("latin1"));
      } else if (t === 0x0006) {
        const r = d.readUInt16LE(0), c = d.readUInt16LE(2);
        if (d.readUInt16LE(12) === 0xffff && d[6] === 0) pendingFormula = [r, c];
        else if (d.readUInt16LE(12) === 0xffff) set(r, c, d[6] === 1 ? String(!!d[8]) : "");
        else set(r, c, num(d.readDoubleLE(6)));
      } else if (t === 0x0207 && pendingFormula) {
        const cch = d.readUInt16LE(0), wide = d[2] & 1;
        set(pendingFormula[0], pendingFormula[1], wide ? d.subarray(3, 3 + cch * 2).toString("utf16le") : d.subarray(3, 3 + cch).toString("latin1"));
        pendingFormula = null;
      } else if (t === 0x0205) set(d.readUInt16LE(0), d.readUInt16LE(2), d[7] ? "#ERR" : String(!!d[6]));
    }
    for (let r = 0; r < rows.length; r++) { const row = rows[r] || []; rows[r] = Array.from({ length: row.length }, (_, k) => (row[k] == null ? "" : String(row[k]))); }
  }
  return { sheets: sheets.map(s => ({ name: s.name, rows: s.rows })) };
}
