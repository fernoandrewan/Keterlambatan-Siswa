/* ui-io.js — menu "Ekspor/Impor Data".
   Empat tindakan sengaja dipisah supaya tidak tertukar:
     1. Ekspor sebagian  : kumpulan data terpilih → JSON (scope "sets")
     2. Cadangan penuh   : seluruh database → JSON (scope "all": kumpulan data, catatan, status kunci, riwayat, draf, pengaturan)
     3. Gabungkan        : memasukkan isi berkas ke database saat ini; data terkunci tidak pernah ditimpa
     4. Pulihkan penuh   : MENGGANTI seluruh database dengan isi cadangan penuh; meminta persetujuan, menawarkan cadangan kondisi
                           saat ini, dan diblokir bila ada data lokal terkunci.
   Berkas hanya dibaca sebagai data (JSON.parse + validasi); isinya tidak pernah dieksekusi. */
'use strict';
routes.io = vIO; afters.io = afterIO;

const MAX_IMPORT = 50 * 1024 * 1024;
const kv = rows => `<dl class="kv">${rows.filter(Boolean).map(([k, v, c]) => `<div${c ? ` class="${c}"` : ''}><dt>${esc(k)}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
const picked = () => $$('[name=pk]:checked').map(x => x.value);

/* ---------- tampilan ---------- */
const pickHTML = keep => (S.sets.length
  ? S.sets.slice().sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)).map(s => `<label class="chk"><input type="checkbox" name="pk" value="${s.id}"${keep && keep.has(s.id) ? ' checked' : ''}><span>${esc(s.name)}&nbsp;<small>(${nf(cnt(s.id))} siswa${s.locked ? ' · 🔒' : ''})</small></span></label>`).join('')
  : '<div class="empty">Belum ada data.</div>');

function backupInfoHTML() {
  const last = S.meta.lastBackupAt, changed = last && S.sets.some(s => s.updatedAt > last);
  return `<p class="meta">Isi saat ini: <b>${nf(S.sets.length)}</b> kumpulan data, <b>${nf(S.recs.length)}</b> catatan. ${last ? `Cadangan penuh terakhir diunduh: <b>${esc(fmtTime(last))}</b>${changed ? ' — <b>ada perubahan sejak itu</b>' : ''}.` : '<b>Cadangan penuh belum pernah diunduh dari perangkat ini.</b>'}</p>`;
}

