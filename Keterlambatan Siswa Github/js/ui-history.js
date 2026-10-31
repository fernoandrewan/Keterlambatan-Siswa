/* ui-history.js — Riwayat revisi & pemulihan (#/riwayat dan #/riwayat/<id kumpulan data>).
   Riwayat disimpan di IndexedDB (store "revisions"), dimuat per halaman agar ringan di HP, dan tidak memuat identitas operator.
   Pemulihan memakai Store.restoreRevision: aturan kunci berlaku (tidak dapat memulihkan ke data terkunci; status kunci tidak ikut dipulihkan). */
'use strict';
routes.riwayat = vHistory; afters.riwayat = afterHistory;

const H = { setId: null, items: [], done: false, busy: false, filter: 'all', gen: 0 };
const PAGE = 50;
const fmtFull = s => new Date(s).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const REV_VERB = { create: 'Dibuat', update: 'Diubah', delete: 'Dihapus', lock: 'Dikunci', unlock: 'Kunci dibuka', reorder: 'Urutan diubah', import: 'Impor', 'restore-full': 'Pemulihan penuh' };
const REV_KIND = { set: 'Kumpulan data', record: 'Catatan', app: 'Aplikasi' };
const REV_FIELD = { name: 'Nama', date: 'Tanggal', status: 'Status', grade: 'Kelas', majorKey: 'Jurusan', rombel: 'Rombel', setId: 'Kumpulan data' };

// Nama kumpulan data untuk tampilan: data saat ini, atau judul dari riwayat (kumpulan data yang sudah dihapus).
function revSetName(id) {
  const s = getSet(id); if (s) return s.name;
  const r = H.items.find(x => x.objType === 'set' && x.objId === id && x.title); return r ? r.title + ' (sudah dihapus)' : 'kumpulan data lain';
}
function revVal(k, v, grade) {
  if (v == null || v === '') return '—';
  if (k === 'name') return `“${esc(v)}”`;
  if (k === 'date') return esc(fmtDate(v));
  if (k === 'status') return v === 'selesai' ? 'Selesai' : 'Draf';
  if (k === 'grade') return esc(Data.label(v));
  if (k === 'majorKey') return esc(grade ? Data.short(grade, v) : (Data.variants(v).map(x => x.short).join(' / ') || v));
  if (k === 'rombel') return 'Rombel ' + esc(v);
  if (k === 'setId') return `“${esc(revSetName(v))}”`;
  return esc(String(v));
}
const snapText = o => (o ? [o.name ? `“${esc(o.name)}”` : '', o.grade ? esc(Data.label(o.grade)) : '', o.majorKey ? esc(o.grade ? Data.short(o.grade, o.majorKey) : o.majorKey) : '', o.rombel ? 'Rombel ' + esc(o.rombel) : ''].filter(Boolean).join(' · ') : '');

