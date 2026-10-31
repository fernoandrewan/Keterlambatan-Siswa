/* db.js — IndexedDB v2. Satu-satunya pintu ke IndexedDB.
   Store: sets, records (indeks setId), meta (draf form, status UI, tema), revisions (riwayat; indeks setId, objId).
   Migrasi v1→v2 HANYA menambah store "revisions"; tidak ada data yang dihapus atau ditulis ulang, sehingga pembaruan aplikasi aman.

   Prinsip konsistensi: semua perubahan yang bergantung pada keadaan saat ini dibaca-diubah-ditulis DI DALAM satu transaksi readwrite
   (tx). IndexedDB menjalankan transaksi yang cakupannya beririsan secara berurutan sesuai urutan pembuatan — juga lintas tab —
   sehingga pembaruan tidak saling menimpa dengan nilai usang. */
const DB = (() => {
  const NAME = 'keterlambatan-smkn1', VERSION = 2;
  let db = null;
  const hooks = { onblocked: null, onclose: null };
  const p = r => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
  // Permintaan yang gagal sudah ditangani lewat abort transaksi; catch kosong mencegah "unhandled rejection" ganda.
  const q = r => { const x = p(r); x.catch(() => {}); return x; };

  const open = () => new Promise((ok, no) => {
    const req = indexedDB.open(NAME, VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('sets')) d.createObjectStore('sets', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('records')) d.createObjectStore('records', { keyPath: 'id' }).createIndex('setId', 'setId');
      if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'key' });
      if (!d.objectStoreNames.contains('revisions')) { const r = d.createObjectStore('revisions', { keyPath: 'id' }); r.createIndex('setId', 'setId'); r.createIndex('objId', 'objId'); }
    };
    req.onsuccess = () => {
      db = req.result;
      // Tab lain meminta peningkatan skema: lepas koneksi agar tidak menghalangi, dan beri tahu UI.
      db.onversionchange = () => { db.close(); db = null; hooks.onclose && hooks.onclose('versionchange'); };
      // Browser menutup koneksi secara tak terduga (mis. data situs dibersihkan).
      db.onclose = () => { db = null; hooks.onclose && hooks.onclose('close'); };
      ok();
    };
    req.onerror = () => no(req.error);
    req.onblocked = () => hooks.onblocked && hooks.onblocked();
  });

  /* tx(stores, fn, mode): jalankan fn(t) di dalam satu transaksi.
     t.get/all/by/count/keys (baca) dan t.put/del/clear (tulis). fn boleh async tetapi HANYA boleh menunggu hasil t.* —
     menunggu hal lain (timer, fetch) membuat transaksi IndexedDB berakhir lebih dulu.
     Melempar error di dalam fn = membatalkan seluruh transaksi (tidak ada yang tertulis).
     Resolve { value, fx } HANYA setelah commit; fx = daftar efek tulis berurutan (untuk memperbarui cache memori). */
  const tx = (stores, fn, mode = 'readwrite') => new Promise((ok, no) => {
    if (!db) return no(Object.assign(new Error('Database tertutup. Muat ulang halaman.'), { name: 'DbClosedError' }));
    let t, out, err = null; const fx = [];
    try { t = db.transaction(stores, mode); } catch (e) { return no(e); }
    const os = s => t.objectStore(s);
    const api = {
      get: (s, k) => q(os(s).get(k)),
      all: s => q(os(s).getAll()),
      by: (s, idx, k) => q(os(s).index(idx).getAll(k)),
      count: s => q(os(s).count()),
      keys: s => q(os(s).getAllKeys()),
      put: (s, v) => { fx.push(['put', s, v]); return q(os(s).put(v)); },
      del: (s, k) => { fx.push(['del', s, k]); return q(os(s).delete(k)); },
      clear: s => { fx.push(['clear', s]); return q(os(s).clear()); },
    };
    t.oncomplete = () => ok({ value: out, fx });
    t.onabort = () => no(err || t.error || new Error('Transaksi dibatalkan'));
    const fail = e => { err = err || e; try { t.abort(); } catch (_) {} };
    let r; try { r = fn(api); } catch (e) { return fail(e); }
    Promise.resolve(r).then(v => { out = v; }, fail);
  });

  const batch = ops => tx([...new Set(ops.map(o => o[1]))], t => ops.forEach(([op, s, v]) => (op === 'put' ? t.put(s, v) : op === 'del' ? t.del(s, v) : t.clear(s)))).then(r => r.fx);
  const all = s => tx([s], t => t.all(s), 'readonly').then(r => r.value);

  // Riwayat terbaru dahulu. opts: { setId, before (id revisi; ambil yang lebih lama), limit }
  const revPage = ({ setId = null, before = null, limit = 50 } = {}) => new Promise((ok, no) => {
    if (!db) return no(new Error('Database tertutup. Muat ulang halaman.'));
    const out = [], t = db.transaction('revisions', 'readonly'), st = t.objectStore('revisions');
    const range = setId ? IDBKeyRange.only(setId) : before ? IDBKeyRange.upperBound(before, true) : null;
    const req = (setId ? st.index('setId') : st).openCursor(range, 'prev');
    req.onsuccess = () => {
      const c = req.result; if (!c) return;
      if (!(setId && before) || c.primaryKey < before) out.push(c.value);
      if (out.length < limit) c.continue();
    };
    req.onerror = () => no(req.error);
    t.oncomplete = () => ok(out);
    t.onabort = () => no(t.error || new Error('Transaksi dibatalkan'));
  });

  // Kebijakan retensi riwayat: bila jumlah > max, hapus yang TERLAMA sampai tersisa `keep` (satu transaksi, di luar jalur aksi pengguna).
  const pruneRevs = (max, keep) => tx(['revisions'], async t => {
    const n = await t.count('revisions'); if (n <= max) return 0;
    const ks = await t.keys('revisions'); ks.sort();
    const drop = ks.slice(0, n - keep); drop.forEach(k => t.del('revisions', k)); return drop.length;
  }).then(r => r.value);

  return { open, tx, batch, all, revPage, pruneRevs, hooks, isOpen: () => !!db, VERSION };
})();
