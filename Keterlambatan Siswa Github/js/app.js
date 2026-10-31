/* app.js — UI inti: navigasi, pencatatan, autosave/draf, penguncian, daftar & detail data.
   Seluruh penulisan data lewat Store (store.js): UI tidak pernah menulis objek usang ke database dan tidak menjadi satu-satunya penjaga aturan kunci.
   Modul tambahan: ui-io.js (ekspor/impor/cadangan), ui-bulk.js (edit massal), ui-history.js (riwayat), ui-export.js (gambar/PDF). */
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDate = s => { if (!IO.isRealDate(s)) return String(s); const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }); };
const fmtTime = s => new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const nf = n => Number(n).toLocaleString('id-ID');
const fmtBytes = n => n < 1024 ? nf(n) + ' B' : n < 1048576 ? nf(Math.round(n / 102.4) / 10) + ' KB' : n < 1073741824 ? nf(Math.round(n / 104857.6) / 10) + ' MB' : nf(Math.round(n / 107374182.4) / 10) + ' GB';
const stamp = () => { const d = new Date(); return `${today()}_${pad(d.getHours())}${pad(d.getMinutes())}`; };
const opt = (v, t) => `<option value="${esc(v)}">${esc(t)}</option>`;
const ic = n => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const DATE_MIN = `${IO.YEAR_MIN}-01-01`, DATE_MAX = `${IO.YEAR_MAX}-12-31`;

/* ---------- pembantu data (cache memori; sumber kebenaran = IndexedDB lewat Store) ---------- */
S.sel = new Set(); S.selMode = false;
const getSet = id => S.sets.find(s => s.id === id);
const recsOf = id => S.recs.filter(r => r.setId === id).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt));
const cnt = id => S.recs.filter(r => r.setId === id).length;
const majorShort = r => Data.short(r.grade, r.majorKey);
const clsText = r => `${Data.label(r.grade)} · ${majorShort(r)} · Rombel ${r.rombel}`;
const badges = s => `<span class="bd${s.status === 'selesai' ? ' ok' : ''}">${s.status === 'selesai' ? 'Selesai' : 'Draf'}</span><span class="bd${s.locked ? ' gold' : ''}">${s.locked ? ic('lock') + ' Terkunci' : 'Terbuka'}</span>`;

/* ---------- toast, dialog, indikator simpan ---------- */
let tT;
function toast(msg, err) { const t = $('#toast'); t.textContent = msg; t.className = 'on' + (err ? ' err' : ''); clearTimeout(tT); tT = setTimeout(() => (t.className = ''), err ? 6000 : 2600); }
// Tombol pertama = batal (juga dipakai tombol Esc). Mengembalikan [indeksTombol, hasilRead(dialog)].
function ask(title, html, btns = ['Batal', 'OK'], read, o = {}) {
  return new Promise(res => {
    const d = document.createElement('dialog'); if (o.wide) d.className = 'wide';
    d.innerHTML = `<h3>${esc(title)}</h3><div>${html}</div><div class="row foot" style="justify-content:flex-end">${btns.map((b, i) => `<button class="btn${i === btns.length - 1 ? (o.danger ? ' pri danger' : ' pri') : ''}" data-i="${i}">${esc(b)}</button>`).join('')}</div>`;
    let out = [0, null];
    d.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) { out = [+b.dataset.i, read ? read(d) : null]; d.close(); } });
    d.addEventListener('close', () => { d.remove(); res(out); });
    document.body.appendChild(d); d.showModal();
    if (o.onOpen) o.onOpen(d);
  });
}
const info = (title, msg) => ask(title, `<p>${esc(msg)}</p>`, ['Tutup']);

// Indikator simpan: "Tersimpan" hanya bila tidak ada penulisan berjalan DAN tidak ada kegagalan yang tercatat.
let lastErr = '';
Store.onStatus(({ pending, errors }) => {
  const e = $('#save'); if (!e) return;
  if (errors.length) {
    const quota = errors.some(x => x.e && x.e.name === 'QuotaExceededError');
    e.textContent = quota ? 'Perlu perhatian' : 'Gagal menyimpan'; e.dataset.s = 'err';
    const key = errors.map(x => x.ch + ':' + (x.e && x.e.name)).join();
    if (key !== lastErr) toast(quota ? 'Penyimpanan perangkat penuh. Ekspor cadangan lalu kosongkan ruang; data yang sudah tersimpan tidak dihapus.' : 'Gagal menyimpan: ' + ((errors[0].e && errors[0].e.message) || 'kesalahan database') + '. Ketuk indikator untuk mencoba lagi.', true);
    lastErr = key;
  } else { lastErr = ''; e.textContent = pending ? 'Menyimpan…' : 'Tersimpan'; e.dataset.s = pending ? 'busy' : 'ok'; }
});
async function run(fn) {
  try { await fn(); }
  catch (e) {
    if (e && e.rule) toast(e.message, true);                      // pelanggaran aturan (mis. data terkunci): pesan jelas
    else if (!(e && (e.saveFailed || e.shown))) { console.error(e); toast('Terjadi kesalahan: ' + ((e && e.message) || e), true); }
  }
}
let ssT = 0;
const saveStateSoon = () => { clearTimeout(ssT); ssT = setTimeout(() => { ssT = 0; Store.saveState().catch(() => {}); }, 300); };

