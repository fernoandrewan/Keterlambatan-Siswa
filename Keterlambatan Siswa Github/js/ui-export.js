/* ui-export.js — dialog "Ekspor gambar / PDF".
   Membuat BERKAS gambar (PNG/JPG) atau PDF sungguhan dari data — bukan tangkapan layar. Dua jenis:
     • Tabel standar : No. | Tingkat Kelas | Jurusan | Rombel | Nama Siswa
     • Matriks Kelas : Tingkat Kelas → Jurusan → Rombel → nama-nama
   Alur: pengguna memilih cakupan & tampilan → ringkasan ukuran/jumlah gambar dan pratinjau diperbarui langsung (rencana dihitung SEBELUM
   menggambar) → "Buat file" menggambar bertahap dengan progres & tombol batal → hasil dapat diunduh satu per satu, sebagai ZIP, atau dibagikan.
   Data dibaca dari memori setelah semua penulisan tertunda selesai (settle), sehingga berkas = isi database terkini. Tidak ada data yang diubah. */
'use strict';
const Exp = (() => {
  let X = null;                                                    // keadaan dialog yang sedang terbuka (null bila tertutup)
  const mp = n => nf(Math.round(n / 1e5) / 10), dims = (p, s) => `${nf(Math.ceil(p.w * s))} × ${nf(Math.ceil(p.h * s))} px`;
  const lowEnd = () => { try { return matchMedia('(pointer: coarse)').matches || (navigator.deviceMemory > 0 && navigator.deviceMemory <= 4); } catch (_) { return false; } };
  const recOf = (r, order) => ({ id: r.id, name: r.name, grade: r.grade, majorKey: r.majorKey, rombel: r.rombel, order: order === undefined ? r.order : order, createdAt: r.createdAt });

  /* ---------- data ---------- */
  function filterNote() {
    const f = st().filters, p = [];
    if (f.grade) p.push(Data.label(f.grade));
    if (f.majorKey) p.push(Data.majorLabel(f.grade || '', f.majorKey));
    if (f.rombel) p.push('Rombel ' + f.rombel);
    if (f.name && f.name.trim()) p.push(`nama memuat “${f.name.trim()}”`);
    return p.length ? 'Filter: ' + p.join(' · ') : '';
  }
  const filterActive = () => { const f = st().filters; return !!(f.grade || f.majorKey || f.rombel || (f.name && f.name.trim())); };
  function collect() {
    if (X.scope === 'filter') {
      const s = getSet(X.setId); if (!s) return { docs: [], note: '' };
      return { docs: [{ id: s.id, name: s.name, date: s.date, records: sorted(filtered(s.id)).map((r, i) => recOf(r, i)) }], note: filterNote() };
    }
    const ids = X.scope === 'set' ? [X.setId] : X.scope === 'picked' ? X.ids : S.sets.map(s => s.id);
    const sets = ids.map(getSet).filter(Boolean).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
    return { docs: sets.map(s => ({ id: s.id, name: s.name, date: s.date, records: S.recs.filter(r => r.setId === s.id).map(r => recOf(r)) })), note: '' };
  }

  /* ---------- formulir ---------- */
  function read(d) {
    const o = {};
    $$('[data-k]', d).forEach(el => {
      const k = el.dataset.k;
      if (el.type === 'radio') { if (el.checked) o[k] = el.value; }
      else if (el.type === 'checkbox') o[k] = el.checked;
      else if (el.dataset.t === 'n') { const v = parseFloat(String(el.value).replace(',', '.')); if (Number.isFinite(v)) o[k] = v; }
      else o[k] = el.value;
    });
    return o;
  }
  function write(d, P) {
    $$('[data-k]', d).forEach(el => {
      const v = P[el.dataset.k]; if (v === undefined) return;
      if (el.type === 'radio') el.checked = String(v) === el.value; else if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    });
  }
  function scopeOptions(o) {
    const n = o.from === 'set' ? cnt(o.setId) : 0;
    if (o.from === 'set') {
      const m = sorted(filtered(o.setId)).length;
      return [['set', `Seluruh kumpulan data ini (${nf(n)} siswa)`], ['filter', `Hasil filter yang tampil sekarang (${nf(m)} dari ${nf(n)} siswa)${filterActive() ? '' : ' — belum ada filter aktif'}`], ['all', `Semua kumpulan data (${nf(S.sets.length)})`]];
    }
    return [...(o.ids.length ? [['picked', `Kumpulan data yang dipilih (${nf(o.ids.length)})`]] : []), ['all', `Semua kumpulan data (${nf(S.sets.length)})`]];
  }
  function dialogHTML(o) {
    const R = (k, v, t) => `<label class="chk"><input type="radio" name="xp-${k}" data-k="${k}" value="${v}">${t}</label>`;
    const C = (k, t, cond) => `<label class="chk"${cond ? ` data-if="${cond}"` : ''}><input type="checkbox" data-k="${k}">${t}</label>`;
    const SEL = (k, t, opts, cond, num) => `<label${cond ? ` data-if="${cond}"` : ''}>${t}<select data-k="${k}"${num ? ' data-t="n"' : ''}>${opts.map(([v, x]) => opt(v, x)).join('')}</select></label>`;
    const NUM = (k, t, min, max, step, cond) => `<label${cond ? ` data-if="${cond}"` : ''}>${t}<input type="number" inputmode="decimal" data-k="${k}" data-t="n" min="${min}" max="${max}" step="${step}"></label>`;
    const TXT = (k, t, ph) => `<label>${t}<input type="text" data-k="${k}" maxlength="120"${ph ? ` placeholder="${esc(ph)}"` : ''}></label>`;
    return `<div class="xp">
    <fieldset><legend>Jenis</legend><div class="opts">${R('layout', 'table', 'Tabel standar')}${R('layout', 'matrix', 'Matriks Kelas')}</div>
      <p class="meta" id="xp-layout-note"></p></fieldset>
    <fieldset><legend>Cakupan data</legend><div class="opts col">${scopeOptions(o).map(([v, t]) => `<label class="chk"><input type="radio" name="xp-scope" value="${v}" data-scope>${esc(t)}</label>`).join('')}</div></fieldset>
    <fieldset><legend>Format berkas</legend><div class="opts">${R('format', 'png', 'PNG (tajam)')}${R('format', 'jpg', 'JPG (lebih kecil)')}${R('format', 'pdf', 'PDF (cetak)')}</div></fieldset>
    <details class="xpd" open><summary><b>Judul, sekolah &amp; periode</b></summary>${TXT('title', 'Judul')}${TXT('school', 'Nama sekolah')}${TXT('period', 'Periode (kosongkan = tanggal data)', 'mis. Minggu ke-3 Oktober 2026')}
      <div class="opts">${C('showSchool', 'Tampilkan sekolah')}${C('showPeriod', 'Tampilkan periode')}${C('showCount', 'Tampilkan jumlah siswa')}</div></details>
    <details class="xpd" open><summary><b>Tampilan</b></summary>
      <div class="g2">
        ${NUM('fontSize', 'Ukuran teks (px)', 10, 48, 1, 'img')}${NUM('pdfFont', 'Ukuran teks (pt)', 6, 24, 0.5, 'pdf')}${NUM('lineHeight', 'Jarak baris (×)', 1, 2.2, 0.05)}
        ${SEL('scheme', 'Warna', [...Object.entries(Layout.SCHEMES).map(([k, v]) => [k, v.name]), ['kustom', 'Kustom (satu warna aksen)']])}
        <label data-if="custom">Warna aksen<input type="color" data-k="accent"></label>
        ${SEL('grid', 'Garis tabel', [['full', 'Semua garis'], ['rows', 'Garis antarbaris saja'], ['none', 'Tanpa garis']])}
        ${SEL('sort', 'Urutan nama', [['order', 'Urutan data (No.)'], ['name', 'Nama A → Z'], ['name-desc', 'Nama Z → A'], ['class', 'Kelas, jurusan, rombel, nama']])}
        ${SEL('direction', 'Susunan matriks', [['across', 'Mendatar: semua tingkat berdampingan'], ['stack', 'Bertumpuk: satu pita per tingkat']], 'matrix')}
        ${NUM('maxColChars', 'Lebar kolom nama maks. (karakter)', 10, 60, 1, 'matrix')}
        ${SEL('multi', 'Beberapa kumpulan data', [['separate', 'Dipisah (tiap kumpulan data sendiri)'], ['merge', 'Digabung menjadi satu']], 'multi')}
        ${SEL('orient', 'Orientasi PDF', [['auto', 'Otomatis (matriks = lanskap)'], ['portrait', 'Potret'], ['landscape', 'Lanskap']], 'pdf')}
        ${SEL('sharp', 'Ketajaman gambar', [[1, '1× (kecil)'], [1.5, '1,5×'], [2, '2× (bawaan)'], [3, '3× (sangat tajam, berat)']], 'img', true)}
        ${SEL('limit', 'Batas ukuran per gambar', Object.entries(Layout.LIMITS).map(([k, v]) => [k, v.name]), 'img')}
        <label data-if="jpg">Kualitas JPG: <b id="xp-q"></b><input type="range" data-k="jpgQuality" data-t="n" min="0.5" max="1" step="0.05"></label>
      </div>
      <div class="opts">${C('zebra', 'Baris selang-seling')}${C('totals', 'Baris jumlah (matriks)', 'matrix')}${C('emptyGroups', 'Tampilkan kelompok kosong (matriks)', 'matrix')}</div>
    </details>
    <div id="xp-sum" aria-live="polite"></div>
    <div class="pv"><div class="row" style="align-items:center;justify-content:space-between"><b id="xp-pvt">Pratinjau</b><span class="row"><button class="btn" type="button" data-xp="pv-prev" aria-label="Pratinjau sebelumnya">‹</button><button class="btn" type="button" data-xp="pv-next" aria-label="Pratinjau berikutnya">›</button></span></div>
      <div class="pvbox"><canvas id="xp-pv" role="img" aria-label="Pratinjau hasil ekspor"></canvas></div><p class="meta" id="xp-pvn"></p></div>
    <div class="xpbar"><div class="row"><button class="btn" type="button" data-xp="est">Perkirakan ukuran file</button><button class="btn pri" type="button" data-xp="go" id="xp-go">Buat file</button></div>
    <p class="meta" id="xp-est" aria-live="polite"></p>
    <div id="xp-run" hidden><progress id="xp-prog" max="1" value="0"></progress><div class="row" style="align-items:center;justify-content:space-between"><span id="xp-runt" aria-live="polite"></span><button class="btn" type="button" data-xp="cancel">Batalkan</button></div></div></div>
    <div id="xp-res" aria-live="polite"></div></div>`;
  }

  /* ---------- rencana, ringkasan, pratinjau ---------- */
  const PDF_M = { w: (s, z, b) => PDFFonts.width(s, z, b) };      // PDF: lebar teks dari tabel metrik Helvetica (sama dengan yang dipakai penampil PDF)
  const imgMeasure = s => X.mis[s] || (X.mis[s] = Render.measurer(s));
  const measureFor = P => (P.format === 'pdf' ? PDF_M : imgMeasure(P.sharp));
  function makePlan(coll, P) {
    return Layout.plan({ docs: coll.docs, prefs: P, kind: P.format === 'pdf' ? 'pdf' : 'image', M: measureFor(P), meta: { filterNote: coll.note, generatedAt: new Date().toISOString() } });
  }
  const pdfLost = (coll, P) => {
    let n = 0; const add = s => { if (s) n += PDFFonts.encode(s).lost; };
    add(P.title); add(P.school); add(P.period); add(coll.note);
    coll.docs.forEach(d => { add(d.name); d.records.forEach(r => add(r.name)); }); return n;
  };
  // Bila ketajaman lebih rendah membuat tiap kumpulan data muat dalam SATU gambar (tanpa dibungkus), sarankan — pengguna yang memutuskan.
  function sharpTip(pl, P, coll) {
    if (P.format === 'pdf' || P.sharp <= 1 || !pl.docs.some(d => d.pages.length > 1 || d.wrapped)) return '';
    for (const s of [1.5, 1]) {
      if (s >= P.sharp) continue;
      let alt; try { alt = Layout.plan({ docs: coll.docs, prefs: { ...P, sharp: s }, kind: 'image', M: imgMeasure(s), meta: { filterNote: coll.note, generatedAt: new Date().toISOString() } }); } catch (_) { continue; }
      if (alt.docs.every(d => d.pages.length === 1 && !d.wrapped)) return `<p class="tip">💡 Pada ketajaman <b>${nf(s)}×</b> ${alt.docs.length > 1 ? 'tiap kumpulan data' : 'semuanya'} muat dalam <b>1 gambar</b> (${dims(alt.pages[0], s)}${alt.docs.length > 1 ? ', dst.' : ''}), tetapi teksnya kurang tajam. <button class="btn" type="button" data-xp="sharp" data-v="${s}">Pakai ${nf(s)}×</button></p>`;
    }
    return '';
  }
  function sumHTML(pl, P, coll) {
    const img = P.format !== 'pdf', warns = pl.warnings.slice(), infos = [], N = pl.stats.pages, total = coll.docs.reduce((a, d) => a + d.records.length, 0);
    const rows = [['Isi', `${nf(total)} nama dari ${nf(coll.docs.length)} kumpulan data`],
      ['Hasil', img ? `${nf(N)} gambar ${P.format.toUpperCase()}` : `${nf(N)} halaman PDF (A4 ${pl.docs[0] && pl.docs[0].landscape ? 'lanskap' : 'potret'})${pl.docs.length > 1 ? ` · ${pl.docs.length} kumpulan data berurutan` : ''}`]];
    if (img) {
      const px = pl.pages.map(p => Math.ceil(p.w * P.sharp) * Math.ceil(p.h * P.sharp)), big = Math.max(...px);
      rows.push(['Ukuran gambar', pl.pages.slice(0, 5).map((p, i) => `<div>${N > 1 ? i + 1 + '. ' : ''}${dims(p, P.sharp)} · ${mp(px[i])} MP</div>`).join('') + (N > 5 ? `<div>… dan ${nf(N - 5)} gambar lain</div>` : '')]);
      rows.push(['Memori kanvas terbesar', `±${nf(Math.round((big * 4) / 1048576))} MB (perkiraan, hanya saat menggambar)`]);
      if (N > 12) warns.push(`Akan dibuat ${nf(N)} gambar. Pertimbangkan ketajaman lebih rendah, teks lebih kecil, susunan "Bertumpuk" (matriks), atau format PDF.`);
      if (P.layout === 'matrix' && P.direction === 'across' && pl.wrapped) infos.push(`Matriks mendatar terlalu lebar untuk satu baris pada ukuran ini, jadi dipecah menjadi beberapa baris${N > 1 ? ' dan beberapa gambar' : ' dalam gambar yang sama'}, dengan judul tingkat/jurusan diulang. Susunan "Bertumpuk" biasanya lebih ringkas di HP.`);
    } else { const lost = pdfLost(coll, P); if (lost) warns.push(`${nf(lost)} karakter (mis. huruf non-Latin) tidak ada di font standar PDF dan akan tampil sebagai “?”. Pakai PNG/JPG bila perlu karakter itu.`); }
    rows.push(['Keutuhan data', `<span class="ok-text">✔ ${nf(pl.stats.names)} dari ${nf(total)} nama termuat</span>`]);
    return kv(rows) + warns.map(w => `<p class="warn-inline">⚠ ${esc(w)}</p>`).join('') + infos.map(w => `<p class="meta">ℹ ${esc(w)}</p>`).join('') + sharpTip(pl, P, coll);
  }
  function sync() {
    const d = X.d, P = X.P, show = { img: P.format !== 'pdf', pdf: P.format === 'pdf', jpg: P.format === 'jpg', matrix: P.layout === 'matrix', custom: P.scheme === 'kustom', multi: X.coll.docs.length > 1 };
    $$('[data-if]', d).forEach(el => { el.hidden = !show[el.dataset.if]; });
    $('#xp-q', d).textContent = Math.round(P.jpgQuality * 100) + '%';
    $('#xp-layout-note', d).textContent = P.layout === 'matrix' ? 'Satu tabel besar: Tingkat Kelas → Jurusan → Rombel, nama-nama tersusun ke bawah.' : 'Satu baris per siswa: No., Tingkat Kelas, Jurusan, Rombel, Nama Siswa.';
    const so = $('[data-k=sort] option[value=order]', d); if (so) so.textContent = X.scope === 'filter' ? 'Urutan seperti di layar' : 'Urutan data (No.)';
  }
  let rT = 0;
  const refreshSoon = () => { clearTimeout(rT); rT = setTimeout(() => refresh(), 180); };
  function refresh() {
    clearTimeout(rT); if (!X) return; const my = X, d = X.d;
    X.coll = collect(); X.P = Layout.withDefaults(read(d)); sync();
    const { period, ...keep } = X.P; st().export = Layout.cleanPrefs(keep); saveStateSoon();
    const go = $('#xp-go', d), sum = $('#xp-sum', d);
    try { X.plan = makePlan(X.coll, X.P); X.err = ''; } catch (e) { X.plan = null; X.err = e.message || String(e); }
    $('#xp-est', d).textContent = '';
    if (!X.plan) { sum.innerHTML = `<p class="warn-inline">⚠ ${esc(X.err)}</p>`; go.disabled = true; return; }
    sum.innerHTML = sumHTML(X.plan, X.P, X.coll); go.disabled = X.busy || !X.plan.pages.length;
    X.pv = Math.min(X.pv, X.plan.pages.length - 1); if (X.pv < 0) X.pv = 0; drawPreview(my);
  }
  async function drawPreview(my) {
    if (X !== my || !X.plan || !X.plan.pages.length) return;
    const d = X.d, cv = $('#xp-pv', d), box = cv.parentElement, p = X.plan.pages[X.pv], n = X.plan.pages.length, tok = ++X.pvTok;
    $('#xp-pvt', d).textContent = n > 1 ? `Pratinjau — ${X.P.format === 'pdf' ? 'halaman' : 'gambar'} ${X.pv + 1} dari ${n}` : 'Pratinjau';
    $$('[data-xp^=pv-]', d).forEach(b => { b.hidden = n < 2; });
    try {
      const r = await Render.preview(cv, p, Math.max(200, box.clientWidth - 2), 560);
      if (X !== my || tok !== X.pvTok) return;
      $('#xp-pvn', d).textContent = (r.cut ? 'Hanya bagian atas yang ditampilkan di pratinjau; berkas hasil memuat seluruh isi. ' : '') + (X.P.format === 'pdf' ? 'Pratinjau PDF memakai font layar; PDF memakai Helvetica standar.' : '');
    } catch (e) { if (X === my) $('#xp-pvn', d).textContent = 'Pratinjau tidak dapat ditampilkan: ' + (e.message || e); }
  }

  /* ---------- nama berkas ---------- */
  const kindName = P => (P.layout === 'matrix' ? 'matriks' : 'tabel');
  function baseName(pl, P) { return `${IO.safe(pl.docs.length === 1 ? pl.docs[0].name : 'keterlambatan')}_${kindName(P)}`; }
  function fileNames(pl, P) {
    const ext = P.format === 'jpg' ? 'jpg' : P.format, out = [], multi = pl.docs.length > 1;
    pl.docs.forEach((doc, di) => {
      const base = `${multi ? String(di + 1).padStart(2, '0') + '_' : ''}${IO.safe(doc.name)}_${kindName(P)}`, w = Math.max(2, String(doc.pages.length).length);
      doc.pages.forEach((_, pi) => out.push(doc.pages.length > 1 ? `${base}_${String(pi + 1).padStart(w, '0')}.${ext}` : `${base}.${ext}`));
    });
    return out;
  }

  /* ---------- proses ---------- */
  const setBusy = on => { const d = X.d; X.busy = on; $('#xp-run', d).hidden = !on; $$('.xp [data-k], .xp [data-scope], .xp [data-xp=est], .xp [data-xp=go]', d).forEach(el => { el.disabled = on; }); if (!on && X.plan) $('#xp-go', d).disabled = !X.plan.pages.length; };
  const progress = (my, text, v, max) => { if (X !== my) return; $('#xp-runt', my.d).textContent = text; const p = $('#xp-prog', my.d); p.max = max || 1; p.value = v || 0; };
  const errText = e => (Render.isCancel(e) ? 'Dibatalkan.' : (e && e.message) || String(e));

  async function estimate() {
    if (!X || X.busy || !X.plan) return; const my = X, P = X.P, pl = X.plan, out = $('#xp-est', my.d);
    my.ctl = new AbortController(); setBusy(true); progress(my, 'Menghitung perkiraan…', 0, 1);
    try {
      if (P.format === 'pdf') {
        const r = await PDF.build(pl.pages, { title: P.title, signal: my.ctl.signal }); if (X !== my) return;
        out.innerHTML = `Ukuran PDF: <b>${esc(fmtBytes(r.bytes))}</b> (${nf(r.pages)} halaman).`;
      } else {
        let bi = 0; pl.pages.forEach((p, i) => { if (p.w * p.h > pl.pages[bi].w * pl.pages[bi].h) bi = i; });
        const r = await Render.image(pl.pages[bi], { scale: P.sharp, format: P.format, quality: P.jpgQuality, signal: my.ctl.signal }); if (X !== my) return;
        const pxAll = pl.pages.reduce((a, p) => a + Math.ceil(p.w * P.sharp) * Math.ceil(p.h * P.sharp), 0), est = (r.bytes / (r.w * r.h)) * pxAll;
        out.innerHTML = `Contoh gambar terbesar (${nf(r.w)} × ${nf(r.h)} px): <b>${esc(fmtBytes(r.bytes))}</b>. Perkiraan total ${nf(pl.pages.length)} gambar: <b>±${esc(fmtBytes(Math.round(est)))}</b> (kasar — bergantung isi dan warna).`;
      }
    } catch (e) { if (X === my) out.innerHTML = `<span class="warn-inline">⚠ ${esc(errText(e))}</span>`; }
    finally { if (X === my) setBusy(false); }
  }

  async function generate() {
    if (!X || X.busy) return; const my = X, d = my.d, res = $('#xp-res', d);
    my.ctl = new AbortController(); my.files = []; res.innerHTML = ''; setBusy(true); progress(my, 'Menyimpan perubahan tertunda…', 0, 1);
    try {
      await settle(false);                                          // berkas = isi database terkini
      if (X !== my) return;
      my.coll = collect(); my.P = Layout.withDefaults(read(d)); const P = my.P, pl = makePlan(my.coll, P); my.plan = pl;
      const total = my.coll.docs.reduce((a, s) => a + s.records.length, 0);
      if (!pl.pages.length) throw new Error('Tidak ada halaman untuk dibuat.');
      let files = [], err = null, lost = 0;
      if (P.format === 'pdf') {
        progress(my, 'Menyusun PDF…', 0, pl.pages.length);
        try {
          const r = await PDF.build(pl.pages, { title: P.title || 'Data Keterlambatan Siswa', subject: P.school, signal: my.ctl.signal, onProgress: (i, n) => progress(my, `Menyusun PDF: halaman ${i} dari ${n}`, i, n) });
          files = [{ name: `${baseName(pl, P)}.pdf`, blob: r.blob, bytes: r.bytes, type: 'application/pdf', pages: r.pages }]; lost = r.lost;
        } catch (e) { err = e; }
      } else {
        const big = pl.pages.reduce((m, p) => (p.w * p.h > m.w * m.h ? p : m), pl.pages[0]);
        if (!Render.probe(Math.ceil(big.w * P.sharp), Math.ceil(big.h * P.sharp))) throw new Error(`Browser/perangkat ini tidak sanggup membuat gambar sebesar ${dims(big, P.sharp)}. Turunkan ketajaman, pilih batas "Aman untuk HP", atau pakai PDF.`);
        const names = fileNames(pl, P), r = await Render.images(pl.pages, names, { scale: P.sharp, format: P.format, quality: P.jpgQuality, signal: my.ctl.signal }, (i, n) => progress(my, i < n ? `Membuat gambar ${i + 1} dari ${n}…` : 'Selesai.', i, n));
        files = r.files; err = r.error;
      }
      if (X !== my) return;
      my.files = files; my.lost = lost; showResults(my, { total, err, expected: P.format === 'pdf' ? 1 : pl.pages.length });
    } catch (e) { if (X === my) { showResults(my, { total: 0, err: e, expected: 0 }); } }
    finally { if (X === my) { setBusy(false); } }
  }

  const canShare = files => { try { return !!(navigator.canShare && navigator.share && navigator.canShare({ files })); } catch (_) { return false; } };
  const asFiles = my => my.files.map(f => new File([f.blob], f.name, { type: f.type }));
  function showResults(my, { total, err, expected }) {
    const res = $('#xp-res', my.d), fs = my.files, size = fs.reduce((a, f) => a + f.bytes, 0), complete = !err && fs.length === expected;
    let h = '';
    if (err) h += `<p class="warn-inline">⚠ ${esc(errText(err))}${fs.length ? ` Berkas yang sudah jadi (${nf(fs.length)} dari ${nf(expected)}) tetap tersedia di bawah, tetapi <b>belum lengkap</b>.` : ''}</p>`;
    if (complete) h += `<p class="ok-text">✔ ${nf(fs.length)} berkas dibuat (${esc(fmtBytes(size))}); ${nf(total)} nama termuat semuanya.</p>`;
    if (my.lost) h += `<p class="warn-inline">⚠ ${nf(my.lost)} karakter tidak ada di font standar PDF dan diganti “?”.</p>`;
    if (fs.length) {
      h += `<ul class="files">${fs.map((f, i) => `<li><span class="fn"><b>${esc(f.name)}</b><small>${f.w ? `${nf(f.w)} × ${nf(f.h)} px · ` : f.pages ? `${nf(f.pages)} halaman · ` : ''}${esc(fmtBytes(f.bytes))}</small></span><button class="btn" type="button" data-xp="dl" data-xi="${i}">Unduh</button></li>`).join('')}</ul>`;
      h += `<div class="row">${fs.length > 1 ? '<button class="btn pri" type="button" data-xp="zip">Unduh semua (ZIP)</button>' : ''}${canShare(asFiles(my)) ? '<button class="btn" type="button" data-xp="share">Bagikan…</button>' : ''}</div>`;
      h += '<p class="meta">Berkas hanya ada di memori sampai jendela ini ditutup. Unduh dulu sebelum menutupnya.</p>';
    }
    res.innerHTML = h;
    if (fs.length || err) res.scrollIntoView({ block: 'nearest' });
  }
  async function zipAll(my) {
    if (!my.files.length || my.busy) return; const P = my.P; my.ctl = new AbortController(); setBusy(true);
    try {
      const z = await Zip.build(my.files.map(f => ({ name: f.name, blob: f.blob })), { signal: my.ctl.signal, onProgress: (i, n) => progress(my, `Menyusun ZIP: ${i} dari ${n}`, i, n) });
      IO.download(z, `${baseName(my.plan, P)}.zip`); toast('ZIP diunduh.');
    } catch (e) { if (X === my) toast('ZIP gagal dibuat: ' + errText(e), true); }
    finally { if (X === my) setBusy(false); }
  }

  /* ---------- buka dialog ---------- */
  async function open(o) {
    if (X) return;
    await settle(false);                                            // data terbaru sebelum dihitung
    if (o.from === 'set' && !getSet(o.setId)) return toast('Kumpulan data tidak ditemukan.', true);
    if (o.from === 'io' && !S.sets.length) return toast('Belum ada data untuk diekspor.', true);
    const saved = Layout.cleanPrefs(st().export), scope = o.from === 'set' ? (filterActive() ? 'filter' : 'set') : (o.ids.length ? 'picked' : 'all');
    const my = X = { d: null, scope, setId: o.setId, ids: o.ids || [], P: null, plan: null, coll: null, pv: 0, pvTok: 0, busy: false, files: [], ctl: null, mis: {},
      P0: { ...Layout.DEF, ...('limit' in saved ? {} : { limit: lowEnd() ? 'hp' : 'standar' }), ...saved, ...(o.layout ? { layout: o.layout } : {}), period: '' } };
    try {
      await ask(o.layout === 'matrix' ? 'Ekspor Matriks Kelas' : 'Ekspor gambar / PDF', dialogHTML(o), ['Tutup'], null, { wide: true, onOpen: d => {
        my.d = d; d.classList.add('xp-dlg'); write(d, my.P0); if (matchMedia('(max-width: 560px)').matches) $$('details.xpd', d).forEach(x => { x.open = false; }); $$('[data-scope]', d).forEach(r => { r.checked = r.value === my.scope; });
        d.addEventListener('input', e => { if (e.target.matches('[data-k]')) refreshSoon(); });
        d.addEventListener('change', e => {
          if (e.target.matches('[data-scope]')) { my.scope = e.target.value; my.pv = 0; refresh(); }
          else if (e.target.matches('[data-k]')) { write(d, Layout.withDefaults(read(d))); refresh(); }            // tampilkan nilai yang sudah dirapikan (mis. batas angka)
        });
        d.addEventListener('click', e => {
          const b = e.target.closest('[data-xp]'); if (!b || b.disabled) return; const a = b.dataset.xp;
          if (a === 'go') run(generate); else if (a === 'est') run(estimate);
          else if (a === 'cancel') { if (my.ctl) my.ctl.abort(); }
          else if (a === 'sharp') { const sel = $('[data-k=sharp]', d); sel.value = b.dataset.v; refresh(); }
          else if (a === 'pv-prev' || a === 'pv-next') { if (my.plan) { const n = my.plan.pages.length; my.pv = (my.pv + (a === 'pv-next' ? 1 : n - 1)) % n; drawPreview(my); } }
          else if (a === 'dl') { const f = my.files[+b.dataset.xi]; if (f) IO.download(f.blob, f.name); }
          else if (a === 'zip') run(() => zipAll(my));
          else if (a === 'share') { const fl = asFiles(my); navigator.share({ files: fl, title: my.P.title || 'Ekspor data' }).catch(err => { if (err && err.name !== 'AbortError') toast('Tidak dapat membagikan: ' + err.message, true); }); }
        });
        d.addEventListener('close', () => { clearTimeout(rT); if (my.ctl) my.ctl.abort(); if (X === my) X = null; });
        refresh();
      } });
    } finally { if (X === my) X = null; }
  }
  return { open };
})();

acts['vx-set'] = id => Exp.open({ from: 'set', setId: id });
acts['vx-matrix'] = id => Exp.open({ from: 'set', setId: id, layout: 'matrix' });
acts['vx-sel'] = () => Exp.open({ from: 'io', ids: picked() });
acts['vx-sel-matrix'] = () => Exp.open({ from: 'io', ids: picked(), layout: 'matrix' });