function vIO() {
  return `<h2>Ekspor/Impor Data</h2>
  <div class="card"><h3>1. Ekspor sebagian</h3><p class="meta">Pilih kumpulan data. Berkas JSON berisi kumpulan data terpilih beserta catatannya (termasuk status kunci), tanpa riwayat dan pengaturan.</p>
    <div id="io-pick">${pickHTML()}</div>
    <div class="row irow"><button class="btn" data-act="pickall">Pilih semua</button><button class="btn pri" data-act="exp-sel">Ekspor JSON</button><button class="btn" data-act="share-sel">Bagikan…</button><button class="btn" data-act="vx-sel-matrix">Ekspor Matriks Kelas</button><button class="btn" data-act="vx-sel">Gambar / PDF…</button></div></div>
  <div class="card"><h3>2. Cadangan penuh</h3><p class="meta">Salinan lengkap database: semua kumpulan data, catatan (ID, urutan, status draf/selesai, status kunci), riwayat revisi, draf formulir, dan pengaturan. Dipakai untuk memindahkan atau memulihkan seluruh data.</p>
    <div id="io-backup">${backupInfoHTML()}</div><button class="btn pri" data-act="backup">Unduh cadangan penuh</button></div>
  <div class="card"><h3>3. Gabungkan berkas ke data saat ini</h3><p class="meta">Menambahkan kumpulan data/catatan dari berkas ekspor (sebagian atau penuh) tanpa menghapus apa pun. Anda melihat ringkasannya dulu. Data terkunci tidak pernah ditimpa.</p>
    <label>Pilih berkas JSON<input id="imp-merge" type="file" accept=".json,application/json"></label></div>
  <div class="card"><h3>4. Pulihkan cadangan penuh</h3><p class="meta"><b>Mengganti seluruh isi database</b> dengan isi cadangan penuh (untuk perangkat baru atau pemulihan). Anda akan diminta persetujuan dan ditawari cadangan kondisi saat ini. Diblokir bila ada data terkunci di perangkat ini.</p>
    <label>Pilih berkas cadangan penuh<input id="imp-restore" type="file" accept=".json,application/json"></label></div>
  <div class="card"><h3>Penyimpanan di perangkat ini</h3><p class="meta" id="io-store">Memeriksa…</p></div>
  <div class="card note"><h3>Perlu diketahui</h3><ul><li>Data hanya tersimpan di browser perangkat ini. Penyimpanan otomatis bukan pengganti cadangan: browser, sistem, atau pengguna dapat menghapus data situs.</li><li>Basis data tidak dienkripsi. Kunci hanya mencegah perubahan tidak sengaja lewat aplikasi ini; itu bukan pengaman — siapa pun yang memegang perangkat atau berkas JSON dapat membaca atau mengubah isinya di luar aplikasi.</li><li>Penerima berkas dapat menyalin dan meneruskan data siswa di dalamnya.</li></ul></div>`;
}
function afterIO() { storageInfo(); }
function renderIOLists() {
  const pk = $('#io-pick'); if (!pk) return;
  const keep = new Set(picked()); pk.innerHTML = pickHTML(keep); const b = $('#io-backup'); if (b) b.innerHTML = backupInfoHTML(); storageInfo();
}
async function storageInfo() {
  const el = $('#io-store'); if (!el) return;
  if (!navigator.storage || !navigator.storage.estimate) { el.textContent = 'Browser ini tidak melaporkan pemakaian penyimpanan.'; return; }
  const [est, per] = await Promise.all([navigator.storage.estimate().catch(() => null), navigator.storage.persisted ? navigator.storage.persisted().catch(() => null) : null]);
  if (!$('#io-store')) return;
  const parts = [];
  if (est && est.usage != null) parts.push(`Terpakai sekitar <b>${esc(fmtBytes(est.usage))}</b>${est.quota ? ` dari kuota ±${esc(fmtBytes(est.quota))} (perkiraan browser)` : ''}.`);
  parts.push(per === true ? 'Penyimpanan <b>persisten</b>: browser tidak akan menghapusnya otomatis saat ruang menipis.' : per === false ? 'Penyimpanan <b>belum persisten</b>: bila ruang perangkat sangat menipis, browser dapat menghapus data situs. Unduh cadangan penuh secara berkala.' : '');
  el.innerHTML = parts.filter(Boolean).join(' ');
}

