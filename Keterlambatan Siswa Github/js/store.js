/* store.js — keadaan aplikasi (cache memori) + SEMUA penulisan data persisten + aturan penguncian terpusat.

   Prinsip:
   1. IndexedDB adalah sumber kebenaran. S.sets/S.recs hanyalah cache yang diperbarui SETELAH transaksi commit (lihat write → apply).
   2. Setiap perubahan = satu transaksi yang membaca data TERKINI di dalam transaksi itu sendiri, memeriksa aturan, lalu menulis.
      Tidak ada objek usang dari memori yang ditulis ulang → tidak ada "lost update" (mis. nama/tanggal tertimpa saat Selesaikan/Kunci),
      dan aturan kunci tetap berlaku walau tab lain mengubah data lebih dulu.
   3. Aturan kunci hanya ada di sini (RuleError). UI boleh menonaktifkan tombol, tetapi tidak menjadi satu-satunya penjaga.
   4. Setiap penulisan dilacak (pending/error per kanal) agar indikator "Tersimpan" jujur dan flush() dapat ditunggu. */
'use strict';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
const now = () => new Date().toISOString();
const squash = s => String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

// Pelanggaran aturan (bukan kegagalan penyimpanan): ditampilkan sebagai pesan, tidak mengubah indikator simpan.
class RuleError extends Error {
  constructor(message, code, info) { super(message); this.name = 'RuleError'; this.rule = true; this.code = code || 'RULE'; this.info = info || null; }
}

/* ---------- keadaan ---------- */
const S = { sets: [], recs: [], meta: {}, cur: null, editId: null, q: '' };
const STATE_DEFAULT = () => ({ keepOn: true, keep: {}, filters: {}, sort: { col: 'no', dir: 1 }, listSort: 'newest', mode: 'tabel', activeSetId: null, export: {} });
const st = () => {
  const m = S.meta, d = STATE_DEFAULT();
  if (!m.state) m.state = d; else Object.keys(d).forEach(k => { if (!(k in m.state)) m.state[k] = d[k]; });
  return m.state;
};

