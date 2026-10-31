/* layout.js — mesin tata letak ekspor visual: "Tabel standar" dan "Matriks Kelas".
   MURNI: tanpa DOM/canvas/IndexedDB. Menerima data + preferensi + fungsi ukur teks, mengembalikan daftar halaman berisi operasi gambar
   (persegi, teks) yang sama untuk semua backend (canvas PNG/JPG dan penulis PDF). Jadi gambar dan PDF selalu berisi data yang sama.

   Jaminan:
   - Tidak ada nama yang dipotong: nama panjang dibungkus ke beberapa baris (kata yang lebih lebar dari kolom dipecah per karakter).
   - Tidak ada baris/nama yang hilang diam-diam: setiap tata letak diperiksa (verify) — setiap catatan harus tercatat tepat satu kali.
   - Ukuran dihitung SEBELUM menggambar (batas sisi & luas piksel kanvas); isi yang terlalu besar dibagi menjadi beberapa gambar/halaman,
     dengan batas pemotongan di tepi tingkat kelas → jurusan → rombel bila memungkinkan, dan judul kolom diulang di tiap bagian.
   - PDF: isi dijaga agar tidak melewati lebar halaman A4 (di dalam margin). Tabel yang kolom tetapnya + kolom Nama (min. 8 em) tak muat pada ukuran
     teks yang dipilih dikecilkan per 0,5 pt sampai muat (selalu disertai peringatan); matriks diperkecil dahulu, lalu dipecah per kolom, dan hanya bila itu
     belum cukup lebar satu kolom dibatasi lebar halaman (nama dibungkus). Kasus yang tetap tak muat (label jurusan ekstrem panjang) tidak disembunyikan:
     setelah tata letak selesai, plan() mengukur isi tiap halaman PDF dan memberi peringatan bila ada yang melewati tepi kanan/bawah halaman. */