// Deskripsi terbaca satu revisi: { verb, kind, head, lines[] }. `restore` = true → arah diubah (sekarang → sebelum) untuk dialog pemulihan.
function describeRev(rv, restore) {
  const b = rv.before || {}, a = rv.after || {}, lines = [];
  const cur = rv.objType === 'record' ? S.recs.find(r => r.id === rv.objId) : null;
  const gradeOf = side => (side === 'before' ? (b.grade || a.grade) : (a.grade || b.grade)) || (cur && cur.grade) || '';
  let head = rv.title ? `<b>${esc(rv.title)}</b>` : '';
  if (rv.action === 'update') {
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => k !== 'order' && k !== 'updatedAt');
    keys.forEach(k => { const f = REV_FIELD[k]; if (!f) return; const x = revVal(k, b[k], gradeOf('before')), y = revVal(k, a[k], gradeOf('after')); lines.push(restore ? `${f}: ${y} → ${x}` : `${f}: ${x} → ${y}`); });
    if (!keys.length && !lines.length && !(rv.objType === 'set' && rv.title)) lines.push('Urutan diubah');
    if (rv.objType === 'record' && 'order' in b && !lines.length) lines.push('Urutan diubah');
  } else if (rv.action === 'create') {
    if (rv.objType === 'record') lines.push(snapText(a));
    else { if (a.date) lines.push('Tanggal: ' + revVal('date', a.date)); if (Number.isFinite(a.records)) lines.push(`${nf(a.records)} catatan`); if (a.copyOf) lines.push(`Salinan dari “${esc(revSetName(a.copyOf))}”`); }
  } else if (rv.action === 'delete') {
    if (rv.objType === 'record') lines.push(snapText(b)); else if (b.date) lines.push('Tanggal: ' + revVal('date', b.date));
  } else if (rv.action === 'lock' || rv.action === 'unlock') {
    lines.push(rv.action === 'lock' ? 'Status kunci: terbuka → terkunci' : 'Status kunci: terkunci → terbuka');
  } else if (rv.action === 'reorder') {
    const n = b.orders ? Object.keys(b.orders).length : 0; lines.push(`${nf(n)} catatan berubah posisi`);
  } else if (rv.action === 'import') {
    if (a.date) lines.push('Tanggal: ' + revVal('date', a.date)); if (Number.isFinite(a.records)) lines.push(`${nf(a.records)} catatan diimpor`);
  } else if (rv.action === 'restore-full') {
    lines.push(`${nf(a.sets || 0)} kumpulan data, ${nf(a.records || 0)} catatan${a.exportedAt ? ` (cadangan ${esc(fmtTime(a.exportedAt))})` : ''}`);
  }
  if (!head && rv.objType === 'app') head = '<b>Seluruh database</b>';
  return { verb: REV_VERB[rv.action] || rv.action, kind: REV_KIND[rv.objType] || rv.objType, head, lines: lines.filter(Boolean) };
}
const restoreHint = rv => (rv.objType === 'record' && rv.action === 'delete' ? 'Pulihkan catatan' : rv.objType === 'set' && rv.action === 'delete' ? 'Pulihkan kumpulan data' : rv.action === 'reorder' ? 'Pulihkan urutan' : 'Kembalikan');