/* ---------- ekspor sebagian & bagikan ---------- */
function packPartial(snap) {
  const data = IO.buildSets(snap.sets, snap.recs), t = today(), sets = snap.sets;
  return { sets, n: snap.recs.length, blob: new Blob([IO.serialize(data)], { type: 'application/json' }),
    name: sets.length === 1 ? `${IO.safe(sets[0].name)}.json` : `keterlambatan_${t}.json`, scope: sets.length === 1 ? sets[0].name : `${sets.length} kumpulan data` };
}
async function doExport(ids) {
  if (!ids.length) return toast('Pilih minimal satu kumpulan data.', true);
  await settle(false);                                         // tulis semua yang tertunda → berkas = isi database terkini
  const snap = await Store.snapshot({ ids }); if (!snap.sets.length) return toast('Kumpulan data tidak ditemukan.', true);
  const p = packPartial(snap); IO.download(p.blob, p.name); toast('Diunduh: ' + p.name);
}
async function doBackup() {
  await settle(false);
  const s = await Store.snapshot({ full: true });
  if (!s.sets.length && !s.revs.length) return toast('Belum ada data untuk dicadangkan.', true);
  const data = IO.buildFull(s), name = `cadangan-penuh-keterlambatan_${stamp()}.json`;
  IO.download(new Blob([IO.serialize(data)], { type: 'application/json' }), name);
  await Store.setBackupStamp(); renderIOLists();
  toast(`Diunduh: ${name} (${nf(data.counts.sets)} kumpulan data, ${nf(data.counts.records)} catatan, ${nf(data.counts.revisions || 0)} revisi)`);
}
async function doShare(ids) {
  if (!ids.length) return toast('Pilih minimal satu kumpulan data.', true);
  await settle(false);
  const snap = await Store.snapshot({ ids }); if (!snap.sets.length) return toast('Kumpulan data tidak ditemukan.', true);
  const p = packPartial(snap), ds = p.sets.map(s => s.date).sort();
  const text = p.sets.length === 1 ? `Berikut file data keterlambatan siswa untuk tanggal ${fmtDate(ds[0])}.` : `Berikut file data keterlambatan siswa (${p.sets.length} kumpulan data, ${fmtDate(ds[0])} – ${fmtDate(ds[ds.length - 1])}).`;
  const [i, msg] = await ask('Bagikan data', `<p>File: <b>${esc(p.name)}</b><br>Cakupan: ${esc(p.scope)} · ${nf(p.n)} siswa</p><label>Pesan (dapat diubah)<textarea id="w-msg" rows="5">${esc(text + ' File JSON dapat diimpor melalui menu Ekspor/Impor Data pada aplikasi Pencatatan Keterlambatan Siswa.')}</textarea></label><p class="meta">Daftar nama ada di dalam file, bukan di pesan. Penerima dapat menyalin dan meneruskan data.</p>`, ['Batal', 'Lanjut bagikan'], d => $('#w-msg', d).value);
  if (i !== 1) return;
  const file = new File([p.blob], p.name, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: p.name, text: msg }); return toast('File diteruskan ke aplikasi yang Anda pilih.'); }
    catch (e) { if (e && e.name === 'AbortError') return toast('Berbagi dibatalkan.'); }
  }
  // Cadangan: unduh file + buka WhatsApp dengan teks saja. Tautan wa.me TIDAK dapat melampirkan file.
  IO.download(p.blob, p.name);
  window.open('https://wa.me/?text=' + encodeURIComponent(`${msg}\n\n(Lampirkan file ${p.name} secara manual.)`), '_blank', 'noopener');
  toast('File diunduh. Lampirkan secara manual di WhatsApp.');
}

/* ---------- baca & validasi berkas (sebelum menyentuh database) ---------- */
const stopImport = m => ask('Impor dibatalkan', `<p>${esc(m)}</p><p class="meta">Tidak ada data yang diubah.</p>`, ['Tutup']);
async function readImportFile(file) {
  if (!file) return null;
  if (file.size > MAX_IMPORT) { await stopImport(`Berkas terlalu besar (${fmtBytes(file.size)}; batas ${fmtBytes(MAX_IMPORT)}).`); return null; }
  let obj; try { obj = JSON.parse(await file.text()); } catch (_) { await stopImport('Berkas bukan JSON yang valid atau rusak (mungkin terpotong saat disalin).'); return null; }
  const v = IO.parse(obj); if (v.error) { await stopImport(v.error); return null; }
  return v;
}
const issuesHTML = v => (v.issues.length || v.warnings.length)
  ? `<details class="card foot"><summary>Catatan validasi (${v.issues.length + v.warnings.length})</summary><ul>${v.warnings.map(w => `<li>${esc(w)}</li>`).join('')}${v.issues.map(w => `<li>${esc(w)}</li>`).join('')}</ul>${v.issues.length >= 25 ? '<p class="meta">Hanya 25 catatan pertama yang ditampilkan.</p>' : ''}</details>` : '';
const fileInfoHTML = v => kv([['Jenis berkas', v.meta.scope === 'all' ? 'Cadangan penuh' : 'Ekspor sebagian'], ['Dibuat', v.meta.exportedAt ? esc(fmtTime(v.meta.exportedAt)) : 'tidak diketahui'], ['Versi format', `${v.meta.fileVersion}${v.meta.fileVersion < v.meta.schemaVersion ? ` (dimigrasi ke ${v.meta.schemaVersion})` : ''}`]]);