/* ---------- dropdown berjenjang Kelas → Jurusan → Rombel (dari majors.js, selalu sadar-tingkat) ---------- */
function cascade(g, m, r, sel = {}, all) {
  const fill = (el, label, items, val, auto) => {
    el.innerHTML = opt('', (all ? 'Semua ' : 'Pilih ') + label) + items.map(([v, t]) => opt(v, t)).join('');
    el.value = items.some(i => i[0] === val) ? val : auto && items.length === 1 ? items[0][0] : '';
    el.disabled = !items.length;
  };
  fill(g, 'kelas', Data.grades().map(x => [x, Data.label(x)]), sel.grade);
  // Tanpa tingkat kelas (hanya filter): label menyebut SEMUA variasi nama jurusan beserta tingkatnya.
  fill(m, 'jurusan', all || g.value ? Data.majorsFor(g.value).map(x => [x.key, Data.majorLabel(g.value, x.key)]) : [], sel.majorKey);
  fill(r, 'rombel', all || m.value ? Data.rombelsFor(g.value, m.value).map(x => [x, Data.rombelLabel(g.value, m.value, x)]) : [], sel.rombel, !all);
}
const readSel = p => ({ grade: $(`#${p}-grade`).value, majorKey: $(`#${p}-major`).value, rombel: $(`#${p}-rombel`).value });
const readForm = () => ({ name: $('#f-name').value, ...readSel('f') });
function majorHint() {
  const el = $('#x-hint'); if (!el) return;
  const g = $('#x-grade').value, mix = Data.mixedNames();
  el.hidden = !!g || !mix.length;
  el.innerHTML = g || !mix.length ? '' : 'Beberapa jurusan punya nama berbeda antartingkat: ' + mix.map(x => x.variants.map(v => `${esc(v.short)} (${esc(Data.gradeText(v.grades))})`).join(' = ')).join('; ') + '. Filter jurusan mencakup semua tingkat; pilih tingkat kelas dulu bila ingin nama yang tepat.';
}

/* ---------- autosave: draf formulir & nama/tanggal kumpulan data ----------
   Penulisan memakai transaksi baca-ubah-tulis di Store, jadi urutan penulisan tidak bergantung pada waktu debounce.
   flushDraft/saveSetFields mengembalikan Promise yang selesai setelah commit, sehingga Selesaikan/Kunci/Ekspor dapat menunggunya. */
let dT = 0, sT = 0, submitting = false;
const draftSoon = () => { clearTimeout(dT); dT = setTimeout(flushDraft, 250); };
function flushDraft() {
  clearTimeout(dT); dT = 0;
  if (!$('#f-name') || !S.cur) return Promise.resolve();
  return Store.saveDraft({ setId: S.cur, editId: S.editId, ...readForm() }).catch(() => {});   // kegagalan sudah tercatat di indikator
}
// strict=true: nilai tidak sah (nama kosong/tanggal ngawur) dikembalikan ke nilai tersimpan dengan pesan; strict=false: dilewati diam-diam (pengguna masih mengetik).
function saveSetFields(strict) {
  clearTimeout(sT); sT = 0;
  const n = $('#s-name'), d = $('#s-date'), id = S.cur, s = id && getSet(id);
  if (!n || !d || !s || s.locked) return Promise.resolve();
  const name = squash(n.value), date = d.value, bad = !name ? 'Nama kumpulan data tidak boleh kosong; dikembalikan ke nama sebelumnya.' : !IO.isRealDate(date) ? 'Tanggal tidak valid; dikembalikan ke tanggal sebelumnya.' : '';
  const revert = () => { const c = getSet(id); if (c && $('#s-name')) { $('#s-name').value = c.name; $('#s-date').value = c.date; } };
  if (bad) { if (strict) return Store.flush().then(() => { revert(); toast(bad, true); }); return Promise.resolve(); }
  return Store.patchSet(id, { name, date }).catch(e => { if (e && e.rule) { revert(); toast(e.message, true); return; } throw e; });
}
Store.onRetryFields(() => saveSetFields(true));
// Tulis semua yang tertunda lalu tunggu sampai benar-benar commit. Melempar bila nama/tanggal gagal disimpan.
async function settle(strict) {
  const a = $('#s-name') ? saveSetFields(!!strict) : Promise.resolve(), b = flushDraft();
  if (ssT) { clearTimeout(ssT); ssT = 0; Store.saveState().catch(() => {}); }
  await Promise.all([a, b]); await Store.flush();
}