const Store = (() => {
  const REV_MAX = 5000, REV_KEEP = 4000, COALESCE_MS = 120000;   // kebijakan retensi riwayat (lihat README)
  const TAB = uid();
  const listeners = new Set(), extListeners = new Set();

  /* ---------- pelacakan penulisan ---------- */
  const W = { pending: 0, inflight: new Set(), err: new Map() };
  const status = () => ({ pending: W.pending, errors: [...W.err.entries()].filter(([, e]) => e).map(([ch, e]) => ({ ch, e })) });
  const emit = () => { const s = status(); listeners.forEach(f => { try { f(s); } catch (_) {} }); };
  function track(ch, pr) {
    W.pending++; W.inflight.add(pr); emit();
    pr.then(() => W.err.set(ch, null), e => {
      if (e && e.rule) return;                                     // pelanggaran aturan ≠ kegagalan penyimpanan
      try { e.saveFailed = true; } catch (_) {}                    // penanda agar UI tidak menampilkan pesan ganda
      W.err.set(ch, e || new Error('Gagal menyimpan'));
    }).finally(() => { W.pending--; W.inflight.delete(pr); emit(); });
  }
  // Tunggu semua penulisan yang sudah dimulai. true = tidak ada kegagalan yang masih tercatat.
  async function flush() { while (W.inflight.size) await Promise.allSettled([...W.inflight]); return status().errors.length === 0; }

  /* ---------- cache memori ---------- */
  function apply(fx) {
    let sets = null, recs = null;
    const ms = () => sets || (sets = new Map(S.sets.map(s => [s.id, s]))), mr = () => recs || (recs = new Map(S.recs.map(r => [r.id, r])));
    for (const [op, store, v] of fx) {
      if (store === 'sets') { const m = ms(); op === 'put' ? m.set(v.id, v) : op === 'del' ? m.delete(v) : m.clear(); }
      else if (store === 'records') { const m = mr(); op === 'put' ? m.set(v.id, v) : op === 'del' ? m.delete(v) : m.clear(); }
    }
    if (sets) S.sets = [...sets.values()];
    if (recs) S.recs = [...recs.values()];
  }

  /* ---------- sinkronisasi antartab ---------- */
  const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('keterlambatan-smkn1') : null;
  let reloadT = 0;
  async function reload() {
    const { value } = await DB.tx(['sets', 'records'], async t => ({ sets: await t.all('sets'), recs: await t.all('records') }), 'readonly');
    S.sets = value.sets; S.recs = value.recs;
    extListeners.forEach(f => { try { f(); } catch (_) {} });
  }
  const reloadSoon = () => { clearTimeout(reloadT); reloadT = setTimeout(() => reload().catch(() => {}), 120); };
  if (bc) bc.onmessage = e => { if (e.data && e.data.from !== TAB) reloadSoon(); };

  /* write(kanal, stores, fn): transaksi dibuat SINKRON (urutan eksekusi = urutan pemanggilan), cache memori diperbarui setelah commit. */
  async function write(ch, stores, fn) {
    const pr = DB.tx(stores, fn); track(ch, pr);
    const { value, fx } = await pr;
    apply(fx);
    if (bc && fx.some(f => f[1] === 'sets' || f[1] === 'records')) { try { bc.postMessage({ from: TAB }); } catch (_) {} }
    return value;
  }

  /* ---------- pembantu aturan ---------- */
  const needSet = async (t, id) => { const s = await t.get('sets', id); if (!s) throw new RuleError('Kumpulan data tidak ditemukan. Mungkin sudah dihapus (mis. di tab lain).', 'NO_SET'); return s; };
  const needRec = async (t, id) => { const r = await t.get('records', id); if (!r) throw new RuleError('Catatan tidak ditemukan. Mungkin sudah dihapus (mis. di tab lain).', 'NO_REC'); return r; };
  const setOpen = (s, untuk) => { if (s.locked) throw new RuleError(`Kumpulan data “${s.name}” terkunci. Buka kunci kumpulan data terlebih dahulu${untuk ? ' untuk ' + untuk : ''}.`, 'SET_LOCKED'); };
  const recOpen = r => { if (r.locked) throw new RuleError(`Catatan “${r.name}” terkunci. Buka kunci catatan terlebih dahulu.`, 'REC_LOCKED'); };
  const cleanName = n => squash(n).slice(0, IO.NAME_MAX);
  const checkClass = f => { if (!Data.valid(String(f.grade), String(f.majorKey), String(f.rombel))) throw new RuleError('Pilih kelas, jurusan, dan rombel yang valid.', 'INVALID'); };
  // Peta "id → nilai" untuk isi revisi urutan. Tanpa prototipe: id apa pun yang lolos ID_RE (termasuk "__proto__", yang hanya bisa datang dari berkas impor)
  // harus tersimpan sebagai kunci biasa. Pada objek biasa, `peta['__proto__'] = angka` diabaikan diam-diam oleh setter bawaan Object.prototype, sehingga
  // catatan itu hilang dari revisi dan pemulihan urutan tidak mengembalikannya.
  const idMap = () => Object.create(null);
  const diff = (a, b, keys) => { const x = {}, y = {}; keys.forEach(k => { if (a[k] !== b[k]) { x[k] = a[k]; y[k] = b[k]; } }); return Object.keys(x).length ? [x, y] : null; };
  const REC_FIELDS = ['name', 'grade', 'majorKey', 'rombel'];
  const maxOrder = rs => rs.reduce((m, r) => Math.max(m, r.order), -1);
  const touch = (t, s, tt) => t.put('sets', { ...s, updatedAt: tt });

  /* ---------- riwayat revisi ---------- */
  const lastRev = new Map();
  let seq = 0;
  const revId = at => `${at}_${(++seq).toString(36).padStart(3, '0')}${Math.random().toString(36).slice(2, 6)}`;
  function putRev(t, o) {
    const at = now(), r = { id: revId(at), at, objType: o.objType, objId: o.objId, setId: o.setId ?? null, action: o.action, title: o.title || '', before: o.before ?? null, after: o.after ?? null, batch: o.batch || null, via: o.via || null };
    t.put('revisions', r); lastRev.set(o.objId, { r, ms: Date.now() }); return r;
  }
  const recSnap = r => IO.snapRec(r), setSnap = s => IO.snapSet(s);

  /* ---------- pengurutan bersama (UI, urut massal, simpan urutan) ---------- */
  const SORT_KEYS = { no: r => r.order, grade: r => +r.grade, major: r => Data.short(r.grade, r.majorKey), rombel: r => +r.rombel };
  const cmp = spec => {
    const dir = spec && spec.dir < 0 ? -1 : 1, col = (spec && spec.col) || 'no';
    if (col === 'name') return (a, b) => a.name.localeCompare(b.name, 'id', { sensitivity: 'base' }) * dir || a.order - b.order;
    const key = SORT_KEYS[col] || SORT_KEYS.no;
    return (a, b) => { const x = key(a), y = key(b); return (x > y ? 1 : x < y ? -1 : 0) * dir || a.order - b.order; };
  };

  /* =========================== MUTASI: KUMPULAN DATA =========================== */
  const createSet = ({ name, date }) => write('data', ['sets', 'revisions'], async t => {
    const n = cleanName(name); if (!n) throw new RuleError('Isi nama kumpulan data.', 'INVALID');
    if (!IO.isRealDate(date)) throw new RuleError('Tanggal tidak valid. Pilih tanggal kalender yang sah.', 'INVALID');
    const tt = now(), s = { id: uid(), name: n, date, createdAt: tt, updatedAt: tt, status: 'draf', locked: false, lockedAt: null, unlockedAt: null, note: '' };
    t.put('sets', s); putRev(t, { objType: 'set', objId: s.id, setId: s.id, action: 'create', title: s.name, after: { name: s.name, date: s.date } });
    return s;
  });

  // Penyimpanan nama/tanggal (autosave). Dibaca-diubah-ditulis di dalam transaksi: hanya field yang diminta yang diganti.
  const patchSet = (id, { name, date }) => write('fields', ['sets', 'revisions'], async t => {
    const s = await needSet(t, id); setOpen(s, 'mengubah nama/tanggal');
    const nn = name === undefined ? s.name : cleanName(name), nd = date === undefined ? s.date : date;
    if (!nn) throw new RuleError('Nama kumpulan data tidak boleh kosong.', 'INVALID');
    if (!IO.isRealDate(nd)) throw new RuleError('Tanggal tidak valid. Pilih tanggal kalender yang sah.', 'INVALID');
    const d = diff(s, { name: nn, date: nd }, ['name', 'date']); if (!d) return { changed: false, set: s };
    const ns = { ...s, name: nn, date: nd, updatedAt: now() };
    t.put('sets', ns);
    const prev = lastRev.get(id);   // gabungkan ketikan beruntun menjadi satu revisi (hanya dalam sesi ini, ≤ 2 menit)
    if (prev && prev.r.objType === 'set' && prev.r.action === 'update' && !prev.r.batch && !prev.r.via && prev.r.before && Date.now() - prev.ms < COALESCE_MS) {
      const before = { ...d[0], ...prev.r.before }, after = { ...prev.r.after, ...d[1] };
      Object.keys(before).forEach(k => { if (before[k] === after[k]) { delete before[k]; delete after[k]; } });
      if (!Object.keys(before).length) { t.del('revisions', prev.r.id); lastRev.delete(id); }
      else { const r = { ...prev.r, at: now(), before, after }; t.put('revisions', r); lastRev.set(id, { r, ms: Date.now() }); }
    } else putRev(t, { objType: 'set', objId: id, setId: id, action: 'update', title: nn, before: d[0], after: d[1] });
    return { changed: true, set: ns };
  });

  const finishSet = id => write('data', ['sets', 'revisions'], async t => {
    const s = await needSet(t, id); setOpen(s, 'mengubah status');
    if (s.status === 'selesai') return s;
    const ns = { ...s, status: 'selesai', updatedAt: now() }; t.put('sets', ns);
    putRev(t, { objType: 'set', objId: id, setId: id, action: 'update', title: s.name, before: { status: s.status }, after: { status: 'selesai' } });
    return ns;
  });

  const setSetLock = (id, lock) => write('data', ['sets', 'revisions'], async t => {
    const s = await needSet(t, id); if (s.locked === lock) return s;
    const tt = now(), ns = { ...s, locked: lock, updatedAt: tt, [lock ? 'lockedAt' : 'unlockedAt']: tt }; t.put('sets', ns);
    putRev(t, { objType: 'set', objId: id, setId: id, action: lock ? 'lock' : 'unlock', title: s.name, before: { locked: s.locked }, after: { locked: lock } });
    return ns;
  });

  // Hapus kumpulan data: DIBLOKIR bila kumpulan data atau salah satu catatannya terkunci (diperiksa pada data terkini).
  const deleteSet = id => write('data', ['sets', 'records', 'revisions', 'meta'], async t => {
    const s = await needSet(t, id);
    if (s.locked) throw new RuleError(`Kumpulan data “${s.name}” terkunci, jadi tidak dapat dihapus. Buka kunci terlebih dahulu.`, 'SET_LOCKED');
    const rs = await t.by('records', 'setId', id), lk = rs.filter(r => r.locked);
    if (lk.length) throw new RuleError(`Kumpulan data “${s.name}” tidak dapat dihapus karena berisi ${lk.length} catatan terkunci. Buka kunci catatan tersebut terlebih dahulu.`, 'HAS_LOCKED', { locked: lk.length, names: lk.slice(0, 5).map(r => r.name) });
    const batch = uid();
    rs.forEach(r => { t.del('records', r.id); putRev(t, { objType: 'record', objId: r.id, setId: id, action: 'delete', title: r.name, before: recSnap(r), batch }); });
    t.del('sets', id); putRev(t, { objType: 'set', objId: id, setId: id, action: 'delete', title: s.name, before: setSnap(s), batch });
    const dr = await t.get('meta', 'draft'); if (dr && dr.value && dr.value.setId === id) t.del('meta', 'draft');
    return { deleted: rs.length, name: s.name };
  }).then(r => {
    if (S.meta.draft && S.meta.draft.setId === id) delete S.meta.draft;
    if (st().activeSetId === id) { st().activeSetId = null; saveState().catch(() => {}); }
    return r;
  });

  const duplicateSet = (id, { name, date }) => write('data', ['sets', 'records', 'revisions'], async t => {
    const s = await needSet(t, id), n = cleanName(name); if (!n) throw new RuleError('Nama kumpulan data wajib diisi.', 'INVALID');
    if (!IO.isRealDate(date)) throw new RuleError('Tanggal tidak valid. Pilih tanggal kalender yang sah.', 'INVALID');
    const rs = (await t.by('records', 'setId', id)).sort((a, b) => a.order - b.order), tt = now();
    const ns = { ...s, id: uid(), name: n, date, createdAt: tt, updatedAt: tt, status: 'draf', locked: false, lockedAt: null, unlockedAt: null, copyOf: s.id };
    t.put('sets', ns);
    rs.forEach(r => t.put('records', { ...r, id: uid(), setId: ns.id, createdAt: tt, updatedAt: tt, locked: false, lockedAt: null, unlockedAt: null }));
    putRev(t, { objType: 'set', objId: ns.id, setId: ns.id, action: 'create', title: n, after: { name: n, date, copyOf: s.id, records: rs.length } });
    return { set: ns, count: rs.length };
  });

  /* =========================== MUTASI: CATATAN =========================== */
  const addRecord = (setId, f) => write('data', ['sets', 'records', 'revisions'], async t => {
    const s = await needSet(t, setId); setOpen(s, 'menambah catatan');
    const name = cleanName(f.name); if (!name) throw new RuleError('Nama siswa wajib diisi.', 'INVALID'); checkClass(f);
    const rs = await t.by('records', 'setId', setId), tt = now();
    const r = { id: uid(), setId, name, grade: String(f.grade), majorKey: String(f.majorKey), rombel: String(f.rombel), order: maxOrder(rs) + 1, createdAt: tt, updatedAt: tt, locked: false, lockedAt: null, unlockedAt: null };
    t.put('records', r); touch(t, s, tt);
    putRev(t, { objType: 'record', objId: r.id, setId, action: 'create', title: name, after: recSnap(r) });
    return r;
  });

  const updateRecord = (id, f) => write('data', ['sets', 'records', 'revisions'], async t => {
    const r = await needRec(t, id), s = await needSet(t, r.setId); setOpen(s, 'mengubah catatan'); recOpen(r);
    const name = cleanName(f.name); if (!name) throw new RuleError('Nama siswa wajib diisi.', 'INVALID'); checkClass(f);
    const to = { name, grade: String(f.grade), majorKey: String(f.majorKey), rombel: String(f.rombel) }, d = diff(r, to, REC_FIELDS);
    if (!d) return { changed: false, rec: r };
    const tt = now(), nr = { ...r, ...to, updatedAt: tt }; t.put('records', nr); touch(t, s, tt);
    putRev(t, { objType: 'record', objId: id, setId: r.setId, action: 'update', title: name, before: d[0], after: d[1] });
    return { changed: true, rec: nr };
  });

  const setRecordLock = (id, lock) => write('data', ['sets', 'records', 'revisions'], async t => {
    const r = await needRec(t, id), s = await needSet(t, r.setId); setOpen(s, lock ? 'mengunci catatan' : 'membuka kunci catatan');
    if (r.locked === lock) return r;
    const tt = now(), nr = { ...r, locked: lock, updatedAt: tt, [lock ? 'lockedAt' : 'unlockedAt']: tt }; t.put('records', nr); touch(t, s, tt);
    putRev(t, { objType: 'record', objId: id, setId: r.setId, action: lock ? 'lock' : 'unlock', title: r.name, before: { locked: r.locked }, after: { locked: lock } });
    return nr;
  });

  const deleteRecord = id => write('data', ['sets', 'records', 'revisions'], async t => {
    const r = await needRec(t, id), s = await needSet(t, r.setId); setOpen(s, 'menghapus catatan'); recOpen(r);
    t.del('records', id); touch(t, s, now());
    putRev(t, { objType: 'record', objId: id, setId: r.setId, action: 'delete', title: r.name, before: recSnap(r) });
    return r;
  });

  // Naik/turun satu posisi: hanya menukar nilai `order` DUA catatan yang bertukar tempat. Catatan lain (termasuk yang terkunci) tidak disentuh.
  const swapRecords = (id, dir) => write('data', ['sets', 'records'], async t => {
    const r = await needRec(t, id), s = await needSet(t, r.setId); setOpen(s, 'mengurutkan');
    const L = (await t.by('records', 'setId', r.setId)).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)), i = L.findIndex(x => x.id === id), o = L[i + dir];
    if (!o) return { moved: false };
    if (r.locked || o.locked) throw new RuleError('Catatan terkunci tidak dapat dipindahkan.', 'REC_LOCKED');
    const tt = now();
    let ro = o.order, oo = r.order;
    if (ro === oo) { ro = r.order + (dir > 0 ? 0.5 : -0.5); oo = o.order; }   // pengaman data lama dengan urutan kembar
    t.put('records', { ...r, order: ro, updatedAt: tt }); t.put('records', { ...o, order: oo, updatedAt: tt }); touch(t, s, tt);
    return { moved: true };
  });

  // "Simpan urutan ini": ditolak bila kumpulan data terkunci atau ada catatan terkunci (konsisten dengan aturan lama).
  const sortSet = (setId, spec) => write('data', ['sets', 'records', 'revisions'], async t => {
    const s = await needSet(t, setId); setOpen(s, 'menyimpan urutan');
    const rs = await t.by('records', 'setId', setId); if (rs.some(r => r.locked)) throw new RuleError('Ada catatan terkunci; urutan tidak dapat disimpan.', 'HAS_LOCKED');
    const sorted = rs.slice().sort(cmp(spec)), tt = now(), bo = idMap(), ao = idMap();
    sorted.forEach((r, k) => { if (r.order !== k) { bo[r.id] = r.order; ao[r.id] = k; t.put('records', { ...r, order: k, updatedAt: tt }); } });
    const n = Object.keys(ao).length; if (!n) return { changed: 0 };
    touch(t, s, tt); putRev(t, { objType: 'set', objId: setId, setId, action: 'reorder', title: `Urutan ${rs.length} catatan disimpan`, before: { orders: bo }, after: { orders: ao } });
    return { changed: n };
  });

  /* =========================== MUTASI MASSAL (satu transaksi, semua-atau-tidak-sama-sekali) =========================== */
  async function loadTargets(t, ids) {
    const uniq = [...new Set(ids)], got = await Promise.all(uniq.map(id => t.get('records', id)));
    const recs = got.filter(Boolean), sets = new Map();
    await Promise.all([...new Set(recs.map(r => r.setId))].map(async sid => { const s = await t.get('sets', sid); if (s) sets.set(sid, s); }));
    return { recs, sets, missing: uniq.length - recs.length };
  }
  // ok = dapat diubah; locked = catatan terkunci; frozen = berada di kumpulan data terkunci/tidak ada
  const partition = (recs, sets) => { const ok = [], locked = [], frozen = []; recs.forEach(r => { const s = sets.get(r.setId); (!s || s.locked ? frozen : r.locked ? locked : ok).push(r); }); return { ok, locked, frozen }; };
  const skipInfo = (p, missing) => ({ skippedLocked: p.locked.length, skippedFrozen: p.frozen.length, missing });
  const touchAll = (t, sets, ids, tt) => [...ids].forEach(sid => { const s = sets.get(sid); if (s) touch(t, s, tt); });

  const bulkMove = (ids, targetId) => write('data', ['sets', 'records', 'revisions'], async t => {
    const tg = await needSet(t, targetId); setOpen(tg, 'menerima catatan');
    const { recs, sets, missing } = await loadTargets(t, ids), p = partition(recs, sets), info = skipInfo(p, missing);
    const mv = p.ok.filter(r => r.setId !== targetId).sort((a, b) => a.setId.localeCompare(b.setId) || a.order - b.order);
    if (!mv.length) return { applied: 0, ...info };
    let order = maxOrder(await t.by('records', 'setId', targetId)) + 1; const tt = now(), batch = uid(), per = new Map();
    mv.forEach(r => {
      const nr = { ...r, setId: targetId, order: order++, updatedAt: tt }; t.put('records', nr);
      putRev(t, { objType: 'record', objId: r.id, setId: targetId, action: 'update', title: r.name, before: { setId: r.setId, order: r.order }, after: { setId: targetId, order: nr.order }, batch });
      per.set(r.setId, (per.get(r.setId) || 0) + 1);
    });
    per.forEach((n, sid) => putRev(t, { objType: 'set', objId: sid, setId: sid, action: 'update', title: `${n} catatan dipindahkan ke “${tg.name}”`, batch }));
    touch(t, tg, tt); touchAll(t, sets, per.keys(), tt);
    return { applied: mv.length, ...info };
  });

  // p = { grade, majorKey, rombel }; '' = tidak diubah. Seluruh kombinasi harus sah, bila tidak satu pun diterapkan.
  const bulkClass = (ids, p) => write('data', ['sets', 'records', 'revisions'], async t => {
    const { recs, sets, missing } = await loadTargets(t, ids), q = partition(recs, sets), info = skipInfo(q, missing);
    const plan = q.ok.map(r => ({ r, to: { grade: p.grade || r.grade, majorKey: p.majorKey || r.majorKey, rombel: p.rombel || r.rombel } }));
    const bad = plan.filter(x => !Data.valid(x.to.grade, x.to.majorKey, x.to.rombel));
    if (bad.length) throw new RuleError(`${bad.length} catatan tidak cocok dengan kombinasi kelas/jurusan/rombel yang dipilih (contoh: ${bad[0].r.name}). Tidak ada perubahan yang disimpan.`, 'INVALID_COMBO', { names: bad.slice(0, 8).map(x => x.r.name) });
    const ch = plan.filter(x => REC_FIELDS.some(k => x.to[k] !== undefined && x.r[k] !== x.to[k] && k !== 'name'));
    if (!ch.length) return { applied: 0, unchanged: plan.length, ...info };
    const tt = now(), batch = uid(), sid = new Set();
    ch.forEach(({ r, to }) => {
      const d = diff(r, to, ['grade', 'majorKey', 'rombel']); t.put('records', { ...r, ...to, updatedAt: tt });
      putRev(t, { objType: 'record', objId: r.id, setId: r.setId, action: 'update', title: r.name, before: d[0], after: d[1], batch }); sid.add(r.setId);
    });
    touchAll(t, sets, sid, tt);
    return { applied: ch.length, unchanged: plan.length - ch.length, ...info };
  });

  // Mengurutkan catatan terpilih di antara dirinya sendiri: nilai `order` yang sudah mereka tempati dibagikan ulang, jadi catatan lain tidak bergeser.
  const bulkSort = (ids, spec) => write('data', ['sets', 'records', 'revisions'], async t => {
    const { recs, sets, missing } = await loadTargets(t, ids), p = partition(recs, sets), info = skipInfo(p, missing);
    const by = new Map(); p.ok.forEach(r => (by.get(r.setId) || by.set(r.setId, []).get(r.setId)).push(r));
    const tt = now(); let applied = 0;
    by.forEach((rs, sid) => {
      const slots = rs.map(r => r.order).sort((a, b) => a - b), sorted = rs.slice().sort(cmp(spec)), bo = idMap(), ao = idMap();
      sorted.forEach((r, k) => { if (r.order !== slots[k]) { bo[r.id] = r.order; ao[r.id] = slots[k]; t.put('records', { ...r, order: slots[k], updatedAt: tt }); } });
      const n = Object.keys(ao).length; if (!n) return; applied += n;
      touch(t, sets.get(sid), tt); putRev(t, { objType: 'set', objId: sid, setId: sid, action: 'reorder', title: `${rs.length} catatan terpilih diurutkan ulang`, before: { orders: bo }, after: { orders: ao } });
    });
    return { applied, ...info };
  });

  const bulkLock = (ids, lock) => write('data', ['sets', 'records', 'revisions'], async t => {
    const { recs, sets, missing } = await loadTargets(t, ids), frozen = recs.filter(r => { const s = sets.get(r.setId); return !s || s.locked; });
    const live = recs.filter(r => !frozen.includes(r)), todo = live.filter(r => r.locked !== lock), tt = now(), batch = uid(), sid = new Set();
    todo.forEach(r => {
      t.put('records', { ...r, locked: lock, updatedAt: tt, [lock ? 'lockedAt' : 'unlockedAt']: tt });
      putRev(t, { objType: 'record', objId: r.id, setId: r.setId, action: lock ? 'lock' : 'unlock', title: r.name, before: { locked: r.locked }, after: { locked: lock }, batch }); sid.add(r.setId);
    });
    touchAll(t, sets, sid, tt);
    return { applied: todo.length, unchanged: live.length - todo.length, skippedLocked: 0, skippedFrozen: frozen.length, missing };
  });

  const bulkDelete = ids => write('data', ['sets', 'records', 'revisions'], async t => {
    const { recs, sets, missing } = await loadTargets(t, ids), p = partition(recs, sets), info = skipInfo(p, missing), tt = now(), batch = uid(), sid = new Set();
    p.ok.forEach(r => { t.del('records', r.id); putRev(t, { objType: 'record', objId: r.id, setId: r.setId, action: 'delete', title: r.name, before: recSnap(r), batch }); sid.add(r.setId); });
    touchAll(t, sets, sid, tt);
    return { applied: p.ok.length, ...info };
  });

  /* =========================== IMPOR (gabung) & PEMULIHAN (ganti semua) =========================== */
  const importMerge = (fsets, { replace }) => write('data', ['sets', 'records', 'revisions'], async t => {
    const local = { sets: await t.all('sets'), recs: await t.all('records') }, P = IO.planMerge(fsets, local, { replace, newId: uid });
    const byId = new Map(local.sets.map(s => [s.id, s])), tt = now(), batch = uid(), patched = new Map();
    const patch = (id, o = {}) => patched.set(id, { ...(patched.get(id) || byId.get(id)), ...o, updatedAt: tt });
    P.addSets.forEach(({ set, records }) => {
      t.put('sets', set); records.forEach(r => t.put('records', r));
      putRev(t, { objType: 'set', objId: set.id, setId: set.id, action: 'import', title: set.name, after: { name: set.name, date: set.date, records: records.length }, via: 'impor', batch });
    });
    const addedBy = new Map();
    P.addRecs.forEach(r => { if (byId.get(r.setId).locked) throw new RuleError('Impor mencoba mengubah kumpulan data terkunci.', 'SET_LOCKED'); t.put('records', r); patch(r.setId); addedBy.set(r.setId, (addedBy.get(r.setId) || 0) + 1); });
    addedBy.forEach((n, sid) => putRev(t, { objType: 'set', objId: sid, setId: sid, action: 'import', title: byId.get(sid).name, after: { records: n }, via: 'impor', batch }));
    P.repSets.forEach(({ local: ls, file: fs }) => {
      if (ls.locked) throw new RuleError('Impor mencoba mengubah kumpulan data terkunci.', 'SET_LOCKED');
      patch(ls.id, { name: fs.name, date: fs.date }); putRev(t, { objType: 'set', objId: ls.id, setId: ls.id, action: 'update', title: fs.name, before: { name: ls.name, date: ls.date }, after: { name: fs.name, date: fs.date }, via: 'impor', batch });
    });
    P.repRecs.forEach(({ local: lr, file: fr }) => {
      if (lr.locked || byId.get(lr.setId).locked) throw new RuleError('Impor mencoba mengubah catatan terkunci.', 'REC_LOCKED');
      const nr = { ...lr, name: fr.name, grade: fr.grade, majorKey: fr.majorKey, rombel: fr.rombel, updatedAt: tt }, d = diff(lr, nr, REC_FIELDS);
      t.put('records', nr); patch(lr.setId);
      putRev(t, { objType: 'record', objId: lr.id, setId: lr.setId, action: 'update', title: nr.name, before: d[0], after: d[1], via: 'impor', batch });
    });
    patched.forEach(s => t.put('sets', s));
    return P.sum;
  });

  // Pemulihan penuh: mengganti SELURUH isi database dalam satu transaksi. Diblokir bila ada data lokal terkunci (diperiksa di dalam transaksi).
  const restoreFull = data => write('data', ['sets', 'records', 'revisions', 'meta'], async t => {
    const sets = await t.all('sets'), recs = await t.all('records');
    const ls = sets.filter(s => s.locked), lr = recs.filter(r => r.locked);
    if (ls.length || lr.length) throw new RuleError(`Pemulihan penuh diblokir: ada ${ls.length} kumpulan data dan ${lr.length} catatan terkunci di perangkat ini. Buka kuncinya dulu, atau gunakan “Gabungkan”.`, 'RESTORE_BLOCKED', { lockedSets: ls.length, lockedRecs: lr.length });
    ['sets', 'records', 'revisions'].forEach(s => t.clear(s));
    data.sets.forEach(s => t.put('sets', s)); data.recs.forEach(r => t.put('records', r)); data.revs.forEach(r => t.put('revisions', r));
    ['draft', 'state', 'theme'].forEach(k => t.del('meta', k));
    if (data.draft) t.put('meta', { key: 'draft', value: data.draft });
    t.put('meta', { key: 'state', value: { ...STATE_DEFAULT(), ...data.state } });
    if (data.theme) t.put('meta', { key: 'theme', value: data.theme });
    putRev(t, { objType: 'app', objId: 'app', setId: null, action: 'restore-full', title: 'Pemulihan backup penuh', after: { sets: data.sets.length, records: data.recs.length, exportedAt: data.exportedAt || null } });
    return { sets: data.sets.length, records: data.recs.length, revisions: data.revs.length };
  }).then(async r => {
    lastRev.clear(); delete S.meta.draft; delete S.meta.theme; S.meta.state = { ...STATE_DEFAULT(), ...data.state };
    if (data.draft) S.meta.draft = data.draft; if (data.theme) S.meta.theme = data.theme;
    await reload(); return r;
  });

  /* =========================== RIWAYAT REVISI: pemulihan =========================== */
  // Bentuk yang dapat dipulihkan (status kunci TIDAK termasuk — kunci hanya berubah lewat tindakan kunci/buka kunci eksplisit).
  const hasKeys = o => !!o && Object.keys(o).length > 0;
  const canRestore = r => {
    if (!r) return false;
    if (r.objType === 'record') return (r.action === 'update' && hasKeys(r.before) && !('locked' in r.before)) || (r.action === 'delete' && !!r.before && !!r.before.setId);
    if (r.objType === 'set') return (r.action === 'update' && hasKeys(r.before)) || r.action === 'delete' || (r.action === 'reorder' && !!r.before && !!r.before.orders);
    return false;
  };
  const restoreRevision = revId => write('data', ['sets', 'records', 'revisions'], async t => {
    const rv = await t.get('revisions', revId); if (!rv) throw new RuleError('Revisi tidak ditemukan (mungkin sudah dibuang oleh batas retensi riwayat).', 'NO_REV');
    if (!canRestore(rv)) throw new RuleError('Revisi jenis ini tidak dapat dipulihkan.', 'NOT_RESTORABLE');
    const tt = now(), b = rv.before || {};
    if (rv.objType === 'record' && rv.action === 'update') {
      const r = await needRec(t, rv.objId), s = await needSet(t, r.setId); setOpen(s, 'memulihkan revisi'); recOpen(r);
      const to = { name: b.name ?? r.name, grade: b.grade ?? r.grade, majorKey: b.majorKey ?? r.majorKey, rombel: b.rombel ?? r.rombel };
      if (!cleanName(to.name) || !Data.valid(to.grade, to.majorKey, to.rombel)) throw new RuleError('Nilai lama tidak lagi sah menurut sumber data kelas/jurusan/rombel.', 'INVALID');
      let setId = r.setId, order = r.order, tg = null;
      if (b.setId && b.setId !== r.setId) { tg = await t.get('sets', b.setId); if (!tg) throw new RuleError('Kumpulan data asal sudah tidak ada.', 'NO_SET'); setOpen(tg, 'menerima catatan'); setId = b.setId; order = maxOrder(await t.by('records', 'setId', setId)) + 1; }
      const nr = { ...r, ...to, setId, order, updatedAt: tt }, d = diff(r, nr, [...REC_FIELDS, 'setId']);
      if (!d) throw new RuleError('Nilai catatan saat ini sudah sama dengan nilai revisi ini.', 'NOOP');
      t.put('records', nr); touch(t, s, tt); if (tg) touch(t, tg, tt);
      putRev(t, { objType: 'record', objId: r.id, setId, action: 'update', title: nr.name, before: d[0], after: d[1], via: 'pemulihan' });
      return { kind: 'record-update' };
    }
    if (rv.objType === 'record' && rv.action === 'delete') {
      const s = await needSet(t, b.setId); setOpen(s, 'memulihkan catatan');
      if (await t.get('records', rv.objId)) throw new RuleError('Catatan ini sudah ada kembali.', 'NOOP');
      if (!cleanName(b.name) || !Data.valid(String(b.grade), String(b.majorKey), String(b.rombel))) throw new RuleError('Data catatan pada revisi ini tidak lagi sah menurut sumber data.', 'INVALID');
      const rs = await t.by('records', 'setId', s.id), clash = rs.some(x => x.order === b.order);
      const nr = { id: rv.objId, setId: s.id, name: cleanName(b.name), grade: String(b.grade), majorKey: String(b.majorKey), rombel: String(b.rombel), order: Number.isFinite(b.order) && !clash ? b.order : maxOrder(rs) + 1, createdAt: b.createdAt || tt, updatedAt: tt, locked: false, lockedAt: null, unlockedAt: null };
      t.put('records', nr); touch(t, s, tt);
      putRev(t, { objType: 'record', objId: nr.id, setId: s.id, action: 'create', title: nr.name, after: recSnap(nr), via: 'pemulihan' });
      return { kind: 'record-delete' };
    }
    if (rv.objType === 'set' && rv.action === 'update') {
      const s = await needSet(t, rv.objId); setOpen(s, 'memulihkan revisi');
      const to = { name: b.name ?? s.name, date: b.date ?? s.date, status: b.status ?? s.status };
      if (!cleanName(to.name) || !IO.isRealDate(to.date) || !['draf', 'selesai'].includes(to.status)) throw new RuleError('Nilai lama tidak sah.', 'INVALID');
      const d = diff(s, to, ['name', 'date', 'status']); if (!d) throw new RuleError('Nilai kumpulan data saat ini sudah sama dengan nilai revisi ini.', 'NOOP');
      t.put('sets', { ...s, ...to, updatedAt: tt }); putRev(t, { objType: 'set', objId: s.id, setId: s.id, action: 'update', title: to.name, before: d[0], after: d[1], via: 'pemulihan' });
      return { kind: 'set-update' };
    }
    if (rv.objType === 'set' && rv.action === 'delete') {
      if (await t.get('sets', rv.objId)) throw new RuleError('Kumpulan data ini sudah ada kembali.', 'NOOP');
      if (!IO.isRealDate(b.date) || !cleanName(b.name)) throw new RuleError('Data kumpulan data pada revisi ini tidak sah.', 'INVALID');
      const kids = rv.batch ? (await t.by('revisions', 'setId', rv.objId)).filter(x => x.batch === rv.batch && x.objType === 'record' && x.action === 'delete' && x.before) : [];
      const have = new Set((await t.all('records')).map(r => r.id)); let n = 0, skipped = 0;
      const set = { id: rv.objId, name: cleanName(b.name), date: b.date, createdAt: b.createdAt || tt, updatedAt: tt, status: b.status === 'selesai' ? 'selesai' : 'draf', locked: false, lockedAt: null, unlockedAt: null, note: b.note || '', ...(b.copyOf ? { copyOf: b.copyOf } : {}) };
      t.put('sets', set);
      kids.forEach(k => {
        const x = k.before; if (have.has(k.objId) || !cleanName(x.name) || !Data.valid(String(x.grade), String(x.majorKey), String(x.rombel))) { skipped++; return; }
        t.put('records', { id: k.objId, setId: set.id, name: cleanName(x.name), grade: String(x.grade), majorKey: String(x.majorKey), rombel: String(x.rombel), order: Number.isFinite(x.order) ? x.order : n, createdAt: x.createdAt || tt, updatedAt: tt, locked: false, lockedAt: null, unlockedAt: null }); n++;
      });
      putRev(t, { objType: 'set', objId: set.id, setId: set.id, action: 'create', title: set.name, after: { name: set.name, date: set.date, records: n }, via: 'pemulihan' });
      return { kind: 'set-delete', records: n, skipped };
    }
    if (rv.objType === 'set' && rv.action === 'reorder') {
      const s = await needSet(t, rv.objId); setOpen(s, 'memulihkan urutan');
      const rs = await t.by('records', 'setId', s.id); if (rs.some(r => r.locked)) throw new RuleError('Ada catatan terkunci; urutan tidak dapat dipulihkan.', 'HAS_LOCKED');
      const byId = new Map(rs.map(r => [r.id, r])), ids = Object.keys(b.orders), aft = (rv.after && rv.after.orders) || {};
      if (ids.some(id => !byId.has(id))) throw new RuleError('Sebagian catatan pada revisi ini sudah tidak ada; urutan tidak dapat dipulihkan dengan aman.', 'STALE');
      if (ids.some(id => byId.get(id).order !== aft[id])) throw new RuleError('Urutan sudah berubah lagi setelah revisi ini; tidak dapat dipulihkan dengan aman.', 'STALE');
      const bo = idMap(), ao = idMap(); ids.forEach(id => { bo[id] = byId.get(id).order; ao[id] = b.orders[id]; t.put('records', { ...byId.get(id), order: b.orders[id], updatedAt: tt }); });
      touch(t, s, tt); putRev(t, { objType: 'set', objId: s.id, setId: s.id, action: 'reorder', title: 'Urutan dipulihkan', before: { orders: bo }, after: { orders: ao }, via: 'pemulihan' });
      return { kind: 'reorder' };
    }
    throw new RuleError('Revisi jenis ini tidak dapat dipulihkan.', 'NOT_RESTORABLE');
  });

  const listRevisions = opts => DB.revPage(opts);

  /* =========================== META: draf, status UI, tema (tulis-belakang) ===========================
     Memori diperbarui SEGERA (nilai terbaru yang dimaksud), database menyusul. Transaksi dibuat berurutan sehingga yang terakhir menang;
     bila gagal, kegagalan tetap tercatat di indikator dan retryMeta() menulis ulang nilai memori terkini. */
  const metaPut = (ch, key, value) => write(ch, ['meta'], async t => { value === undefined || value === null ? t.del('meta', key) : t.put('meta', { key, value }); });
  let lastDraft = null;
  const saveDraft = d => {
    const j = JSON.stringify(d || null);
    if (j === lastDraft && !W.err.get('draft')) return Promise.resolve();
    lastDraft = j; if (d) S.meta.draft = d; else delete S.meta.draft;
    return metaPut('draft', 'draft', d || null);
  };
  const saveState = () => metaPut('state', 'state', st());
  const saveTheme = th => { S.meta.theme = th; return metaPut('state', 'theme', th); };
  const setBackupStamp = () => { const v = now(); S.meta.lastBackupAt = v; return metaPut('state', 'lastBackupAt', v); };
  let retryFields = () => Promise.resolve();   // diisi UI: membaca ulang nama/tanggal dari formulir lalu menyimpannya lagi
  const onRetryFields = fn => { retryFields = fn; };
  // Coba tulis ulang kanal yang gagal dari nilai terbaru (formulir/memori). Dipanggil saat indikator "Gagal menyimpan" diketuk.
  const retry = () => Promise.allSettled([W.err.get('fields') ? retryFields() : null, W.err.get('draft') ? (lastDraft = null, saveDraft(S.meta.draft || null)) : null, W.err.get('state') ? saveState() : null].filter(Boolean));

  /* =========================== BACA untuk ekspor (dari database, bukan dari memori) =========================== */
  const snapshot = ({ ids = null, full = false } = {}) => DB.tx(['sets', 'records', 'revisions', 'meta'], async t => {
    const sets = await t.all('sets'), recs = await t.all('records'), keep = ids ? new Set(ids) : null;
    const ss = keep ? sets.filter(s => keep.has(s.id)) : sets, ok = new Set(ss.map(s => s.id)), out = { sets: ss, recs: recs.filter(r => ok.has(r.setId)) };
    if (full) {
      out.revs = await t.all('revisions');
      const g = async k => { const m = await t.get('meta', k); return m ? m.value : null; };
      out.draft = await g('draft'); out.state = await g('state'); out.theme = await g('theme');
    }
    return out;
  }, 'readonly').then(r => r.value);

  /* =========================== SIKLUS HIDUP =========================== */
  async function init() {
    await DB.open();
    const { value } = await DB.tx(['sets', 'records', 'meta'], async t => ({ sets: await t.all('sets'), recs: await t.all('records'), meta: await t.all('meta') }), 'readonly');
    S.sets = value.sets; S.recs = value.recs; value.meta.forEach(m => { S.meta[m.key] = m.value; });
    lastDraft = JSON.stringify(S.meta.draft || null);
    // Retensi riwayat dijalankan di luar jalur aksi pengguna, ditunda agar tidak memperlambat pemuatan di HP.
    setTimeout(() => DB.pruneRevs(REV_MAX, REV_KEEP).catch(() => {}), 4000);
  }

  return { init, reload, flush, status, retry, onRetryFields, onStatus: f => (listeners.add(f), () => listeners.delete(f)), onExternal: f => (extListeners.add(f), () => extListeners.delete(f)),
    cmp, canRestore, REV_MAX, REV_KEEP, TAB,
    createSet, patchSet, finishSet, setSetLock, deleteSet, duplicateSet,
    addRecord, updateRecord, setRecordLock, deleteRecord, swapRecords, sortSet,
    bulkMove, bulkClass, bulkSort, bulkLock, bulkDelete, importMerge, restoreFull,
    restoreRevision, listRevisions, saveDraft, saveState, saveTheme, setBackupStamp, snapshot };
})();