/* ---------- 3. GABUNGKAN ---------- */
async function mergeFlow(v) {
  const local = await Store.snapshot(), P = IO.planMerge(v.sets, local, { replace: false }), s = P.sum, open = s.conflicts - s.conflictsLocked;
  const bad = v.stats.badSets + v.stats.badRecords;
  const body = `${fileInfoHTML(v)}${v.meta.scope === 'all' ? '<p class="meta">Berkas ini cadangan penuh: hanya kumpulan data dan catatannya yang digabungkan. Riwayat, draf, dan pengaturan di perangkat ini tidak diubah.</p>' : ''}
    ${kv([['Kumpulan data di berkas', `${nf(v.stats.setsInFile)} (valid ${nf(v.stats.setsValid)})`], ['Catatan di berkas', `${nf(v.stats.recordsInFile)} (valid ${nf(v.stats.recordsValid)})`],
      ['Kumpulan data baru', `<b>${nf(s.newSets)}</b>`], ['Kumpulan data yang bertambah catatan', `<b>${nf(s.merged)}</b>`], ['Catatan baru', `<b>${nf(s.newRecs)}</b>`], ['Identik, dilewati', nf(s.same)],
      ['Konflik ID (isi berbeda)', `<b>${nf(s.conflicts)}</b>${s.conflictsLocked ? ` — ${nf(s.conflictsLocked)} menyangkut data terkunci (tidak akan diubah)` : ''}`],
      s.lockedSkipped ? ['Catatan untuk kumpulan data terkunci, dilewati', nf(s.lockedSkipped)] : null,
      bad ? ['Tidak valid, dilewati', `${nf(v.stats.badSets)} kumpulan data, ${nf(v.stats.badRecords)} catatan`, 'bad'] : null])}
    ${issuesHTML(v)}<p class="meta">Data yang sudah ada tidak dihapus. Kunci data yang sudah ada tidak pernah diubah oleh impor.</p>`;
  if (!s.newSets && !s.newRecs && !open) { await ask('Ringkasan impor', body + '<p><b>Tidak ada yang perlu digabungkan.</b></p>', ['Tutup']); return; }
  const [i] = await ask('Ringkasan impor', body, open ? ['Batal', 'Gabung & ganti konflik', 'Gabung, lewati konflik'] : ['Batal', 'Gabungkan'], null, { wide: true });
  if (i === 0) return;
  const replace = open > 0 && i === 1;
  await settle(false);
  const res = await Store.importMerge(v.sets, { replace });
  renderIOLists();
  const skip = (res.skippedLocked || 0);
  const msg = `Impor selesai: ${nf(res.newSets)} kumpulan data baru, ${nf(res.newRecs)} catatan baru${replace ? `, ${nf(res.replaced || 0)} catatan diganti` : ''}.`;
  if (skip || bad) await ask('Impor selesai', `<p>${esc(msg)}</p>${kv([skip ? ['Dilewati karena data terkunci', nf(skip)] : null, bad ? ['Dilewati karena tidak valid', nf(bad)] : null])}`, ['Tutup']);
  else toast(msg);
}