/* ---------- router ---------- */
const routes = { '': vHome, buat: vCreate, lihat: vList, set: vSet };    // ui-io.js, ui-history.js mendaftarkan rute io & riwayat
const afters = { buat: afterCreate, lihat: () => {}, set: afterSet };
function go(h) { location.hash === h ? render() : (location.hash = h); }
function render() {
  flushDraft(); if (sT) saveSetFields(false).catch(() => {});
  const [name = '', a, b] = location.hash.replace(/^#\/?/, '').split('/');
  document.body.dataset.r = ({ '': 'home', buat: 'buat', lihat: 'lihat', set: 'lihat', riwayat: 'lihat', io: 'io', panduan: 'panduan' })[name] || 'home';
  const v = $('#view'); S.cur = null; S.selMode = false; S.sel.clear();
  v.innerHTML = (routes[name] || vHome)(a, b);
  (afters[name] || (() => {}))(a, b);
  v.focus({ preventScroll: true }); window.scrollTo(0, 0);
}
// Segarkan bagian daftar saat data berubah di tab lain (tanpa merombak formulir yang sedang diisi).
function refreshViews() {
  const name = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (name === 'buat' || name === 'set') { if (!S.cur || !getSet(S.cur)) return render(); name === 'buat' ? renderEntries() : renderData(); }
  else if (name === 'lihat') { const el = $('#sets'); if (el) el.innerHTML = setsHTML(); }
  else if (name === 'io' && typeof renderIOLists === 'function') renderIOLists();
  else if (name === 'riwayat' && typeof refreshHistory === 'function') refreshHistory();
}
Store.onExternal(refreshViews);

/* ---------- beranda ---------- */
function vHome() {
  const dr = S.sets.filter(s => s.status === 'draf').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  return `<section class="hero"><h1>Pencatatan Keterlambatan Siswa</h1><p>Pilih menu di bawah. Data tersimpan otomatis di perangkat ini.</p></section>
  ${typeof PWAInstall !== 'undefined' ? PWAInstall.html() : ''}
  ${dr ? `<div class="card note"><h3>Sesi belum selesai</h3><p class="meta">${esc(dr.name)} · ${cnt(dr.id)} siswa · diubah ${fmtTime(dr.updatedAt)}</p>
    <div class="row"><button class="btn pri" data-act="resume" data-id="${dr.id}">Lanjutkan pencatatan</button><a class="btn" href="#/set/${dr.id}">Lihat data</a><button class="btn" data-act="finish" data-id="${dr.id}">Selesaikan</button><button class="btn" data-act="newset">Buat sesi baru</button></div></div>` : ''}
  <nav class="menu"><a class="tile tile-main" href="#/buat"><i>${ic('plus')}</i><div><b>Membuat Data</b><span>Catat siswa yang terlambat</span></div></a>
  <a class="tile" href="#/lihat"><i>${ic('list')}</i><div><b>Melihat Data</b><span>Cari, edit, kunci, atur, dan telusuri riwayat data tersimpan</span></div></a>
  <a class="tile" href="#/io"><i>${ic('swap')}</i><div><b>Ekspor/Impor Data</b><span>Cadangan, pindah perangkat, gambar &amp; PDF, bagikan file</span></div></a>
  <a class="tile tile-guide" href="#/panduan"><i>${ic('help')}</i><div><b>Panduan</b><span>Penjelasan fungsi aplikasi dan cara memakainya, langkah demi langkah</span></div></a></nav>`;
}

/* ---------- membuat data ---------- */
function vCreate(a) {
  let set = a === 'baru' ? null : a ? getSet(a) : getSet(st().activeSetId);
  if (!a && set && set.status === 'selesai') set = null;
  if (!set) return `<h2>Sesi Baru</h2><div class="card"><label>Nama kumpulan data<input id="n-name" maxlength="${IO.NAME_MAX}" value="${esc('Keterlambatan, ' + fmtDate(today()))}"></label><label>Tanggal kejadian<input id="n-date" type="date" min="${DATE_MIN}" max="${DATE_MAX}" value="${today()}"></label><button class="btn pri" data-act="start">Mulai Mencatat</button></div>`;
  S.cur = set.id;
  const L = set.locked;
  return `<div class="bar"><h2>Membuat Data</h2><div>${badges(set)}</div></div>
  <details class="card setinfo"><summary><span><b>${esc(set.name)}</b><small>${fmtDate(set.date)}</small></span><em>Ubah</em></summary><label>Nama kumpulan data<input id="s-name" maxlength="${IO.NAME_MAX}" value="${esc(set.name)}" ${L ? 'disabled' : ''}></label><label>Tanggal kejadian<input id="s-date" type="date" min="${DATE_MIN}" max="${DATE_MAX}" value="${set.date}" ${L ? 'disabled' : ''}></label></details>
  ${L ? `<div class="card note"><p>Kumpulan data ini terkunci, jadi tidak bisa diubah.</p><button class="btn" data-act="lockset" data-id="${set.id}">Buka kunci</button></div>` : `
  <div class="card"><p class="hint">Ketik nama, pilih kelas, lalu tekan <b>Masukan Data</b>. Setiap entri tersimpan otomatis.</p><form id="f" autocomplete="off" novalidate><label>Nama siswa<input id="f-name" maxlength="${IO.NAME_MAX}" enterkeyhint="done" autocapitalize="words" autocorrect="off" spellcheck="false"></label>
  <div class="g3"><label>Kelas<select id="f-grade"></select></label><label>Jurusan<select id="f-major"></select></label><label>Rombel<select id="f-rombel"></select></label></div>
  <label class="chk"><input type="checkbox" id="f-keep" ${st().keepOn ? 'checked' : ''}>Pertahankan pilihan kelas untuk entri berikutnya</label>
  <div class="row"><button class="btn pri grow" id="f-ok" type="submit">Masukan Data</button><button class="btn" type="button" id="f-cancel" data-act="cancel" hidden>Batal</button></div></form></div>`}
  <h3>Daftar entri <span id="cnt"></span></h3><div id="entries"></div>
  <div class="row foot"><button class="btn pri grow" data-act="finish" data-id="${set.id}">Simpan &amp; Selesaikan</button><a class="btn grow" href="#/set/${set.id}">Lihat Data</a></div>`;
}
function afterCreate(a, b) {
  const set = getSet(S.cur); S.editId = null; if (!set) return;
  if (st().activeSetId !== set.id) { st().activeSetId = set.id; saveStateSoon(); }
  if (!set.locked) {
    const d = S.meta.draft && S.meta.draft.setId === set.id ? S.meta.draft : null;
    $('#f-name').value = d ? d.name || '' : '';
    cascade($('#f-grade'), $('#f-major'), $('#f-rombel'), d || st().keep || {});
    const eid = b || (d && d.editId), rec = eid && S.recs.find(r => r.id === eid && r.setId === set.id);
    if (rec && (b || !rec.locked)) run(() => beginEdit(eid, !!b));
  }
  renderEntries();
}
function renderEntries() {
  const el = $('#entries'); if (!el || !S.cur) return;
  const set = getSet(S.cur), rs = recsOf(S.cur), L = set.locked;
  $('#cnt').textContent = `(${rs.length})`;
  el.innerHTML = rs.length ? rs.map((r, i) => `<div class="ent${r.locked ? ' lk' : ''}${r.id === S.editId ? ' ed' : ''}"><span class="no">${i + 1}</span>
    <div class="who"><b>${esc(r.name)}</b><small>${esc(clsText(r))}</small></div>
    <div class="acts"><button class="ib" data-act="up" data-id="${r.id}" aria-label="Naikkan" ${i === 0 || L ? 'disabled' : ''}>${ic('up')}</button><button class="ib" data-act="down" data-id="${r.id}" aria-label="Turunkan" ${i === rs.length - 1 || L ? 'disabled' : ''}>${ic('down')}</button>
    <button class="ib" data-act="edit" data-id="${r.id}" aria-label="Edit ${esc(r.name)}" ${L ? 'disabled' : ''}>${ic('edit')}</button><button class="ib" data-act="lock" data-id="${r.id}" aria-label="${r.locked ? 'Buka kunci' : 'Kunci'} ${esc(r.name)}" ${L ? 'disabled' : ''}>${ic(r.locked ? 'lock' : 'unlock')}</button>
    <button class="ib danger" data-act="del" data-id="${r.id}" aria-label="Hapus ${esc(r.name)}" ${L || r.locked ? 'disabled' : ''}>${ic('trash')}</button></div></div>`).join('')
    : '<div class="empty">Belum ada entri. Isi formulir, lalu tekan Masukan Data.</div>';
}
const refresh = () => { renderEntries(); renderData(); };
function markEdit() { const ok = $('#f-ok'); if (ok) { ok.textContent = S.editId ? 'Simpan Perubahan' : 'Masukan Data'; $('#f-cancel').hidden = !S.editId; } renderEntries(); }

// Simpan dulu, baru ubah UI: formulir dikosongkan hanya setelah transaksi berhasil, dan hanya bila isinya belum diubah pengguna.
async function submitForm() {
  if (submitting) return;                                   // cegah ketukan ganda → entri ganda
  const set = getSet(S.cur); if (!set || set.locked) return toast('Kumpulan data terkunci.', true);
  const f = readForm(), name = squash(f.name);
  if (!name) { $('#f-name').focus(); return toast('Nama siswa wajib diisi.', true); }
  if (!Data.valid(f.grade, f.majorKey, f.rombel)) return toast('Pilih kelas, jurusan, dan rombel yang valid.', true);
  const dup = S.recs.some(r => r.setId === set.id && r.id !== S.editId && r.grade === f.grade && r.majorKey === f.majorKey && r.rombel === f.rombel && r.name.toLowerCase() === name.toLowerCase());
  if (dup) { const [i] = await ask('Kemungkinan data ganda', `<p>Sudah ada <b>${esc(name)}</b> di ${esc(clsText(f))} pada kumpulan data ini. Dua siswa bisa saja bernama sama.</p>`, ['Batal', 'Tetap masukkan']); if (i !== 1) return; }
  submitting = true; const okBtn = $('#f-ok'); if (okBtn) okBtn.disabled = true;
  try {
    const clearName = () => { const el = $('#f-name'); if (el && el.value === f.name) el.value = ''; };
    if (S.editId) {
      const res = await Store.updateRecord(S.editId, { name, grade: f.grade, majorKey: f.majorKey, rombel: f.rombel });
      S.editId = null; clearName(); if ($('#f-ok')) markEdit(); toast(res.changed ? 'Perubahan disimpan.' : 'Tidak ada yang berubah.');
    } else {
      await Store.addRecord(set.id, { name, grade: f.grade, majorKey: f.majorKey, rombel: f.rombel });
      clearName(); if (!st().keepOn && $('#f-grade')) cascade($('#f-grade'), $('#f-major'), $('#f-rombel'), {});
      st().keep = { grade: f.grade, majorKey: f.majorKey, rombel: f.rombel }; saveStateSoon();
      if ($('#entries')) renderEntries(); toast('Tersimpan: ' + name);
    }
  } finally { submitting = false; if ($('#f-ok')) $('#f-ok').disabled = false; }
  flushDraft(); const nm = $('#f-name'); if (nm) nm.focus();
}
async function beginEdit(id, fill) {
  const r = S.recs.find(x => x.id === id); if (!r || getSet(r.setId).locked || !$('#f-name')) return;
  if (r.locked) {
    const [i] = await ask('Buka kunci catatan?', `<p>Catatan <b>${esc(r.name)}</b> (${esc(clsText(r))}) terkunci. Buka kunci untuk mengeditnya?</p>`, ['Batal', 'Buka kunci & edit']);
    if (i !== 1) return;
    await Store.setRecordLock(id, false);
  }
  S.editId = id;
  if (fill) { const c = S.recs.find(x => x.id === id); $('#f-name').value = c.name; cascade($('#f-grade'), $('#f-major'), $('#f-rombel'), c); $('#f-name').focus(); }
  markEdit(); flushDraft();
}

/* ---------- melihat data ---------- */
function vList() {
  const o = [['newest', 'Tanggal terbaru'], ['oldest', 'Tanggal terlama'], ['changed', 'Perubahan terakhir'], ['name', 'Nama'], ['count', 'Jumlah catatan']];
  return `<div class="bar"><h2>Melihat Data</h2><a class="btn" href="#/riwayat">Riwayat &amp; pemulihan</a></div><div class="card"><label>Cari kumpulan data<input id="q" type="search" placeholder="Nama kumpulan data" value="${esc(S.q)}"></label>
  <label>Urutkan<select id="lsort">${o.map(([v, t]) => `<option value="${v}"${st().listSort === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label></div><div id="sets">${setsHTML()}</div>`;
}
function setsHTML() {
  const q = S.q.trim().toLowerCase();
  const C = { newest: (a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt), oldest: (a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt), changed: (a, b) => b.updatedAt.localeCompare(a.updatedAt), name: (a, b) => a.name.localeCompare(b.name, 'id'), count: (a, b) => cnt(b.id) - cnt(a.id) };
  const ss = S.sets.filter(s => s.name.toLowerCase().includes(q)).sort(C[st().listSort] || C.newest);
  if (!ss.length) return `<div class="empty">${S.sets.length ? 'Tidak ada kumpulan data yang cocok.' : 'Belum ada data tersimpan. Mulai dari menu Membuat Data.'}</div>`;
  const lockedBy = new Map(); S.recs.forEach(r => { if (r.locked) lockedBy.set(r.setId, (lockedBy.get(r.setId) || 0) + 1); });
  return ss.map(s => {
    const rs = S.recs.filter(r => r.setId === s.id), rb = new Set(rs.map(r => `${r.grade}|${r.majorKey}|${r.rombel}`)).size, lk = lockedBy.get(s.id) || 0;
    return `<article class="card"><div class="bar"><h3><a href="#/set/${s.id}">${esc(s.name)}</a></h3><div>${badges(s)}</div></div>
    <p class="meta">${fmtDate(s.date)} · ${rs.length} siswa · ${rb} rombel${lk ? ` · ${lk} catatan 🔒` : ''} · diubah ${fmtTime(s.updatedAt)}</p>
    <div class="row srow"><a class="btn pri" href="#/set/${s.id}">Buka</a><button class="btn" data-act="dup" data-id="${s.id}">Salin</button><button class="btn" data-act="lockset" data-id="${s.id}">${s.locked ? 'Buka kunci' : 'Kunci'}</button><button class="btn" data-act="share" data-id="${s.id}">Bagikan</button><button class="btn" data-act="exp" data-id="${s.id}">Ekspor</button><button class="btn danger" data-act="delset" data-id="${s.id}">Hapus</button></div></article>`;
  }).join('');
}
function vSet(id) {
  const s = getSet(id); if (!s) return '<div class="empty">Kumpulan data tidak ditemukan.</div>';
  S.cur = id; const f = st().filters, m = st().mode;
  const so = [['no', 'No. (urutan manual)'], ['grade', 'Tingkat kelas'], ['major', 'Jurusan'], ['rombel', 'Rombel'], ['name', 'Nama siswa']];
  return `<div class="bar"><h2>${esc(s.name)}</h2><div>${badges(s)}</div></div><p class="meta">${fmtDate(s.date)} · <span id="shown"></span></p>
  <div class="row arow"><a class="btn pri" href="#/buat/${id}">Tambah / edit</a><button class="btn" data-act="lockset" data-id="${id}">${s.locked ? 'Buka kunci' : 'Kunci'}</button><button class="btn" data-act="selmode" ${s.locked ? 'disabled title="Buka kunci kumpulan data dulu"' : ''}>Pilih (edit massal)</button></div>
  <div class="row xrow"><button class="btn" data-act="vx-matrix" data-id="${id}">Ekspor Matriks Kelas</button><button class="btn" data-act="vx-set" data-id="${id}">Gambar / PDF…</button><button class="btn" data-act="exp" data-id="${id}">Ekspor JSON</button><button class="btn" data-act="share" data-id="${id}">Bagikan</button><a class="btn" href="#/riwayat/${id}">Riwayat</a></div>
  <details class="card foot" open><summary><b>Filter &amp; urutan</b></summary><label>Nama siswa<input id="x-name" type="search" value="${esc(f.name || '')}"></label>
  <div class="g3"><select id="x-grade" aria-label="Tingkat kelas"></select><select id="x-major" aria-label="Jurusan"></select><select id="x-rombel" aria-label="Rombel"></select></div>
  <p class="meta" id="x-hint" hidden></p>
  <div class="row"><select id="x-sort" aria-label="Urutkan tabel" style="flex:1">${so.map(([v, t]) => opt(v, t)).join('')}</select><button class="ib" id="sd" data-act="sortdir" aria-label="Balik arah urutan">${st().sort.dir > 0 ? '↑' : '↓'}</button></div>
  <div class="row foot"><button class="btn" data-act="reset">Reset filter</button><button class="btn" data-act="applysort">Simpan urutan ini</button></div></details>
  <div class="seg"><button data-act="mode" data-id="tabel" class="${m === 'tabel' ? 'on' : ''}">Tabel</button><button data-act="mode" data-id="kelompok" class="${m === 'kelompok' ? 'on' : ''}">Kelompok Kelas</button></div><div id="selbar"></div><div id="data"></div>`;
}
function afterSet() { if (!S.cur) return; cascade($('#x-grade'), $('#x-major'), $('#x-rombel'), st().filters, true); majorHint(); $('#x-sort').value = st().sort.col; renderData(); }
function filtered(id) {
  const f = st().filters, q = (f.name || '').trim().toLowerCase();
  return recsOf(id).filter(r => (!f.grade || r.grade === f.grade) && (!f.majorKey || r.majorKey === f.majorKey) && (!f.rombel || r.rombel === f.rombel) && (!q || r.name.toLowerCase().includes(q)));
}
const sorted = rs => rs.slice().sort(Store.cmp(st().sort));
function renderData() {
  const el = $('#data'), s = S.cur && getSet(S.cur); if (!el || !s) return;
  const all = recsOf(s.id), rs = sorted(filtered(s.id)), L = s.locked;
  const sel = S.selMode && !L && st().mode === 'tabel';
  if (S.selMode && L) { S.selMode = false; S.sel.clear(); }
  $('#shown').textContent = `${rs.length} dari ${all.length} siswa`;
  if (typeof Bulk !== 'undefined') Bulk.bar();
  if (!rs.length) { el.innerHTML = `<div class="empty">${all.length ? 'Tidak ada data yang cocok dengan filter.' : 'Belum ada siswa tercatat.'}</div>`; return; }
  if (st().mode === 'kelompok') { el.innerHTML = groupHTML(rs); return; }
  const vis = new Set(rs.map(r => r.id)); [...S.sel].forEach(i => { if (!vis.has(i) && !S.recs.some(r => r.id === i)) S.sel.delete(i); });
  const allOn = rs.every(r => S.sel.has(r.id));
  el.innerHTML = `<div class="tw"><table class="tbl${sel ? ' sel' : ''}"><thead><tr>${sel ? `<th class="ck"><input type="checkbox" data-selall aria-label="Pilih semua yang tampil" ${allOn ? 'checked' : ''}></th>` : ''}<th>No.</th><th>Tingkat Kelas</th><th>Jurusan</th><th>Rombel</th><th>Nama Siswa</th><th><span class="sr">Aksi</span></th></tr></thead><tbody>${rs.map((r, i) => `<tr class="${r.locked ? 'lk' : ''}${sel && S.sel.has(r.id) ? ' picked' : ''}">${sel ? `<td class="ck" data-l="Pilih"><input type="checkbox" data-sel="${r.id}" ${S.sel.has(r.id) ? 'checked' : ''} aria-label="Pilih ${esc(r.name)}"></td>` : ''}<td data-l="No.">${i + 1}</td><td data-l="Tingkat Kelas">${esc(Data.label(r.grade))}</td><td data-l="Jurusan" title="${esc(Data.fullName(r.grade, r.majorKey))}">${esc(majorShort(r))}</td><td data-l="Rombel">${esc(r.rombel)}</td><td data-l="Nama Siswa"><b>${esc(r.name)}</b>${r.locked ? ' ' + ic('lock') : ''}</td>
  <td class="act">${L || sel ? '' : `<a class="ib" href="#/buat/${s.id}/${r.id}" aria-label="Edit ${esc(r.name)}">${ic('edit')}</a><button class="ib" data-act="lock" data-id="${r.id}" aria-label="${r.locked ? 'Buka kunci' : 'Kunci'} ${esc(r.name)}">${ic(r.locked ? 'lock' : 'unlock')}</button><button class="ib danger" data-act="del" data-id="${r.id}" aria-label="Hapus ${esc(r.name)}" ${r.locked ? 'disabled' : ''}>🗑</button>`}</td></tr>`).join('')}</tbody></table></div>`;
}
// Kelas → Jurusan → Rombel → Daftar siswa (urutan jurusan mengikuti majors.js; nama jurusan mengikuti tingkat; kunci tak dikenal tetap ditampilkan).
function groupHTML(rs) {
  const by = {}; rs.forEach(r => (((by[r.grade] ||= {})[r.majorKey] ||= {})[r.rombel] ||= []).push(r));
  return Data.grades().filter(g => by[g]).map(g => {
    const keys = Object.keys(by[g]).sort((a, b) => Data.majorIndex(g, a) - Data.majorIndex(g, b));
    return `<section class="grp"><h3>${esc(Data.label(g))}</h3>${keys.map(k => `<div class="sub"><h4>${esc(Data.short(g, k))}</h4>${Object.keys(by[g][k]).sort((a, b) => a - b).map(rb => `<div class="rb"><h5>Rombel ${esc(rb)} <small>(${by[g][k][rb].length})</small></h5><ol>${sorted(by[g][k][rb]).map(r => `<li>${esc(r.name)}${r.locked ? ' ' + ic('lock') : ''}</li>`).join('')}</ol></div>`).join('')}</div>`).join('')}</section>`;
  }).join('');
}

/* ---------- aksi (delegasi klik) ---------- */
// Pesan jelas saat penghapusan kumpulan data diblokir aturan kunci.
async function blockedDelete(s, kind, n) {
  const msg = kind === 'SET_LOCKED' ? `<p>Kumpulan data <b>${esc(s.name)}</b> sedang terkunci, jadi tidak dapat dihapus.</p><p>Buka kunci kumpulan data lebih dulu, lalu coba hapus lagi.</p>`
    : `<p>Kumpulan data <b>${esc(s.name)}</b> berisi <b>${n} catatan terkunci</b>, jadi tidak dapat dihapus. Catatan terkunci tidak pernah dihapus diam-diam.</p><p>Buka kunci catatan tersebut lebih dulu (ikon 🔒 pada baris catatan, atau pilih beberapa catatan lalu “Buka kunci”), kemudian hapus lagi.</p>`;
  const [i] = await ask('Tidak dapat menghapus', msg, ['Tutup', 'Buka kumpulan data']);
  if (i === 1) go('#/set/' + s.id);
}
const acts = {
  async start() {
    const s = await Store.createSet({ name: $('#n-name').value, date: $('#n-date').value });
    st().activeSetId = s.id; Store.saveState().catch(() => {}); go('#/buat/' + s.id);
  },
  resume(id) { st().activeSetId = id; Store.saveState().catch(() => {}); go('#/buat/' + id); },
  newset() { go('#/buat/baru'); },
  async finish(id) {
    await settle(true);                           // nama/tanggal/draf terbaru benar-benar tersimpan dulu; gagal → berhenti di sini
    await Store.finishSet(id); toast('Kumpulan data diselesaikan.'); go('#/lihat');
  },
  up: id => move(id, -1), down: id => move(id, 1), edit: id => beginEdit(id, true),
  cancel() { S.editId = null; $('#f-name').value = ''; markEdit(); flushDraft(); },
  async del(id) {
    const r = S.recs.find(x => x.id === id); if (!r) return;
    if (r.locked || getSet(r.setId).locked) return toast('Catatan terkunci. Buka kunci terlebih dahulu.', true);
    const [i] = await ask('Hapus catatan?', `<p>Hapus <b>${esc(r.name)}</b> (${esc(clsText(r))})? Penghapusan tercatat di riwayat dan dapat dipulihkan dari sana.</p>`, ['Batal', 'Hapus'], null, { danger: true }); if (i !== 1) return;
    await Store.deleteRecord(id); if (S.editId === id) { S.editId = null; markEdit(); } refresh(); toast('Catatan dihapus.');
  },
  async lock(id) {
    const r = S.recs.find(x => x.id === id); if (!r || getSet(r.setId).locked) return;
    if (r.locked) { const [i] = await ask('Buka kunci catatan?', `<p>Buka kunci <b>${esc(r.name)}</b> (${esc(clsText(r))})? Catatan ini akan dapat diedit dan dihapus lagi.</p>`, ['Batal', 'Buka kunci']); if (i !== 1) return; }
    await Store.setRecordLock(id, !r.locked); refresh();
  },
  async lockset(id) {
    const s = getSet(id); if (!s) return; const lock = !s.locked;
    if (!lock) { const [i] = await ask('Buka kunci kumpulan data?', `<p><b>${esc(s.name)}</b> (${cnt(id)} siswa) akan dapat diubah lagi.</p>`, ['Batal', 'Buka kunci']); if (i !== 1) return; }
    await settle(true);                           // simpan nama/tanggal terbaru SEBELUM status kunci berubah
    await Store.setSetLock(id, lock); render();
  },
  async dup(id) {
    const s = getSet(id), n = cnt(id); if (!s) return;
    const [i, v] = await ask('Salin kumpulan data', `<label>Nama<input id="d-name" maxlength="${IO.NAME_MAX}" value="${esc(s.name)} (salinan)"></label><label>Tanggal kejadian<input id="d-date" type="date" min="${DATE_MIN}" max="${DATE_MAX}" value="${s.date}"></label><p class="meta">${n} catatan disalin dengan ID baru. Status kunci tidak ikut disalin; data asli tidak berubah.</p>`, ['Batal', 'Salin'], d => ({ name: $('#d-name', d).value, date: $('#d-date', d).value }));
    if (i !== 1) return;
    await Store.duplicateSet(id, v); toast('Salinan dibuat.'); render();
  },
  async delset(id) {
    const s = getSet(id); if (!s) return;
    const lk = S.recs.filter(r => r.setId === id && r.locked).length;
    if (s.locked) return blockedDelete(s, 'SET_LOCKED');
    if (lk) return blockedDelete(s, 'HAS_LOCKED', lk);
    const [i] = await ask('Hapus kumpulan data?', `<p><b>${esc(s.name)}</b> beserta ${cnt(id)} catatan akan dihapus dari perangkat ini. Penghapusan tercatat di riwayat sehingga dapat dipulihkan dari “Riwayat &amp; pemulihan”, tetapi ekspor cadangan lebih dulu bila perlu.</p>`, ['Batal', 'Hapus'], null, { danger: true }); if (i !== 1) return;
    try { await Store.deleteSet(id); }
    catch (e) { if (e && e.rule && (e.code === 'HAS_LOCKED' || e.code === 'SET_LOCKED')) return blockedDelete(s, e.code, e.info && e.info.locked); throw e; }
    toast('Kumpulan data dihapus.'); render();
  },
  mode(id) { st().mode = id; saveStateSoon(); $$('.seg button').forEach(b => b.classList.toggle('on', b.dataset.id === id)); renderData(); },
  reset() { st().filters = {}; saveStateSoon(); render(); },
  sortdir() { st().sort.dir *= -1; $('#sd').textContent = st().sort.dir > 0 ? '↑' : '↓'; saveStateSoon(); renderData(); },
  async applysort() {
    const s = getSet(S.cur), L = recsOf(s.id);
    if (s.locked || L.some(r => r.locked)) return toast('Ada data terkunci; urutan tidak dapat disimpan.', true);
    if (st().sort.col === 'no') return toast('Pilih urutan selain "No." lebih dulu.', true);
    const spec = { ...st().sort }, [i] = await ask('Simpan urutan?', `<p>Urutan "${esc($('#x-sort').selectedOptions[0].text)}" menjadi urutan manual untuk ${L.length} siswa.</p>`, ['Batal', 'Simpan urutan']); if (i !== 1) return;
    await Store.sortSet(s.id, spec);
    st().sort = { col: 'no', dir: 1 }; saveStateSoon(); $('#x-sort').value = 'no'; $('#sd').textContent = '↑'; renderData(); toast('Urutan disimpan.');
  },
  theme() { const t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = t; Store.saveTheme(t).catch(() => {}); },
  async savestat() {
    if (Store.status().errors.length) { await Store.retry(); await Store.flush(); toast(Store.status().errors.length ? 'Masih gagal menyimpan. Ekspor cadangan sebagai pengaman.' : 'Berhasil menyimpan.', !!Store.status().errors.length); }
    else toast('Semua perubahan sudah tersimpan di perangkat ini.');
  },
  help: () => ask('Pasang & pakai offline', '<p><b>Android (Chrome, Edge, Samsung Internet):</b> menu ⋮ → <i>Instal aplikasi</i> atau <i>Tambahkan ke layar utama</i>.</p><p><b>iPhone/iPad (Safari):</b> tombol Bagikan → <i>Tambah ke Layar Utama</i>.</p><p><b>Firefox Android:</b> menu → <i>Instal</i>.</p><p class="meta">Buka sekali dengan internet agar aset tersimpan; setelah itu aplikasi jalan offline. Pemasangan dan mode offline hanya aktif lewat HTTPS.</p>', ['Tutup']),
};
// Naik/turun: hanya dua catatan yang bertukar tempat yang berubah; catatan terkunci menjadi "pembatas" yang tidak dapat dilompati.
async function move(id, d) {
  const r = S.recs.find(x => x.id === id), s = r && getSet(r.setId); if (!s || s.locked) return;
  const L = recsOf(s.id), i = L.findIndex(x => x.id === id); if (!L[i + d]) return;
  if (r.locked || L[i + d].locked) return toast('Catatan terkunci tidak dapat dipindahkan.', true);
  await Store.swapRecords(id, d); renderEntries();
}
document.addEventListener('click', e => { const b = e.target.closest('[data-act]'), fn = b && !b.disabled && acts[b.dataset.act]; if (fn) run(() => fn(b.dataset.id, b)); });
document.addEventListener('submit', e => { if (e.target.id === 'f') { e.preventDefault(); run(submitForm); } });
// Tombol formulir tidak boleh mencuri fokus saat ditekan: bila kolom terfokus kehilangan fokus di tengah klik, menu bawah muncul lagi dan baris tombol melompat naik,
// sehingga mouse-up jatuh di elemen lain dan klik tidak pernah sampai ke tombol (data tidak tersimpan). Dengan ini fokus tetap di kolom, tata letak diam, klik utuh.
document.addEventListener('mousedown', e => { if (e.target.closest('#f-ok, #f-cancel')) e.preventDefault(); });
document.addEventListener('input', e => {
  const id = e.target.id;
  if (id === 'f-name') draftSoon();
  else if (id === 's-name' || id === 's-date') { clearTimeout(sT); sT = setTimeout(() => run(() => saveSetFields(false)), 400); }
  else if (id === 'x-name') { st().filters.name = e.target.value; saveStateSoon(); renderData(); }
  else if (id === 'q') { S.q = e.target.value; $('#sets').innerHTML = setsHTML(); }
});
document.addEventListener('change', e => {
  const id = e.target.id || '';
  if (/^f-(grade|major|rombel)$/.test(id)) { cascade($('#f-grade'), $('#f-major'), $('#f-rombel'), readSel('f')); draftSoon(); }
  else if (id === 'f-keep') { st().keepOn = e.target.checked; Store.saveState().catch(() => {}); }
  else if (id === 's-name' || id === 's-date') run(() => saveSetFields(true));
  else if (id === 'x-sort') { st().sort.col = e.target.value; saveStateSoon(); renderData(); }
  else if (/^x-(grade|major|rombel)$/.test(id)) { cascade($('#x-grade'), $('#x-major'), $('#x-rombel'), readSel('x'), true); const c = readSel('x'); Object.assign(st().filters, { grade: c.grade, majorKey: c.majorKey, rombel: c.rombel }); majorHint(); saveStateSoon(); renderData(); }
  else if (id === 'lsort') { st().listSort = e.target.value; saveStateSoon(); $('#sets').innerHTML = setsHTML(); }
});