function revHTML(rv) {
  const d = describeRev(rv), can = Store.canRestore(rv);
  return `<li class="rev a-${esc(rv.action)}"><div class="top"><span class="vb">${esc(d.verb)}</span><span class="kd">${esc(d.kind)}</span>${rv.via ? `<span class="bd">${esc(rv.via)}</span>` : ''}${rv.batch ? '<span class="bd" title="Bagian dari satu tindakan massal">massal</span>' : ''}<time datetime="${esc(rv.at)}">${esc(fmtFull(rv.at))}</time></div>
    <div class="what">${d.head}</div>${d.lines.length ? `<ul class="diff">${d.lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}${can ? `<div class="row"><button class="btn" data-act="rv-restore" data-id="${esc(rv.id)}">${esc(restoreHint(rv))}</button></div>` : ''}</li>`;
}

function vHistory(setId) {
  H.setId = setId || null; H.items = []; H.done = false; H.busy = false; H.gen++;
  const s = setId && getSet(setId);
  return `<div class="bar"><h2>${setId ? 'Riwayat kumpulan data' : 'Riwayat &amp; pemulihan'}</h2><a class="btn" href="${setId && s ? '#/set/' + esc(setId) : '#/lihat'}">Kembali</a></div>
  ${s ? `<p class="meta">${esc(s.name)} · ${esc(fmtDate(s.date))}</p>` : setId ? '<p class="meta">Kumpulan data ini sudah tidak ada; riwayat yang tersisa tetap ditampilkan.</p>' : ''}
  <div class="card"><p class="meta">Setiap perubahan dicatat di perangkat ini: waktu, objek, jenis perubahan, dan nilai sebelum/sesudah — tanpa identitas operator. Riwayat ikut cadangan penuh. Batas ${nf(Store.REV_MAX)} revisi: bila terlampaui, revisi <b>terlama</b> dibuang sampai tersisa ${nf(Store.REV_KEEP)} (dijalankan sebentar setelah aplikasi dibuka). Ketikan nama/tanggal beruntun dalam 2 menit digabung menjadi satu revisi.</p>
  <label>Tampilkan<select id="h-filter"><option value="all">Semua perubahan</option><option value="restorable">Hanya yang dapat dipulihkan</option><option value="delete">Penghapusan</option><option value="lock">Penguncian</option></select></label></div>
  <ul class="revs" id="h-list" aria-live="polite"></ul><div id="h-foot" class="row" style="justify-content:center"></div>`;
}
const revShown = rv => H.filter === 'all' || (H.filter === 'restorable' && Store.canRestore(rv)) || (H.filter === 'delete' && rv.action === 'delete') || (H.filter === 'lock' && (rv.action === 'lock' || rv.action === 'unlock'));
function paintHistory() {
  const el = $('#h-list'), ft = $('#h-foot'); if (!el) return;
  const vis = H.items.filter(revShown);
  el.innerHTML = vis.length ? vis.map(revHTML).join('') : `<li class="empty">${H.busy ? 'Memuat…' : H.items.length ? 'Tidak ada revisi yang cocok dengan penyaring pada bagian yang sudah dimuat.' : 'Belum ada riwayat.'}</li>`;
  ft.innerHTML = H.done ? (H.items.length ? `<small>Semua ${nf(H.items.length)} revisi sudah ditampilkan.</small>` : '') : `<button class="btn" data-act="h-more"${H.busy ? ' disabled' : ''}>${H.busy ? 'Memuat…' : 'Muat lebih banyak'}</button>`;
}
async function loadHistory(pages = 1) {
  if (H.busy) return; const gen = H.gen; H.busy = true; paintHistory();
  try {
    for (let i = 0; i < pages && !H.done; i++) {
      const last = H.items[H.items.length - 1], page = await Store.listRevisions({ setId: H.setId, before: last ? last.id : null, limit: PAGE });
      if (gen !== H.gen) return;                                  // pengguna sudah pindah halaman
      H.items.push(...page); if (page.length < PAGE) H.done = true;
    }
  } finally { if (gen === H.gen) { H.busy = false; paintHistory(); } }
}
function afterHistory() { $('#h-filter').value = H.filter; run(() => loadHistory(1)); }
function refreshHistory() { if (!$('#h-list')) return; H.items = []; H.done = false; H.busy = false; H.gen++; run(() => loadHistory(1)); }

Object.assign(acts, {
  'h-more': () => loadHistory(H.filter === 'all' ? 1 : 6),        // dengan penyaring aktif, muat beberapa halaman sekaligus
  async 'rv-restore'(id) {
    const rv = H.items.find(x => x.id === id); if (!rv) return;
    if (!Store.canRestore(rv)) return toast('Revisi ini tidak dapat dipulihkan.', true);
    const d = describeRev(rv, rv.action === 'update');
    const what = rv.objType === 'record' && rv.action === 'delete' ? 'Catatan akan dibuat kembali.' : rv.objType === 'set' && rv.action === 'delete' ? 'Kumpulan data akan dibuat kembali beserta catatan yang ikut terhapus bersamanya.' : rv.action === 'reorder' ? 'Urutan akan dikembalikan, hanya bila urutan belum berubah lagi sejak itu.' : 'Nilai berikut akan dikembalikan (dari nilai sekarang ke nilai sebelumnya).';
    const [i] = await ask(restoreHint(rv) + '?', `<p>${d.head ? d.head + ' — ' : ''}${esc(REV_KIND[rv.objType])}, ${esc(d.verb.toLowerCase())} pada ${esc(fmtFull(rv.at))}.</p><p>${esc(what)}</p>${d.lines.length ? `<ul class="diff">${d.lines.map(l => `<li>${l}</li>`).join('')}</ul>` : ''}<p class="meta">Status kunci tidak ikut dipulihkan. Data atau kumpulan data yang terkunci tidak dapat diubah lewat pemulihan. Pemulihan ini sendiri tercatat sebagai revisi baru.</p>`, ['Batal', 'Pulihkan']);
    if (i !== 1) return;
    const res = await Store.restoreRevision(id);
    toast(res.kind === 'set-delete' ? `Kumpulan data dipulihkan dengan ${nf(res.records)} catatan${res.skipped ? `; ${nf(res.skipped)} catatan tidak dapat dipulihkan` : ''}.` : 'Pemulihan berhasil.');
    refreshHistory();
  },
});
document.addEventListener('change', e => { if (e.target.id === 'h-filter') { H.filter = e.target.value; paintHistory(); if (H.filter !== 'all' && !H.done && !H.items.filter(revShown).length) run(() => loadHistory(6)); } });