/* ---------- 4. PULIHKAN PENUH ---------- */
async function restoreFlow(v) {
  if (v.meta.scope !== 'all') {
    const [i] = await ask('Bukan cadangan penuh', `<p>Berkas ini adalah <b>ekspor sebagian</b> (${nf(v.stats.setsValid)} kumpulan data), bukan cadangan penuh, sehingga tidak dapat dipakai untuk memulihkan seluruh database.</p><p>Gunakan <b>Gabungkan berkas ke data saat ini</b> untuk memasukkannya. Tidak ada data yang diubah.</p>`, ['Tutup', 'Gabungkan berkas ini']);
    if (i === 1) await mergeFlow(v); return;
  }
  const snap = await Store.snapshot({ full: true }), plan = IO.planRestore(v, { sets: snap.sets, recs: snap.recs, revs: snap.revs.length });
  if (plan.blocked) {
    const [i] = await ask('Pemulihan penuh diblokir', `<p>Di perangkat ini ada <b>${nf(plan.lockedSets)} kumpulan data</b> dan <b>${nf(plan.lockedRecs)} catatan</b> terkunci${plan.lockedSetNames.length ? ` (mis. ${plan.lockedSetNames.map(n => '“' + esc(n) + '”').join(', ')})` : ''}.</p>
      <p>Pemulihan penuh mengganti semua data, sehingga data terkunci akan hilang. Aplikasi tidak pernah menimpa data terkunci secara diam-diam.</p><p>Pilihan: buka kunci data tersebut lalu ulangi, atau pakai <b>Gabungkan</b> (data terkunci tetap aman). Tidak ada data yang diubah.</p>`, ['Tutup', 'Gabungkan berkas ini']);
    if (i === 1) await mergeFlow(v); return;
  }
  const empty = !plan.current.sets && !plan.current.recs;
  const body = `<p>Pemulihan penuh akan <b>mengganti seluruh isi database</b> di perangkat ini dengan isi berkas.</p>${fileInfoHTML(v)}
    <table class="cmp"><thead><tr><th></th><th>Sekarang</th><th>Berkas</th></tr></thead><tbody><tr><th>Kumpulan data</th><td>${nf(plan.current.sets)}</td><td>${nf(plan.incoming.sets)}</td></tr><tr><th>Catatan</th><td>${nf(plan.current.recs)}</td><td>${nf(plan.incoming.recs)}</td></tr><tr><th>Revisi</th><td>${nf(plan.current.revs)}</td><td>${nf(plan.incoming.revs)}</td></tr></tbody></table>
    ${v.stats.badSets + v.stats.badRecords ? `<p class="warn-inline">${nf(v.stats.badSets)} kumpulan data dan ${nf(v.stats.badRecords)} catatan di berkas tidak valid dan tidak ikut dipulihkan.</p>` : ''}${issuesHTML(v)}
    ${empty ? '' : `<div class="card note"><p><b>Data yang ada sekarang akan hilang</b> (kecuali yang juga ada di berkas). Disarankan mengunduh cadangan kondisi saat ini lebih dulu.</p><button class="btn" type="button" data-dl="1">⬇ Unduh cadangan kondisi saat ini</button><p class="meta" id="dl-state"></p></div>`}`;
  const [i, got] = await ask('Pulihkan cadangan penuh?', body, ['Batal', 'Ganti semua data'], d => ({ downloaded: d.dataset.dl === 'done' }), { danger: true, wide: true, onOpen: d => {
    const b = $('[data-dl]', d); if (!b) return;
    b.addEventListener('click', async () => {
      try { b.disabled = true; const s = await Store.snapshot({ full: true }); const name = `cadangan-sebelum-pemulihan_${stamp()}.json`;
        IO.download(new Blob([IO.serialize(IO.buildFull(s))], { type: 'application/json' }), name); d.dataset.dl = 'done'; $('#dl-state', d).textContent = `✓ Diunduh: ${name}`; }
      catch (e) { b.disabled = false; $('#dl-state', d).textContent = 'Gagal menyiapkan cadangan: ' + (e.message || e); }
    });
  } });
  if (i !== 1) return;
  if (!empty && !got.downloaded) {
    const [j] = await ask('Lanjut tanpa cadangan?', '<p>Anda belum mengunduh cadangan kondisi saat ini. Data yang ada sekarang tidak dapat dikembalikan setelah diganti.</p>', ['Kembali', 'Tetap ganti semua data'], null, { danger: true });
    if (j !== 1) return;
  }
  await settle(false);
  const res = await Store.restoreFull({ ...IO.restoreData(v), exportedAt: v.meta.exportedAt });
  if (S.meta.theme) document.documentElement.dataset.theme = S.meta.theme;
  S.q = ''; S.editId = null; S.sel.clear(); renderIOLists();
  await ask('Pemulihan selesai', `<p>Database dipulihkan: <b>${nf(res.sets)}</b> kumpulan data, <b>${nf(res.records)}</b> catatan, <b>${nf(res.revisions)}</b> revisi.</p>`, ['Tutup']);
}

/* ---------- aksi & pendengar ---------- */
Object.assign(acts, {
  pickall() { const c = $$('[name=pk]'), all = c.length && c.every(x => x.checked); c.forEach(x => (x.checked = !all)); },
  exp: id => doExport([id]), share: id => doShare([id]), 'exp-sel': () => doExport(picked()), 'share-sel': () => doShare(picked()), backup: () => doBackup(),
});
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id !== 'imp-merge' && id !== 'imp-restore') return;
  const f = e.target.files[0]; e.target.value = '';
  run(async () => { const v = await readImportFile(f); if (v) await (id === 'imp-merge' ? mergeFlow(v) : restoreFlow(v)); });
});
