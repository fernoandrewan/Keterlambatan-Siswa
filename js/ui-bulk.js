/* ui-bulk.js — edit massal pada tabel kumpulan data: pilih banyak catatan → pindah, ubah kelas/jurusan/rombel, urutkan, kunci/buka kunci, hapus.
   Semua aksi memanggil Store.bulk* (satu transaksi, semua-atau-tidak-sama-sekali). Catatan terkunci dan catatan di kumpulan data terkunci
   dilewati oleh Store (bukan hanya disembunyikan oleh UI) dan dilaporkan setelahnya. */
'use strict';
const Bulk = (() => {
  const pickedRecs = () => S.recs.filter(r => S.sel.has(r.id) && r.setId === S.cur);
  const groupLine = rs => {
    const m = new Map(); rs.forEach(r => { const k = clsText(r); m.set(k, (m.get(k) || 0) + 1); });
    const items = [...m.entries()].sort((a, b) => b[1] - a[1]), top = items.slice(0, 6).map(([k, n]) => `${esc(k)} (${nf(n)})`);
    return top.join('; ') + (items.length > 6 ? `; +${items.length - 6} kelompok lain` : '');
  };
  const summaryHTML = rs => `<p><b>${nf(rs.length)} catatan dipilih.</b></p><p class="meta">${groupLine(rs)}</p>`;
  const lockedNote = n => (n ? `<p class="warn-inline">${nf(n)} catatan terkunci akan dilewati dan tidak diubah.</p>` : '');

  function bar() {
    const el = $('#selbar'); if (!el) return;
    const s = S.cur && getSet(S.cur);
    if (!S.selMode || !s || s.locked || st().mode !== 'tabel') { el.innerHTML = ''; return; }
    const n = pickedRecs().length, shown = sorted(filtered(S.cur)).filter(r => S.sel.has(r.id)).length, off = n ? '' : ' disabled';
    el.innerHTML = `<div class="card selbar" role="region" aria-label="Edit massal"><div class="bar"><b>${nf(n)} dipilih${n !== shown ? ` <small>(${nf(shown)} tampil)</small>` : ''}</b><div class="row"><button class="btn" data-act="sel-all">Pilih semua yang tampil</button><button class="btn" data-act="sel-none"${off}>Kosongkan</button></div></div>
      <div class="row brow"><button class="btn" data-act="b-move"${off}>Pindahkan…</button><button class="btn" data-act="b-class"${off}>Ubah kelas…</button><button class="btn" data-act="b-sort"${off}>Urutkan…</button><button class="btn" data-act="b-lock"${off}>🔒 Kunci</button><button class="btn" data-act="b-unlock"${off}>🔓 Buka kunci</button><button class="btn danger" data-act="b-del"${off}>🗑 Hapus</button></div></div>`;
  }
  // Laporan hasil: selalu jujur tentang yang diterapkan dan yang dilewati.
  async function report(title, res, verb) {
    const skipped = (res.skippedLocked || 0) + (res.skippedFrozen || 0) + (res.missing || 0);
    S.sel.clear(); refresh(); bar();
    if (!skipped && res.applied) return toast(`${nf(res.applied)} catatan ${verb}.`);
    await ask(title, `<p><b>${nf(res.applied)}</b> catatan ${verb}.</p>${kv([res.unchanged ? ['Sudah sesuai (tidak berubah)', nf(res.unchanged)] : null, res.skippedLocked ? ['Dilewati: catatan terkunci', nf(res.skippedLocked)] : null, res.skippedFrozen ? ['Dilewati: kumpulan data terkunci', nf(res.skippedFrozen)] : null, res.missing ? ['Dilewati: sudah tidak ada', nf(res.missing)] : null])}`, ['Tutup']);
  }
  const need = () => { const rs = pickedRecs(); if (!rs.length) { toast('Pilih catatan dulu.', true); return null; } return rs; };

  async function move() {
    const rs = need(); if (!rs) return;
    const targets = S.sets.filter(x => !x.locked && x.id !== S.cur).sort((a, b) => b.date.localeCompare(a.date));
    if (!targets.length) return void (await info('Tidak ada tujuan', 'Tidak ada kumpulan data lain yang terbuka. Buat kumpulan data baru (menu Membuat Data) atau buka kunci kumpulan data tujuan.'));
    const lk = rs.filter(r => r.locked).length;
    const [i, tid] = await ask('Pindahkan ke kumpulan data lain', `${summaryHTML(rs)}<label>Pindahkan ke<select id="b-target">${targets.map(t => opt(t.id, `${t.name} — ${fmtDate(t.date)} (${cnt(t.id)} siswa)`)).join('')}</select></label>${lockedNote(lk)}<p class="meta">Catatan ditambahkan di akhir kumpulan data tujuan. Dapat dipulihkan lewat Riwayat.</p>`, ['Batal', 'Pindahkan'], d => $('#b-target', d).value);
    if (i !== 1) return;
    await report('Hasil pemindahan', await Store.bulkMove(rs.map(r => r.id), tid), 'dipindahkan');
  }

  // Pratinjau tiap catatan terpilih terhadap kombinasi baru (sama seperti validasi atomik di Store).
  const planClass = (rs, p) => {
    const ok = rs.filter(r => !r.locked), to = r => ({ grade: p.grade || r.grade, majorKey: p.majorKey || r.majorKey, rombel: p.rombel || r.rombel });
    const bad = ok.filter(r => !Data.valid(...Object.values(to(r)))), same = ok.filter(r => { const t = to(r); return t.grade === r.grade && t.majorKey === r.majorKey && t.rombel === r.rombel; });
    return { ok, bad, same, change: ok.length - bad.length - same.length };
  };
  function fillBulkClass(d) {
    const g = $('#bc-grade', d), m = $('#bc-major', d), r = $('#bc-rombel', d), keep = { g: g.value, m: m.value, r: r.value };
    const put = (el, items, v) => { el.innerHTML = opt('', '(tidak diubah)') + items.map(([a, b]) => opt(a, b)).join(''); el.value = items.some(x => x[0] === v) ? v : ''; };
    put(g, Data.grades().map(x => [x, Data.label(x)]), keep.g);
    put(m, Data.majorsFor(g.value).map(x => [x.key, Data.majorLabel(g.value, x.key)]), keep.m);
    put(r, Data.rombelsFor(g.value, m.value).map(x => [x, Data.rombelLabel(g.value, m.value, x)]), keep.r);
  }
  async function classes() {
    const rs = need(); if (!rs) return;
    const sel = d => ({ grade: $('#bc-grade', d).value, majorKey: $('#bc-major', d).value, rombel: $('#bc-rombel', d).value });
    const [i, p] = await ask('Ubah kelas / jurusan / rombel', `${summaryHTML(rs)}<p class="meta">Kosongkan (biarkan “tidak diubah”) bagian yang tidak ingin diganti. Seluruh kombinasi harus sah; bila ada yang tidak cocok, tidak satu pun diubah.</p>
      <div class="g3"><label>Kelas<select id="bc-grade"></select></label><label>Jurusan<select id="bc-major"></select></label><label>Rombel<select id="bc-rombel"></select></label></div><div id="bc-prev" class="meta" aria-live="polite"></div>`,
      ['Batal', 'Terapkan'], sel, { wide: true, onOpen: d => {
        const upd = () => { const p = sel(d), q = planClass(rs, p), ok = $('[data-i="1"]', d), any = p.grade || p.majorKey || p.rombel;
          const bad = q.bad.length ? `<span class="bad">${nf(q.bad.length)} catatan tidak cocok dengan kombinasi ini${q.bad.length ? ` (mis. ${esc(q.bad.slice(0, 3).map(x => x.name).join(', '))})` : ''}. Ubah pilihan.</span>` : '';
          $('#bc-prev', d).innerHTML = !any ? 'Pilih minimal satu bagian yang akan diubah.' : `${nf(q.change)} catatan akan berubah, ${nf(q.same.length)} sudah sesuai.${q.ok.length < rs.length ? ` ${nf(rs.length - q.ok.length)} terkunci dilewati.` : ''} ${bad}`;
          ok.disabled = !any || !!q.bad.length || !q.change; };
        fillBulkClass(d); upd();
        d.addEventListener('change', e => { if (e.target.id === 'bc-grade' || e.target.id === 'bc-major') fillBulkClass(d); upd(); });
      } });
    if (i !== 1) return;
    await report('Hasil perubahan kelas', await Store.bulkClass(rs.map(r => r.id), p), 'diubah');
  }

  async function sortSel() {
    const rs = need(); if (!rs) return;
    const [i, spec] = await ask('Urutkan catatan terpilih', `${summaryHTML(rs)}<p class="meta">Hanya catatan terpilih yang saling bertukar posisi (di antara tempat yang sudah mereka tempati). Catatan lain tidak bergeser.</p>
      <label>Urutkan menurut<select id="bs-col">${opt('grade', 'Tingkat kelas')}${opt('major', 'Jurusan')}${opt('rombel', 'Rombel')}${opt('name', 'Nama siswa')}</select></label><label>Arah<select id="bs-dir">${opt('1', 'Naik (A–Z, kecil → besar)')}${opt('-1', 'Turun (Z–A, besar → kecil)')}</select></label>${lockedNote(rs.filter(r => r.locked).length)}`,
      ['Batal', 'Urutkan'], d => ({ col: $('#bs-col', d).value, dir: +$('#bs-dir', d).value }));
    if (i !== 1) return;
    await report('Hasil pengurutan', await Store.bulkSort(rs.map(r => r.id), spec), 'berpindah posisi');
  }

  async function lock(on) {
    const rs = need(); if (!rs) return;
    const todo = rs.filter(r => r.locked !== on).length;
    if (!todo) return void (await info(on ? 'Sudah terkunci' : 'Sudah terbuka', `Semua catatan terpilih ${on ? 'sudah terkunci' : 'tidak terkunci'}.`));
    const [i] = await ask(on ? 'Kunci catatan terpilih?' : 'Buka kunci catatan terpilih?', `${summaryHTML(rs)}<p>${nf(todo)} catatan akan ${on ? 'dikunci' : 'dibuka kuncinya'}${rs.length - todo ? `; ${nf(rs.length - todo)} sudah ${on ? 'terkunci' : 'terbuka'}` : ''}.</p>${on ? '' : '<p class="meta">Catatan yang dibuka kuncinya dapat diedit dan dihapus lagi.</p>'}`, ['Batal', on ? 'Kunci' : 'Buka kunci']);
    if (i !== 1) return;
    await report(on ? 'Hasil penguncian' : 'Hasil pembukaan kunci', await Store.bulkLock(rs.map(r => r.id), on), on ? 'dikunci' : 'dibuka kuncinya');
  }

  async function del() {
    const rs = need(); if (!rs) return;
    const lk = rs.filter(r => r.locked).length, go = rs.length - lk;
    if (!go) return void (await info('Tidak ada yang dapat dihapus', 'Semua catatan terpilih terkunci. Buka kuncinya lebih dulu (tombol “Buka kunci”), lalu hapus.'));
    const [i] = await ask('Hapus catatan terpilih?', `${summaryHTML(rs)}<p><b>${nf(go)} catatan akan dihapus.</b> Penghapusan tercatat di riwayat dan dapat dipulihkan dari sana.</p>${lk ? `<p class="warn-inline">${nf(lk)} catatan terkunci TIDAK akan dihapus.</p>` : ''}`, ['Batal', `Hapus ${nf(go)} catatan`], null, { danger: true });
    if (i !== 1) return;
    await report('Hasil penghapusan', await Store.bulkDelete(rs.map(r => r.id)), 'dihapus');
  }
  return { bar, pickedRecs, move, classes, sortSel, lock, del };
})();

