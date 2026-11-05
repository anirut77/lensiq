pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js";

const $ = s => document.querySelector(s);
const drop = $("#drop"), input = $("#file"), list = $("#files");
const MAX_MB = 50;

drop.onclick = () => input.click();
drop.onkeydown = e => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), input.click());
["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
drop.addEventListener("drop", e => handle(e.dataTransfer.files));
input.onchange = () => { handle(input.files); input.value = ""; };

function handle(files) {
  [...files].forEach(f => {
    const li = document.createElement("li");
    li.innerHTML = `<div class="info"><div class="name"></div><div class="status">กำลังเตรียม...</div><div class="bar"><i></i></div></div>`;
    li.querySelector(".name").textContent = f.name;
    list.prepend(li);
    const status = li.querySelector(".status"), bar = li.querySelector("i");
    const fail = m => { status.textContent = m; status.classList.add("err"); li.querySelector(".bar").remove(); };

    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return fail("ไม่ใช่ไฟล์ PDF");
    if (f.size > MAX_MB * 1048576) return fail(`ไฟล์ใหญ่เกิน ${MAX_MB} MB`);

    status.textContent = "กำลังแปลง (คงรูปแบบต้นฉบับ) อาจใช้เวลาสักครู่...";
    bar.style.width = "60%"; bar.style.transition = "width 20s linear";
    convertOnServer(f).catch(err => {
      if (!err.network) throw err;           // เซิร์ฟเวอร์ตอบมาแล้วว่าแปลงไม่ได้ -> แสดงข้อความนั้น
      status.textContent = "ไม่พบเซิร์ฟเวอร์แปลง ใช้โหมดข้อความอย่างเดียวแทน...";
      bar.style.transition = "";
      return convert(f, (p, total) => {      // สำรอง: แปลงในเบราว์เซอร์ (ไม่คงเลย์เอาต์)
        status.textContent = `โหมดข้อความ กำลังแปลงหน้า ${p}/${total}`;
        bar.style.width = (p / total * 100) + "%";
      });
    }).then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.className = "btn primary"; a.textContent = "ดาวน์โหลด .docx";
      a.href = url; a.download = f.name.replace(/\.pdf$/i, "") + ".docx";
      li.querySelector(".bar").remove();
      status.textContent = "แปลงเสร็จแล้ว";
      li.append(a);
    }).catch(err => {
      console.error(err);
      fail(err.code === "SCANNED" || err.server ? err.message : err.name === "PasswordException" ? "ไฟล์มีรหัสผ่าน ไม่รองรับ" : "แปลงไม่สำเร็จ: " + (err.message || "ไฟล์อาจเสียหาย"));
    });
  });
}

// แปลงบนเซิร์ฟเวอร์ด้วย pdf2docx เพื่อคงเลย์เอาต์ ตาราง และรูปภาพ
async function convertOnServer(file) {
  const fd = new FormData(); fd.append("file", file);
  let res;
  try { res = await fetch("/api/convert", { method: "POST", body: fd }); }
  catch (e) { e.network = true; throw e; }
  if (res.status === 404 || res.status === 405 || res.status === 501) { const e = new Error("no server"); e.network = true; throw e; }
  if (!res.ok) {
    let msg = "แปลงไม่สำเร็จ";
    try { msg = (await res.json()).error || msg; } catch {}
    const e = new Error(msg); e.server = true; throw e;
  }
  return res.blob();
}

// รวม text item ของหน้าให้เป็นบรรทัด แล้วรวมบรรทัดเป็นย่อหน้า
function pageToLines(items) {
  const rows = [];
  items.filter(i => i.str.trim() !== "" || i.hasEOL).forEach(i => {
    const size = Math.abs(i.transform[3]) || i.height || 10;
    const x = i.transform[4], y = i.transform[5];
    let row = rows.find(r => Math.abs(r.y - y) < Math.max(2, size * 0.35));
    if (!row) rows.push(row = { y, items: [] });
    row.items.push({ str: i.str, x, w: i.width, size });
  });
  rows.sort((a, b) => b.y - a.y);
  return rows.map(r => {
    r.items.sort((a, b) => a.x - b.x);
    let text = "", end = null, size = 0, n = 0;
    r.items.forEach(it => {
      if (end !== null && it.x - end > it.size * 0.25 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += " ";
      text += it.str; end = it.x + it.w; size += it.size * it.str.length; n += it.str.length;
    });
    return { y: r.y, x: r.items[0].x, text: text.trim(), size: n ? size / n : 10 };
  }).filter(l => l.text);
}

async function convert(file, onProgress) {
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    pages.push(pageToLines((await page.getTextContent()).items));
    onProgress(p, pdf.numPages);
  }
  const all = pages.flat();
  if (!all.length) {
    const e = new Error("ไม่พบข้อความ (อาจเป็น PDF ภาพสแกน ต้องทำ OCR ก่อน)");
    e.code = "SCANNED"; throw e;
  }

  // ขนาดตัวอักษรหลัก = ค่ากลางของทั้งเอกสาร
  const sizes = all.map(l => l.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 11;

  const { Document, Packer, Paragraph, TextRun } = docx;
  const children = [];
  pages.forEach((lines, pi) => {
    let cur = null, prev = null;
    const flush = () => { if (cur) children.push(cur.build()); cur = null; };
    lines.forEach(l => {
      const heading = l.size >= body * 1.25;
      const gap = prev ? prev.y - l.y : 0;
      const newPara = !cur || heading || cur.heading || gap > Math.max(prev.size, l.size) * 1.7;
      if (newPara) {
        flush();
        cur = {
          heading, text: l.text, size: l.size,
          build() {
            return new Paragraph({
              pageBreakBefore: pi > 0 && children.length === 0 ? false : this.pb,
              spacing: { after: 120 },
              children: [new TextRun({ text: this.text, bold: this.heading, size: Math.round(this.size * 2) })]
            });
          }
        };
        if (!prev && pi > 0) cur.pb = true;
      } else {
        // ต่อบรรทัดในย่อหน้าเดียวกัน ไม่ใส่ช่องว่างให้ภาษาไทยต่อกัน
        const thai = /[฀-๿]$/.test(cur.text) && /^[฀-๿]/.test(l.text);
        cur.text += (thai ? "" : " ") + l.text;
      }
      prev = l;
    });
    flush();
  });

  const doc = new Document({ sections: [{ children }] });
  return Packer.toBlob(doc);
}