'use strict';
const Layout = (() => {
  const FONT = '"Helvetica Neue", Helvetica, Arial, "Liberation Sans", Roboto, "Noto Sans", sans-serif';

  /* ---------- skema warna ---------- */
  const SCHEMES = {
    biru: { name: 'Biru (bawaan)', bg: '#ffffff', text: '#1b1f2a', muted: '#5a6275', head: '#2c3e91', headText: '#ffffff', band: '#e3e8f8', zebra: '#f4f6fc', grid: '#c5cce0', title: '#2c3e91' },
    hijau: { name: 'Hijau', bg: '#ffffff', text: '#16231d', muted: '#52645b', head: '#1f6f50', headText: '#ffffff', band: '#dff0e8', zebra: '#f3faf6', grid: '#b9d3c6', title: '#1f6f50' },
    mono: { name: 'Hitam-putih (hemat tinta)', bg: '#ffffff', text: '#000000', muted: '#404040', head: '#e4e4e4', headText: '#000000', band: '#efefef', zebra: '#f7f7f7', grid: '#707070', title: '#000000' },
    gelap: { name: 'Gelap', bg: '#12151f', text: '#e8eaf1', muted: '#9aa3b8', head: '#8fa2f0', headText: '#0d1018', band: '#232b4d', zebra: '#1a1f2e', grid: '#3a4262', title: '#b5c1f7' },
  };
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const lum = h => { const [r, g, b] = hex(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const mix = (a, b, t) => '#' + hex(a).map((v, i) => Math.round(v * (1 - t) + hex(b)[i] * t).toString(16).padStart(2, '0')).join('');
  function palette(P) {
    if (P.scheme !== 'kustom') return SCHEMES[P.scheme] || SCHEMES.biru;
    const a = P.accent, dark = lum(a) < 0.4;
    return { name: 'Kustom', bg: '#ffffff', text: '#1b1f2a', muted: '#5a6275', head: a, headText: dark ? '#ffffff' : '#111111', band: mix(a, '#ffffff', 0.85), zebra: mix(a, '#ffffff', 0.94), grid: mix(a, '#ffffff', 0.7), title: lum(a) > 0.45 ? '#1b1f2a' : a };
  }

  /* ---------- preferensi ---------- */
  const LIMITS = { hp: { name: 'Aman untuk HP (±8 juta piksel/gambar)', side: 6000, area: 8e6 }, standar: { name: 'Standar (±16 juta piksel/gambar)', side: 8192, area: 16e6 }, besar: { name: 'Besar (±40 juta piksel/gambar, butuh memori besar)', side: 16000, area: 40e6 } };
  const DEF = { layout: 'table', format: 'png', title: 'Data Keterlambatan Siswa', school: 'SMK Negeri 1 Bitung', period: '', showSchool: true, showPeriod: true, showCount: true,
    fontSize: 16, pdfFont: 10, lineHeight: 1.4, scheme: 'biru', accent: '#2c3e91', zebra: true, grid: 'full', sort: 'order', emptyGroups: false, direction: 'across', multi: 'separate', totals: true, maxColChars: 24,
    sharp: 2, limit: 'standar', jpgQuality: 0.9, orient: 'auto' };
  const ENUMS = { layout: ['table', 'matrix'], format: ['png', 'jpg', 'pdf'], scheme: [...Object.keys(SCHEMES), 'kustom'], grid: ['full', 'rows', 'none'], sort: ['order', 'name', 'name-desc', 'class'], direction: ['across', 'stack'], multi: ['separate', 'merge'], sharp: [1, 1.5, 2, 3], limit: Object.keys(LIMITS), orient: ['auto', 'portrait', 'landscape'] };
  // Hanya kunci yang dikenal dan bernilai sah; sisanya dibuang (dipakai juga untuk membersihkan berkas impor).
  function cleanPrefs(p) {
    const o = {}; if (!p || typeof p !== 'object' || Array.isArray(p)) return o;
    Object.keys(ENUMS).forEach(k => { if (ENUMS[k].includes(p[k])) o[k] = p[k]; });
    ['showSchool', 'showPeriod', 'showCount', 'zebra', 'emptyGroups', 'totals'].forEach(k => { if (typeof p[k] === 'boolean') o[k] = p[k]; });
    const nu = (k, lo, hi, step) => { if (typeof p[k] === 'number' && Number.isFinite(p[k])) o[k] = Math.round(Math.min(hi, Math.max(lo, p[k])) / step) * step; };
    nu('fontSize', 10, 48, 1); nu('pdfFont', 6, 24, 0.5); nu('lineHeight', 1, 2.2, 0.05); nu('maxColChars', 10, 60, 1); nu('jpgQuality', 0.5, 1, 0.01);
    [['title', 120], ['school', 120], ['period', 120]].forEach(([k, n]) => { if (typeof p[k] === 'string') o[k] = p[k].replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n); });
    if (typeof p.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(p.accent)) o.accent = p.accent.toLowerCase();
    return o;
  }
  const withDefaults = p => ({ ...DEF, ...cleanPrefs(p) });

  /* ---------- utilitas ---------- */
  const key3 = (g, k, r) => `${g}|${k}|${r}`;
  const cmpName = (a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }) || a.order - b.order;
  function sortRecords(rs, mode) {
    const a = rs.slice();
    if (mode === 'name') return a.sort(cmpName);
    if (mode === 'name-desc') return a.sort((x, y) => -cmpName(x, y));
    if (mode === 'class') return a.sort((x, y) => (+x.grade || 99) - (+y.grade || 99) || Data.majorIndex(x.grade, x.majorKey) - Data.majorIndex(y.grade, y.majorKey) || (+x.rombel || 0) - (+y.rombel || 0) || cmpName(x, y));
    return a.sort((x, y) => x.order - y.order || String(x.createdAt || '').localeCompare(String(y.createdAt || '')));
  }
  const dateLong = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : String(s || ''); };
  function periodText(docs) {
    const ds = docs.map(d => d.date).filter(Boolean).sort(); if (!ds.length) return '';
    return ds[0] === ds[ds.length - 1] ? dateLong(ds[0]) : `${dateLong(ds[0])} – ${dateLong(ds[ds.length - 1])}`;
  }
  // Bungkus teks pada lebar maks. Tidak ada karakter yang dibuang: kata yang lebih lebar dari kolom dipecah per karakter.
  function wrap(text, maxW, size, bold, M) {
    const out = []; let line = '';
    const flush = () => { if (line !== '') out.push(line); line = ''; };
    for (const word of String(text).split(' ')) {
      if (word === '') continue;
      const cand = line ? line + ' ' + word : word;
      if (M.w(cand, size, bold) <= maxW) { line = cand; continue; }
      flush();
      if (M.w(word, size, bold) <= maxW) { line = word; continue; }
      let part = '';
      for (const ch of word) { if (part && M.w(part + ch, size, bold) > maxW) { out.push(part); part = ch; } else part += ch; }
      line = part;
    }
    flush(); return out.length ? out : [''];
  }
  class Ops {
    constructor() { this.a = []; this.placed = []; this.lost = 0; }
    rect(x, y, w, h, c) { if (w > 0 && h > 0) this.a.push({ t: 'r', x, y, w, h, c }); }
    text(x, y, s, z, b, c, rid) { if (s !== '') this.a.push(rid ? { t: 's', x, y, s, z, b: b ? 1 : 0, c, rid } : { t: 's', x, y, s, z, b: b ? 1 : 0, c }); }
  }
  const sum = (a, f = 0, t = a.length) => { let s = 0; for (let i = f; i < t; i++) s += a[i]; return s; };

  /* ---------- blok judul & kaki halaman ---------- */
  function headerLines(doc, P, M, fs, W, meta, cont, count) {
    const L = [], add = (s, z, b, c, after) => wrap(s, W, z, b, M).forEach((t, i, arr) => L.push({ s: t, z, b, c, after: i === arr.length - 1 ? after : 0 }));
    const pal = palette(P);
    if (cont) { add(`${P.title || 'Ekspor data'}${doc.name && meta.multi ? ' — ' + doc.name : ''} (lanjutan)`, fs * 1.05, true, pal.title, fs * 0.2); return L; }
    if (P.showSchool && P.school) add(P.school, fs * 1.1, true, pal.muted, fs * 0.15);
    if (P.title) add(P.title, fs * 1.6, true, pal.title, fs * 0.2);
    if (meta.multi && doc.name) add(doc.name, fs * 1.1, true, pal.text, fs * 0.1);
    const per = P.period || doc.periodAuto; if (P.showPeriod && per) add(per, fs, false, pal.text, fs * 0.1);
    if (meta.filterNote) add(meta.filterNote, fs * 0.9, false, pal.muted, fs * 0.1);
    if (P.showCount) add(`Jumlah siswa: ${count}`, fs * 0.95, false, pal.muted, fs * 0.1);
    return L;
  }
  const blockH = (L, line, fs) => sum(L.map(l => Math.max(l.z * (line / fs), l.z * 1.25) + l.after));
  function emitHeader(O, L, x, y, W, line, fs, M, align) {
    let yy = y;
    L.forEach(l => { const lh = Math.max(l.z * (line / fs), l.z * 1.25), tw = M.w(l.s, l.z, l.b); O.text(align === 'center' ? x + (W - tw) / 2 : x, yy + lh / 2 + l.z * 0.36, l.s, l.z, l.b, l.c); yy += lh + l.after; });
    return yy - y;
  }

  /* ---------- anggaran ukuran ---------- */
  function budget(kind, P, extra) {
    if (kind === 'pdf') {
      const land = extra.landscape, pw = land ? 841.89 : 595.28, ph = land ? 595.28 : 841.89;
      return { kind, fs: P.pdfFont, pageW: pw, pageH: ph, m: 36, fits: (w, h) => w <= pw + 0.01 && h <= ph + 0.01, maxW: pw, hMax: () => ph, minW: 0 };
    }
    const lim = LIMITS[P.limit] || LIMITS.standar, s = P.sharp, side = Math.floor(lim.side / s), fs = P.fontSize;
    return { kind, fs, scale: s, m: fs * 1.25, fits: (w, h) => w <= side && h <= side && w * h * s * s <= lim.area, maxW: side, hMax: w => Math.min(side, Math.floor(lim.area / (w * s * s))), minW: fs * 30 };
  }

  /* =====================================================================================================
     TABEL STANDAR:  No. | Tingkat Kelas | Jurusan | Rombel | Nama Siswa
     ===================================================================================================== */
  const PDF_FONT_MIN = 6;      // sama dengan batas bawah pdfFont di cleanPrefs
  function tableDoc(doc, P, M, T, meta, warn) {
    const rows = sortRecords(doc.records, P.sort).map((r, i) => ({ rid: r.id, no: String(i + 1), cls: Data.label(r.grade), major: Data.short(r.grade, r.majorKey), romb: String(r.rombel), name: r.name }));
    const H = { no: 'No.', cls: 'Tingkat Kelas', major: 'Jurusan', romb: 'Rombel', name: 'Nama Siswa' }, keys = ['no', 'cls', 'major', 'romb', 'name'];
    const needAt = (k, z) => { let w = M.w(H[k], z, true); for (const r of rows) { const x = M.w(r[k], z, false); if (x > w) w = x; } return w + 2 * (z * 0.6); };
    // PDF: lebar kolom No./Kelas/Jurusan/Rombel ikut membesar bersama ukuran teks, sedangkan halaman A4 tetap. Bila kolom Nama tidak lagi kebagian 8 em,
    // tabel menjadi lebih lebar daripada halaman dan tepi kanannya (nama, footer) terpotong. Kecilkan teks per 0,5 pt (langkah pengaturan) sampai muat.
    let fs = T.fs;
    if (T.kind === 'pdf') {
      const room = T.pageW - 2 * T.m + 0.01, fixedAt = z => ['no', 'cls', 'major', 'romb'].reduce((a, k) => a + needAt(k, z), 0), fitsAt = z => fixedAt(z) + z * 8 <= room;
      while (fs > PDF_FONT_MIN && !fitsAt(fs)) fs = Math.max(PDF_FONT_MIN, fs - 0.5);
      // Peringatan harus sesuai kenyataan: bila bahkan ukuran terkecil tak muat (label jurusan luar biasa panjang), katakan itu — jangan klaim "tetap di dalam halaman".
      if (!fitsAt(fs)) warn(`Tabel tetap lebih lebar daripada halaman A4 bahkan pada ukuran teks terkecil (${fs.toFixed(1)} pt): kolom Tingkat Kelas/Jurusan/Rombel terlalu lebar, sehingga bagian kanan tabel (kolom Nama) terpotong. Persingkat label jurusan.`);
      else if (fs < T.fs) warn(`Tabel terlalu lebar untuk satu halaman A4 pada ukuran teks ${T.fs} pt: teks dikecilkan menjadi ${fs.toFixed(1)} pt agar semua kolom tetap di dalam halaman.`);
    }
    const line = fs * P.lineHeight, px = fs * 0.6, py = fs * 0.32, m = T.m, pal = palette(P), gap = fs * 0.7, lw = Math.max(0.75, fs / 18);
    const need = k => needAt(k, fs);
    const fixed = ['no', 'cls', 'major', 'romb'].map(need);
    let nameW;
    if (T.kind === 'pdf') nameW = Math.max(fs * 8, T.pageW - 2 * m - sum(fixed)); else { nameW = Math.min(need('name'), fs * 34 + 2 * px); nameW = Math.max(nameW, M.w(H.name, fs, true) + 2 * px); const mw = T.minW - 2 * m; if (sum(fixed) + nameW < mw) nameW = mw - sum(fixed); }
    const cw = [...fixed, nameW], tableW = sum(cw), W = T.kind === 'pdf' ? T.pageW : tableW + 2 * m;
    rows.forEach(r => { r.lines = wrap(r.name, nameW - 2 * px, fs, false, M); r.h = r.lines.length * line + 2 * py; });
    const th = line + 2 * py, ft = fs * 0.9 * P.lineHeight;
    const hb1 = headerLines(doc, P, M, fs, tableW, meta, false, rows.length), hb2 = headerLines(doc, P, M, fs, tableW, meta, true, rows.length);
    const h1 = blockH(hb1, line, fs), h2 = blockH(hb2, line, fs);
    const availFor = first => T.hMax(W) - 2 * m - (first ? h1 : h2) - th - ft - 3 * gap;
    // -- pemecahan halaman (baris tidak pernah terbelah)
    const spans = []; let i = 0;
    do {
      const avail = availFor(!spans.length); let used = 0, j = i;
      while (j < rows.length && (j === i || used + rows[j].h <= avail)) { used += rows[j].h; j++; }
      spans.push({ from: i, to: j, used }); i = j;
    } while (i < rows.length);
    const n = spans.length, pages = [];
    spans.forEach((sp, pi) => {
      const O = new Ops(), first = pi === 0, hb = first ? hb1 : hb2, hh = first ? h1 : h2;
      const H0 = m + hh + gap + th + sp.used + gap + ft + m, pageH = T.kind === 'pdf' ? T.pageH : H0;
      let y = m; y += emitHeader(O, hb, m, y, tableW, line, fs, M, first ? 'center' : 'left');
      if (first && rows.length) { O.rect(m, y + gap * 0.3, tableW, lw * 1.5, pal.head); }
      y += gap;
      // judul kolom (diulang di tiap halaman)
      const xs = []; { let x = m; cw.forEach(w => { xs.push(x); x += w; }); xs.push(x); }
      O.rect(m, y, tableW, th, pal.head);
      keys.forEach((k, c) => { const tw = M.w(H[k], fs, true), x = k === 'name' || k === 'major' || k === 'cls' ? xs[c] + px : xs[c] + (cw[c] - tw) / 2; O.text(x, y + th / 2 + fs * 0.36, H[k], fs, true, pal.headText); });
      y += th;
      const top = y;
      for (let r = sp.from; r < sp.to; r++) {
        const row = rows[r];
        if (P.zebra && r % 2 === 1) O.rect(m, y, tableW, row.h, pal.zebra);
        const mid = y + py + line / 2 + fs * 0.36;
        [['no', 0], ['cls', 1], ['major', 2], ['romb', 3]].forEach(([k, c]) => { const tw = M.w(row[k], fs, false); O.text(k === 'no' || k === 'romb' ? xs[c] + (cw[c] - tw) / 2 : xs[c] + px, mid, row[k], fs, false, pal.text); });
        row.lines.forEach((ln, li) => O.text(xs[4] + px, y + py + li * line + line / 2 + fs * 0.36, ln, fs, false, pal.text, li === 0 ? row.rid : null));
        O.placed.push(row.rid);
        if (P.grid !== 'none') O.rect(m, y + row.h - lw, tableW, lw, pal.grid);
        y += row.h;
      }
      if (!rows.length) { O.text(m + px, y + th / 2 + fs * 0.36, 'Tidak ada data untuk ditampilkan.', fs, false, pal.muted); y += th; }
      if (P.grid === 'full') { for (let c = 1; c < xs.length - 1; c++) O.rect(xs[c] - lw / 2, top, lw, y - top, pal.grid); O.rect(m, top, lw, y - top, pal.grid); O.rect(m + tableW - lw, top, lw, y - top, pal.grid); }
      O.rect(m, y - lw, tableW, lw * 1.5, P.grid === 'none' ? pal.grid : pal.head);
      // kaki halaman
      const fy = (T.kind === 'pdf' ? T.pageH - m : H0 - m) - ft / 2 + fs * 0.9 * 0.36, fz = fs * 0.9, left = `Dibuat ${meta.stamp}`, right = n > 1 || T.kind === 'pdf' ? `${T.kind === 'pdf' ? 'Halaman' : 'Bagian'} ${pi + 1} dari ${n}` : '';
      O.text(m, fy, left, fz, false, pal.muted); if (right) O.text(m + tableW - M.w(right, fz, false), fy, right, fz, false, pal.muted);
      pages.push({ w: W, h: pageH, bg: pal.bg, ops: O.a, placed: O.placed, rows: sp.to - sp.from });
    });
    return { pages, names: rows.length };
  }

  /* =====================================================================================================
     MATRIKS KELAS:  Tingkat Kelas → Jurusan → Rombel → daftar nama (mendatar), dengan arah pengelompokan
     "across" (semua tingkat berdampingan) atau "stack" (tiap tingkat satu pita, bertumpuk ke bawah).
     ===================================================================================================== */
  // lim = lebar isi maksimum (PDF: lebar halaman − 2 margin; gambar: tak terbatas). Satu kolom tidak boleh lebih lebar daripada itu (nama dibungkus).
  function matrixModel(records, P, M, fs, lim = Infinity) {
    const line = fs * P.lineHeight, px = fs * 0.55, py = fs * 0.3, capW = Math.min(fs * 0.52 * P.maxColChars, lim - 2 * px);
    const byKey = new Map(), all = [];
    const mk = (g, k, r, unknown) => { const c = { grade: g, majorKey: k, rombel: r, unknown, recs: [] }; byKey.set(key3(g, k, r), c); all.push(c); return c; };
    Data.combos().forEach(c => mk(c.grade, c.majorKey, c.rombel, false));
    records.forEach(r => (byKey.get(key3(r.grade, r.majorKey, r.rombel)) || mk(r.grade, r.majorKey, r.rombel, true)).recs.push(r));
    all.sort((a, b) => (+a.grade || 99) - (+b.grade || 99) || Data.majorIndex(a.grade, a.majorKey) - Data.majorIndex(b.grade, b.majorKey) || (a.majorKey < b.majorKey ? -1 : a.majorKey > b.majorKey ? 1 : 0) || (+a.rombel || 0) - (+b.rombel || 0));
    const cols = P.emptyGroups ? all : all.filter(c => c.recs.length);
    const nameSort = P.sort === 'class' ? 'order' : P.sort;
    cols.forEach(c => {
      c.label = 'Rombel ' + c.rombel; c.recs = sortRecords(c.recs, nameSort);
      let nw = 0; c.recs.forEach(r => { const x = M.w(r.name, fs, false); if (x > nw) nw = x; });
      const tot = 'Jml: ' + c.recs.length, inner = Math.max(M.w(c.label, fs, true), M.w(tot, fs, true), M.w('—', fs, false), Math.min(capW, nw));
      c.w = inner + 2 * px;
      c.items = c.recs.map(r => { const lines = wrap(r.name, inner, fs, false, M); return { rid: r.id, lines, h: lines.length * line + 2 * py }; });
    });
    const gg = [];
    cols.forEach((c, i) => {
      let g = gg[gg.length - 1]; if (!g || g.grade !== c.grade) { g = { grade: c.grade, label: Data.label(c.grade), c0: i, c1: i + 1, majors: [] }; gg.push(g); }
      g.c1 = i + 1; let mj = g.majors[g.majors.length - 1];
      if (!mj || mj.majorKey !== c.majorKey) { mj = { majorKey: c.majorKey, label: Data.short(c.grade, c.majorKey), c0: i, c1: i + 1 }; g.majors.push(mj); }
      mj.c1 = i + 1;
    });
    const bands = P.direction === 'stack' ? gg.map(g => ({ c0: g.c0, c1: g.c1 })) : (cols.length ? [{ c0: 0, c1: cols.length }] : []);
    return { fs, line, px, py, cols, gg, bands, lw: Math.max(0.75, fs / 18) };
  }
  // Lebar kolom untuk satu potongan [c0,c1): judul jurusan/tingkat harus muat di rentangnya (ditambah "lanjutan" bila terpotong).
  function tileWidths(md, M, c0, c1) {
    const w = md.cols.slice(c0, c1).map(c => c.w), fix = (a, b, label) => {
      const lo = Math.max(a, c0), hi = Math.min(b, c1); if (lo >= hi) return;
      const need = M.w(label, md.fs, true) + 2 * md.px, have = sum(w, lo - c0, hi - c0);
      if (need > have) { const add = (need - have) / (hi - lo); for (let i = lo - c0; i < hi - c0; i++) w[i] += add; }
    };
    md.gg.forEach(g => g.majors.forEach(mj => fix(mj.c0, mj.c1, mj.label + (mj.c0 < c0 ? ' (lanj.)' : ''))));
    md.gg.forEach(g => fix(g.c0, g.c1, g.label + (g.c0 < c0 ? ' (lanjutan)' : '')));
    return w;
  }
  const slotCount = (md, c0, c1) => Math.max(1, ...md.cols.slice(c0, c1).map(c => c.items.length));
  const slotHeights = (md, c0, c1, s0, s1) => { const h = []; for (let k = s0; k < s1; k++) { let x = md.line + 2 * md.py; for (let c = c0; c < c1; c++) { const it = md.cols[c].items[k]; if (it && it.h > x) x = it.h; } h.push(x); } return h; };

  // Menggambar satu potongan matriks pada (x0,y0); mengembalikan tinggi yang terpakai.
  function emitTile(O, md, P, M, pal, t, x0, y0) {
    const { fs, line, px, py, lw } = md, rh = line + 2 * py, xs = [x0]; t.w.forEach(w => xs.push(xs[xs.length - 1] + w));
    const W = xs[xs.length - 1] - x0, cx = i => xs[i - t.c0];
    let y = y0;
    const center = (a, b, yy, hh, s, z, bold, col) => O.text(a + (b - a - M.w(s, z, bold)) / 2, yy + hh / 2 + z * 0.36, s, z, bold, col);
    // baris 1: tingkat kelas
    md.gg.forEach(g => { const a = Math.max(g.c0, t.c0), b = Math.min(g.c1, t.c1); if (a >= b) return; O.rect(cx(a), y, cx(b) - cx(a), rh, pal.head); center(cx(a), cx(b), y, rh, g.label + (g.c0 < t.c0 ? ' (lanjutan)' : ''), fs, true, pal.headText); });
    y += rh;
    // baris 2: jurusan
    md.gg.forEach(g => g.majors.forEach(mj => { const a = Math.max(mj.c0, t.c0), b = Math.min(mj.c1, t.c1); if (a >= b) return; O.rect(cx(a), y, cx(b) - cx(a), rh, pal.band); center(cx(a), cx(b), y, rh, mj.label + (mj.c0 < t.c0 ? ' (lanj.)' : ''), fs, true, pal.text); }));
    y += rh;
    // baris 3: rombel
    for (let c = t.c0; c < t.c1; c++) { O.rect(cx(c), y, t.w[c - t.c0], rh, pal.zebra); center(cx(c), cx(c + 1), y, rh, md.cols[c].label, fs, true, pal.muted); }
    y += rh; const top = y;
    // isi: baris-baris nama (tiap "slot" sejajar antarkolom)
    t.slotH.forEach((sh, si) => {
      const k = t.s0 + si;
      if (P.zebra && k % 2 === 1) O.rect(x0, y, W, sh, pal.zebra);
      for (let c = t.c0; c < t.c1; c++) {
        const col = md.cols[c], it = col.items[k];
        if (it) { it.lines.forEach((ln, li) => O.text(cx(c) + px, y + py + li * line + line / 2 + fs * 0.36, ln, fs, false, pal.text, li === 0 ? it.rid : null)); O.placed.push(it.rid); }
        else if (!col.items.length && k === 0) center(cx(c), cx(c + 1), y, sh, '—', fs, false, pal.muted);
      }
      if (P.grid !== 'none') O.rect(x0, y + sh - lw, W, lw, pal.grid);
      y += sh;
    });
    if (t.last && P.totals) {
      O.rect(x0, y, W, rh, pal.band);
      for (let c = t.c0; c < t.c1; c++) center(cx(c), cx(c + 1), y, rh, 'Jml: ' + md.cols[c].items.length, fs, true, pal.text);
      y += rh;
    }
    if (P.grid !== 'none') for (let c = t.c0 + 1; c < t.c1; c++) {     // garis tegak: batas tingkat (tebal, sepanjang tinggi), jurusan (mulai baris jurusan), rombel (mulai baris rombel)
      const rk = md.gg.some(g => g.c0 === c) ? 0 : md.gg.some(g => g.majors.some(mj => mj.c0 === c)) ? 1 : 2;
      if (P.grid === 'rows' && rk === 2) continue;
      const from = y0 + rk * rh; O.rect(cx(c) - (rk === 0 ? lw : lw / 2), from, rk === 0 ? lw * 2 : lw, y - from, rk === 0 ? pal.head : pal.grid);
    }
    if (P.grid === 'full') { O.rect(x0, top, lw, y - top, pal.grid); O.rect(x0 + W - lw, top, lw, y - top, pal.grid); }
    O.rect(x0, y - lw, W, lw * 1.5, pal.head);
    return y - y0;
  }

  function matrixDoc(doc, P, M, T, meta, warn) {
    const gap = T.fs * 0.8, ft = T.fs * 0.9 * P.lineHeight, pal = palette(P);
    // PDF: bila terlalu lebar, kecilkan font sedikit (maks. ±28%) agar tidak terpecah; bila tetap tak muat, pecah per kolom pada ukuran asli.
    // Model nominal dan kandidat yang diperkecil dibuat TANPA batas lebar kolom (persis seperti versi asli), sehingga keluaran yang dulu sudah muat tidak berubah.
    // Hanya bila tak satu pun muat, model nominal dibangun ulang dengan batas "satu kolom ≤ lebar isi halaman" (nama dibungkus): kolom yang lebih lebar daripada
    // halaman tidak dapat dibantu oleh pemecahan per kolom dan sebelumnya terpotong di tepi kanan.
    let fs = T.fs, md = matrixModel(doc.records, P, M, fs);
    if (T.kind === 'pdf' && md.bands.length) {
      const natural = m => Math.max(...m.bands.map(b => sum(tileWidths(m, M, b.c0, b.c1))));
      const cw = T.pageW - 2 * T.m;
      if (natural(md) > cw) {
        let fitted = false;
        for (const k of [0.92, 0.85, 0.78, 0.72]) { if (T.fs * k < 6.5) break; const t = matrixModel(doc.records, P, M, T.fs * k); if (natural(t) <= cw) { md = t; fs = T.fs * k; fitted = true; break; } }
        if (!fitted) md = matrixModel(doc.records, P, M, T.fs, cw);
      }
    }
    const line = md.line, rh = line + 2 * md.py, count = doc.records.length, flh = T.fs * P.lineHeight;
    // Perkiraan tinggi blok judul memakai lebar paling sempit (konservatif); tinggi sebenarnya dihitung ulang per halaman.
    const estW = T.kind === 'pdf' ? T.pageW - 2 * T.m : T.minW - 2 * T.m;
    const CH = 2 * T.m + blockH(headerLines(doc, P, M, T.fs, estW, meta, false, count), flh, T.fs) + ft + 3 * gap;
    const widthOK = w => (T.kind === 'pdf' ? w <= T.pageW - 2 * T.m + 0.01 : pageWof(w) <= T.maxW);
    const tileOf = (b, c0, c1, s0, s1, last) => { const w = tileWidths(md, M, c0, c1); return { band: b, c0, c1, s0, s1, w, W: sum(w), slotH: slotHeights(md, c0, c1, s0, s1), last }; };
    const tileH = t => 3 * rh + sum(t.slotH) + (t.last && P.totals ? rh : 0);
    // Lebar halaman gambar SEBENARNYA = max(lebar isi, lebar minimum) + 2 margin; batas luas piksel harus memakai lebar ini, bukan lebar potongan.
    const pageWof = W => Math.max(W, estW) + 2 * T.m;
    const pageFits = (W, H) => (T.kind === 'pdf' ? W <= T.pageW - 2 * T.m + 0.01 && CH + H <= T.pageH + 0.01 : T.fits(pageWof(W), CH + H));
    const bodyCap = W => (T.kind === 'pdf' ? T.pageH : T.hMax(pageWof(W))) - CH;
    const boundaryRank = c => (md.gg.some(g => g.c0 === c) ? 0 : md.gg.some(g => g.majors.some(mj => mj.c0 === c)) ? 1 : 2);
    // Memotong [a,b) menjadi rentang kolom; ok(c0,c1) = rentang itu boleh. Titik potong terbaik: batas tingkat > jurusan > rombel (rentang terpakai min. 40%).
    const chunk = (a, b, ok) => {
      const out = []; let c0 = a;
      while (c0 < b) {
        let c1 = c0 + 1; while (c1 < b && ok(c0, c1 + 1)) c1++;
        if (c1 < b) {
          const total = sum(md.cols.slice(c0, c1).map(c => c.w)); let best = c1, rank = boundaryRank(c1);
          for (let c = c1 - 1; c > c0; c--) { const r = boundaryRank(c); if (r < rank && sum(md.cols.slice(c0, c).map(x => x.w)) >= total * 0.4) { best = c; rank = r; if (r === 0) break; } }
          c1 = best;
        }
        out.push([c0, c1]); c0 = c1;
      }
      return out;
    };
    // Membagi baris (slot) sebuah rentang kolom menjadi beberapa potongan; judul 3 baris diulang di tiap potongan, baris "Jml" hanya di potongan terakhir.
    const splitRows = (bi, c0, c1) => {
      const n = slotCount(md, c0, c1), W = sum(tileWidths(md, M, c0, c1)), cap = bodyCap(W) - 3 * rh, sh = slotHeights(md, c0, c1, 0, n), extra = P.totals ? rh : 0, out = [];
      let s0 = 0;
      while (s0 < n) {
        let e = s0, used = 0; while (e < n && (e === s0 || used + sh[e] <= cap)) { used += sh[e]; e++; }
        if (e >= n && used + extra > cap && e - s0 > 1) e--;
        out.push(tileOf(bi, c0, c1, s0, e, e >= n)); s0 = e;
      }
      return out;
    };
    // --- susun potongan ke halaman: potongan berurutan berbagi halaman (ditumpuk ke bawah) selama masih muat; urutan baca tetap ---
    const pack = batches => {
      const out = [];
      batches.forEach(tiles => tiles.forEach(t => {
        const cur = out[out.length - 1];
        if (cur) { const W = Math.max(cur.W, t.W), H = cur.H + gap + tileH(t); if (pageFits(W, H)) { cur.tiles.push(t); cur.W = W; cur.H = H; return; } }
        out.push({ tiles: [t], W: t.W, H: tileH(t) });
      }));
      return out;
    };
    // Tiap pita: pilih cara memotong yang menghasilkan paling sedikit halaman — utuh per kolom (bila satu kolom muat satu halaman) atau pecah per baris.
    const chosen = [];
    md.bands.forEach((band, bi) => {
      const okAll = (c0, c1) => { const t = tileOf(bi, c0, c1, 0, slotCount(md, c0, c1), true); return pageFits(t.W, tileH(t)); };
      let single = true; for (let c = band.c0; c < band.c1 && single; c++) single = okAll(c, c + 1);
      const cTiles = single ? chunk(band.c0, band.c1, okAll).map(([c0, c1]) => tileOf(bi, c0, c1, 0, slotCount(md, c0, c1), true)) : null;
      const vTiles = chunk(band.c0, band.c1, (c0, c1) => widthOK(sum(tileWidths(md, M, c0, c1)))).flatMap(([c0, c1]) => splitRows(bi, c0, c1));
      chosen.push(cTiles && pack([cTiles]).length <= pack([vTiles]).length ? cTiles : vTiles);
    });
    const pagesT = pack(chosen), wrapped = chosen.some(t => t.length > 1);      // wrapped: sebuah pita terpotong menjadi beberapa potongan (baris/halaman)
    const n = pagesT.length || 1, pages = [];
    (pagesT.length ? pagesT : [{ tiles: [], W: 0, H: 0 }]).forEach((pg, pi) => {
      const O = new Ops(), first = pi === 0, contentW = T.kind === 'pdf' ? T.pageW - 2 * T.m : Math.max(pg.W, estW);
      const W = T.kind === 'pdf' ? T.pageW : contentW + 2 * T.m, hb = headerLines(doc, P, M, T.fs, contentW, meta, !first, count), hh = blockH(hb, flh, T.fs);
      const H0 = T.m + hh + gap + pg.H + (pg.tiles.length ? gap : 0) + ft + T.m, pageH = T.kind === 'pdf' ? T.pageH : H0;
      // Gambar sangat lebar: judul rata kiri agar terlihat di sudut kiri atas saat gambar di-zoom; selain itu rata tengah pada halaman pertama.
      const hw = Math.max(0, ...hb.map(l => M.w(l.s, l.z, l.b))), align = first && contentW <= hw * 2.2 ? 'center' : 'left';
      let y = T.m; y += emitHeader(O, hb, T.m, y, contentW, flh, T.fs, M, align); y += gap;
      pg.tiles.forEach((t, k) => { if (k) y += gap; y += emitTile(O, md, P, M, pal, t, T.m, y); });
      if (!pg.tiles.length) O.text(T.m, y + T.fs, 'Tidak ada data untuk ditampilkan.', T.fs, false, pal.muted);
      const fz = T.fs * 0.9, fy = (T.kind === 'pdf' ? T.pageH - T.m : H0 - T.m) - ft / 2 + fz * 0.36, right = n > 1 || T.kind === 'pdf' ? `${T.kind === 'pdf' ? 'Halaman' : 'Bagian'} ${pi + 1} dari ${n}` : '';
      O.text(T.m, fy, `Dibuat ${meta.stamp}`, fz, false, pal.muted); if (right) O.text(T.m + contentW - M.w(right, fz, false), fy, right, fz, false, pal.muted);
      pages.push({ w: W, h: pageH, bg: pal.bg, ops: O.a, placed: O.placed, rows: pg.tiles.reduce((a, t) => a + (t.s1 - t.s0), 0) });
    });
    if (T.kind === 'pdf' && fs < T.fs) warn(`Matriks terlalu lebar untuk satu halaman: ukuran teks dikecilkan menjadi ${fs.toFixed(1)} pt.`);
    return { pages, names: count, wrapped };
  }

  /* Sabuk pengaman PDF: setelah tata letak selesai, ukur seberapa jauh isi sebuah halaman melewati tepi kanan area isi (halaman − margin) dan tepi bawah halaman.
     Hanya untuk MELAPORKAN (peringatan di plan); tidak mengubah tata letak. Latar halaman bukan operasi (p.bg), jadi tak ikut terhitung. */
  function pdfOverrun(p, T, M) {
    let right = 0, bottom = 0;
    for (const o of p.ops) {
      if (o.t === 'r') { right = Math.max(right, o.x + o.w); bottom = Math.max(bottom, o.y + o.h); }
      else { right = Math.max(right, o.x + M.w(o.s, o.z, !!o.b)); bottom = Math.max(bottom, o.y); }
    }
    return { x: Math.max(0, right - (T.pageW - T.m)), y: Math.max(0, bottom - T.pageH) };
  }

  /* =====================================================================================================
     RENCANA: dokumen → halaman/gambar, dengan pemeriksaan keutuhan data
     ===================================================================================================== */
  /* input: { docs:[{id,name,date,records:[{id,name,grade,majorKey,rombel,order,createdAt}]}], prefs, kind:'image'|'pdf', M, meta:{filterNote,generatedAt} }
     keluaran: { docs:[{id,name,date,count,pages:[{w,h,ops,placed,label}]}], pages, warnings, stats } — melempar Error bila pemeriksaan gagal. */
  function plan(input) {
    const P = withDefaults(input.prefs), kind = input.kind, M = input.M, warnings = [], warn = w => { if (!warnings.includes(w)) warnings.push(w); };
    const when = input.meta && input.meta.generatedAt ? new Date(input.meta.generatedAt) : new Date();
    const meta = { filterNote: (input.meta && input.meta.filterNote) || '', stamp: when.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }), multi: false };
    let docs = input.docs.map(d => ({ ...d, records: d.records.slice() }));
    if (docs.length > 1 && P.multi === 'merge') docs = [{ id: 'merged', name: `${docs.length} kumpulan data`, date: '', records: docs.flatMap(d => d.records), periodAuto: periodText(docs), merged: true }];
    meta.multi = docs.length > 1 || !!(docs[0] && docs[0].merged);
    docs.forEach(d => { if (d.periodAuto === undefined) d.periodAuto = periodText([d]); });
    const out = { docs: [], pages: [], warnings, stats: { names: 0, pages: 0 }, prefs: P };
    docs.forEach(doc => {
      const land = P.orient === 'landscape' || (P.orient === 'auto' && P.layout === 'matrix');
      const T = budget(kind, P, { landscape: land });
      const r = P.layout === 'matrix' ? matrixDoc(doc, P, M, T, meta, warn) : tableDoc(doc, P, M, T, meta, warn);
      // keutuhan: setiap catatan tepat satu kali
      const want = doc.records.map(x => x.id).sort(), got = r.pages.flatMap(p => p.placed).sort();
      if (want.length !== got.length || want.some((id, i) => id !== got[i])) throw new Error(`Pemeriksaan keutuhan gagal: ${want.length} catatan diharapkan, ${got.length} tertata (${doc.name}).`);
      r.pages.forEach((p, i) => {
        p.label = `${doc.name || 'Data'}${r.pages.length > 1 ? ` — ${kind === 'pdf' ? 'halaman' : 'bagian'} ${i + 1}/${r.pages.length}` : ''}`;
        if (kind === 'image' && !T.fits(p.w, p.h)) warn(`Satu bagian (${Math.ceil(p.w * P.sharp)}×${Math.ceil(p.h * P.sharp)} px) melebihi batas ukuran gambar yang dipilih.`);
        if (kind === 'pdf') {
          const ov = pdfOverrun(p, T, M), who = meta.multi && doc.name ? ` “${doc.name}”` : '';
          if (ov.x > 0.5) warn(`PDF${who}: sebagian isi halaman ${i + 1} melewati tepi kanan halaman (±${Math.ceil(ov.x)} pt) dan akan terpotong.`);
          if (ov.y > 0.5) warn(`PDF${who}: sebagian isi halaman ${i + 1} melewati tepi bawah halaman (±${Math.ceil(ov.y)} pt) dan akan terpotong.`);
        }
      });
      out.docs.push({ id: doc.id, name: doc.name, date: doc.date, count: doc.records.length, pages: r.pages, landscape: land, wrapped: !!r.wrapped });
      out.pages.push(...r.pages); out.stats.names += doc.records.length;
    });
    out.stats.pages = out.pages.length; out.wrapped = out.docs.some(d => d.wrapped);
    return out;
  }

  const imagePx = (p, scale) => ({ w: Math.ceil(p.w * scale), h: Math.ceil(p.h * scale) });
  return { FONT, SCHEMES, LIMITS, DEF, ENUMS, cleanPrefs, withDefaults, palette, plan, wrap, sortRecords, periodText, dateLong, imagePx };
})();