Object.assign(acts, {
  selmode(id, b) {
    const s = getSet(S.cur); if (!s || s.locked) return;
    S.selMode = !S.selMode; if (!S.selMode) S.sel.clear();
    if (S.selMode && st().mode !== 'tabel') { st().mode = 'tabel'; saveStateSoon(); $$('.seg button').forEach(x => x.classList.toggle('on', x.dataset.id === 'tabel')); }
    if (b) b.textContent = S.selMode ? 'Selesai memilih' : 'Pilih (edit massal)';
    renderData();
  },
  'sel-all'() { const rs = sorted(filtered(S.cur)), all = rs.every(r => S.sel.has(r.id)); rs.forEach(r => (all ? S.sel.delete(r.id) : S.sel.add(r.id))); renderData(); },
  'sel-none'() { S.sel.clear(); renderData(); },
  'b-move': () => Bulk.move(), 'b-class': () => Bulk.classes(), 'b-sort': () => Bulk.sortSel(), 'b-lock': () => Bulk.lock(true), 'b-unlock': () => Bulk.lock(false), 'b-del': () => Bulk.del(),
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.matches && t.matches('[data-sel]')) {
    t.checked ? S.sel.add(t.dataset.sel) : S.sel.delete(t.dataset.sel);
    const tr = t.closest('tr'); if (tr) tr.classList.toggle('picked', t.checked);
    const all = $('[data-selall]'); if (all) all.checked = sorted(filtered(S.cur)).every(r => S.sel.has(r.id));
    Bulk.bar();
  } else if (t.matches && t.matches('[data-selall]')) {
    const rs = sorted(filtered(S.cur)); rs.forEach(r => (t.checked ? S.sel.add(r.id) : S.sel.delete(r.id))); renderData();
  }
});
