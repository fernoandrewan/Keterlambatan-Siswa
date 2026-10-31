/* pdf.js — penulis PDF 1.4 minimal, dibuat langsung dari halaman hasil Layout.plan (bukan gambar yang dibungkus PDF).
   - Teks asli (dapat dicari/disalin) memakai font standar-14 Helvetica & Helvetica-Bold, sandi WinAnsi; font TIDAK disematkan.
   - Persegi digambar sebagai vektor; ukuran halaman mengikuti Layout (A4 potret/lanskap).
   - Tanpa kompresi: sederhana & aman (PDF teks tetap kecil). Tanpa pustaka luar, bekerja offline.
   - Struktur: Catalog, Pages, 2 font, Info, lalu pasangan Page + Contents per halaman; tabel xref dan trailer ditulis dengan offset byte yang tepat.
   Karakter di luar WinAnsi tidak dapat digambar: diganti "?" dan dihitung (hasil.lost) agar pengguna diberi peringatan. */
'use strict';
const PDF = (() => {
  const enc = new TextEncoder(), tick = () => new Promise(r => setTimeout(r, 0));
  const num = v => { const r = Math.round(v * 100) / 100; return r === 0 ? '0' : String(r); };
  const colorCache = new Map();
  const rgb = h => { let c = colorCache.get(h); if (!c) { c = [1, 3, 5].map(i => { const v = Math.round((parseInt(h.slice(i, i + 2), 16) / 255) * 1000) / 1000; return v === 0 ? '0' : String(v); }).join(' '); colorCache.set(h, c); } return c; };
  const hex2 = b => (b < 16 ? '0' : '') + b.toString(16);
  const hexOf = bytes => { let s = ''; for (let i = 0; i < bytes.length; i++) s += hex2(bytes[i]); return s; };
  // Teks Info (judul dll.) sebagai string UTF-16BE ber-BOM agar aksara apa pun aman.
  const textStr = s => { let h = 'FEFF'; for (const ch of String(s)) { let cp = ch.codePointAt(0); if (cp > 0xffff) { cp -= 0x10000; const hi = 0xd800 + (cp >> 10), lo = 0xdc00 + (cp & 1023); h += hi.toString(16).padStart(4, '0') + lo.toString(16).padStart(4, '0'); } else h += cp.toString(16).padStart(4, '0'); } return `<${h}>`; };
  const dateStr = d => { const p = n => String(n).padStart(2, '0'); return `(D:${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z)`; };

  // Isi aliran konten satu halaman. Koordinat tata letak: y ke bawah; PDF: y ke atas.
  function content(page) {
    const out = []; let fill = '', font = '', lost = 0;
    if (page.bg && page.bg.toLowerCase() !== '#ffffff') { out.push(`${rgb(page.bg)} rg`, `0 0 ${num(page.w)} ${num(page.h)} re f`); fill = page.bg; }
    for (const o of page.ops) {
      if (o.c !== fill) { out.push(`${rgb(o.c)} rg`); fill = o.c; }
      if (o.t === 'r') out.push(`${num(o.x)} ${num(page.h - o.y - o.h)} ${num(o.w)} ${num(o.h)} re f`);
      else {
        const e = PDFFonts.encode(o.s); lost += e.lost;
        const f = `/F${o.b ? 2 : 1} ${num(o.z)} Tf`; if (f !== font) { out.push(f); font = f; }
        out.push(`BT ${num(o.x)} ${num(page.h - o.y)} Td <${hexOf(e.bytes)}> Tj ET`);
      }
    }
    return { text: out.join('\n'), lost };
  }

  /* pages: [{w,h,bg,ops}] → { blob, bytes, pages, lost }. Baris panjang dipecah per halaman, dengan penyerahan kendali ke UI di antaranya. */
  async function build(pages, { title = '', subject = '', creator = 'Pencatatan Keterlambatan Siswa SMK Negeri 1 Bitung', signal, onProgress } = {}) {
    if (!pages.length) throw new Error('Tidak ada halaman untuk PDF.');
    const chunks = []; let off = 0, lost = 0; const offs = [];
    const push = u8 => { chunks.push(u8); off += u8.length; };
    const str = s => push(enc.encode(s));
    const obj = (n, body) => { offs[n] = off; str(`${n} 0 obj\n${body}\nendobj\n`); };
    push(Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a, 0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a));       // %PDF-1.4 + komentar biner
    const N = pages.length, first = 6, pageObj = i => first + 2 * i, kids = pages.map((_, i) => `${pageObj(i)} 0 R`).join(' ');
    obj(1, '<< /Type /Catalog /Pages 2 0 R /Lang (id-ID) >>');
    obj(2, `<< /Type /Pages /Kids [${kids}] /Count ${N} >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(5, `<< /Title ${textStr(title)} /Subject ${textStr(subject)} /Creator ${textStr(creator)} /Producer ${textStr(creator)} /CreationDate ${dateStr(new Date())} >>`);
    for (let i = 0; i < N; i++) {
      if (signal && signal.aborted) { const e = new Error('Dibatalkan.'); e.cancelled = true; throw e; }
      if (onProgress) onProgress(i, N);
      const p = pages[i], c = content(p); lost += c.lost;
      const body = enc.encode(c.text);
      obj(pageObj(i), `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageObj(i) + 1} 0 R >>`);
      offs[pageObj(i) + 1] = off; str(`${pageObj(i) + 1} 0 obj\n<< /Length ${body.length} >>\nstream\n`); push(body); str('\nendstream\nendobj\n');
      if ((i & 7) === 7) await tick();
    }
    const total = first + 2 * N, xref = off;
    let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
    for (let n = 1; n < total; n++) x += String(offs[n]).padStart(10, '0') + ' 00000 n \n';
    x += `trailer\n<< /Size ${total} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    str(x);
    if (onProgress) onProgress(N, N);
    const blob = new Blob(chunks, { type: 'application/pdf' });
    return { blob, bytes: blob.size, pages: N, lost };
  }
  return { build };
})();
