/* io.js — format pertukaran JSON (schemaVersion 2): membangun berkas, validasi ketat, migrasi dari versi lama,
   serta rencana gabung/pulihkan. Murni (tanpa DOM/IndexedDB). Isi file hanya dibaca sebagai data, tidak pernah dieksekusi.

   Dua jenis berkas, dibedakan oleh "scope":
   - "sets": ekspor SEBAGIAN (kumpulan data terpilih + catatannya).
   - "all" : cadangan PENUH (semua kumpulan data, catatan, riwayat revisi, draf formulir, pengaturan).
   Riwayat versi: v1 = format awal (sets[].records[] + settings.keepOn); v2 = menambah appVersion, counts, copyOf,
   revisions, draft, settings.{theme,state}. File v1 dimigrasi otomatis saat dibaca. */
const IO = (() => {
  const FORMAT = 'keterlambatan-smkn1', VERSION = 2, APP_VERSION = '2.0.0';
  const APP_NAME = 'Pencatatan Keterlambatan Siswa SMK Negeri 1 Bitung';
  const NAME_MAX = 150, NOTE_MAX = 500, YEAR_MIN = 2000, YEAR_MAX = 2100;
  const ID_RE = /^[A-Za-z0-9_.:-]{1,100}$/;
  const REV_ACTIONS = ['create', 'update', 'delete', 'lock', 'unlock', 'reorder', 'import', 'restore-full'];
  const SORT_COLS = ['no', 'grade', 'major', 'rombel', 'name'], LIST_SORTS = ['newest', 'oldest', 'changed', 'name', 'count'], MODES = ['tabel', 'kelompok'];

  const safe = s => String(s).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').replace(/\s+/g, '_').replace(/^[-_.]+|[-_.]+$/g, '').slice(0, 60) || 'keterlambatan';
  const clean = v => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '');
  const str = (v, n) => clean(v).slice(0, n);
  const isId = v => typeof v === 'string' && ID_RE.test(v);
  const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
  const iso = v => { if (typeof v !== 'string' || v.length > 40 || !/^\d{4}-\d{2}-\d{2}/.test(v)) return null; const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString(); };

  // Tanggal kalender yang sah (bukan sekadar pola YYYY-MM-DD): bulan 1–12, hari sesuai bulan & tahun kabisat, tahun 2000–2100.
  const isRealDate = s => {
    const m = typeof s === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s); if (!m) return false;
    const y = +m[1], mo = +m[2], d = +m[3];
    if (y < YEAR_MIN || y > YEAR_MAX || mo < 1 || mo > 12 || d < 1) return false;
    const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
    return d <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
  };

  /* ---------- bangun berkas ---------- */
  const snapSet = s => ({ id: s.id, name: s.name, date: s.date, createdAt: s.createdAt, updatedAt: s.updatedAt, status: s.status === 'selesai' ? 'selesai' : 'draf', locked: s.locked === true, lockedAt: s.lockedAt || null, unlockedAt: s.unlockedAt || null, note: s.note || '', ...(s.copyOf ? { copyOf: s.copyOf } : {}) });
  const snapRec = r => ({ id: r.id, setId: r.setId, name: r.name, grade: r.grade, majorKey: r.majorKey, rombel: r.rombel, order: r.order, createdAt: r.createdAt, updatedAt: r.updatedAt, locked: r.locked === true, lockedAt: r.lockedAt || null, unlockedAt: r.unlockedAt || null });
  const nested = (sets, recs) => sets.map(s => ({ ...snapSet(s), records: recs.filter(r => r.setId === s.id).sort((a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt)).map(({ setId, ...r }) => r) }));
  const head = (scope, sets, revs) => ({ format: FORMAT, app: APP_NAME, appVersion: APP_VERSION, schemaVersion: VERSION, scope, exportedAt: new Date().toISOString(), counts: { sets: sets.length, records: sets.reduce((a, s) => a + s.records.length, 0), ...(revs ? { revisions: revs.length } : {}) } });
  // Ekspor sebagian: hanya kumpulan data + catatan terpilih (tanpa riwayat/draf/pengaturan).
  const buildSets = (sets, recs) => { const n = nested(sets, recs); return { ...head('sets', n), sets: n }; };
  // Cadangan penuh: seluruh keadaan persisten yang dicadangkan.
  const buildFull = ({ sets, recs, revs = [], draft = null, state = null, theme = null }) => {
    const n = nested(sets, recs);
    return { ...head('all', n, revs), sets: n, revisions: revs, draft: draft || null, settings: { theme: theme || null, state: state || {} } };
  };
  const serialize = o => JSON.stringify(o, null, 1);

  /* ---------- migrasi ---------- */
  const MIGRATE = {
    // v1 → v2: v1 tidak punya riwayat/draf/tema; settings.keepOn dipindah ke settings.state.keepOn.
    1: o => ({ ...o, schemaVersion: 2, scope: o.scope === 'all' ? 'all' : 'sets', revisions: [], draft: null,
      settings: { theme: null, state: isObj(o.settings) && typeof o.settings.keepOn === 'boolean' ? { keepOn: o.settings.keepOn } : {} } }),
  };
  const migrate = o => { while (o.schemaVersion < VERSION) o = MIGRATE[o.schemaVersion](o); return o; };

  /* ---------- sanitasi ---------- */
  // Peta "id → urutan" pada revisi urutan. Tanpa prototipe agar id "__proto__" (lolos ID_RE) tidak dibuang diam-diam oleh setter bawaan Object.prototype saat berkas diimpor.
  const cleanOrders = v => { const o = Object.create(null); if (!isObj(v)) return o; Object.keys(v).slice(0, 20000).forEach(k => { if (ID_RE.test(k) && Number.isFinite(v[k])) o[k] = v[k]; }); return o; };
  // Isi "before"/"after" revisi: hanya kunci yang dikenal, hanya tipe sederhana.
  const cleanSnap = v => {
    if (!isObj(v)) return null; const o = {};
    ['id', 'setId', 'name', 'date', 'status', 'grade', 'majorKey', 'rombel', 'note', 'copyOf', 'exportedAt'].forEach(k => { if (typeof v[k] === 'string') o[k] = k === 'note' ? str(v[k], NOTE_MAX) : str(v[k], NAME_MAX); });
    ['createdAt', 'updatedAt', 'lockedAt', 'unlockedAt'].forEach(k => { if (k in v) o[k] = iso(v[k]); });
    ['order', 'records', 'sets'].forEach(k => { if (Number.isFinite(v[k])) o[k] = v[k]; });
    if (typeof v.locked === 'boolean') o.locked = v.locked;
    if (isObj(v.orders)) o.orders = cleanOrders(v.orders);
    return o;
  };
  const cleanRev = r => {
    if (!isObj(r) || !isId(r.id) || !iso(r.at) || !['set', 'record', 'app'].includes(r.objType) || !isId(r.objId) || !REV_ACTIONS.includes(r.action)) return null;
    return { id: r.id, at: iso(r.at), objType: r.objType, objId: r.objId, setId: isId(r.setId) ? r.setId : null, action: r.action, title: str(r.title, NAME_MAX),
      before: cleanSnap(r.before), after: cleanSnap(r.after), batch: isId(r.batch) ? r.batch : null, via: str(r.via, 20) || null };
  };
  const cleanDraft = d => {
    if (!isObj(d) || !isId(d.setId)) return null;
    const g = Data.grades().includes(String(d.grade)) ? String(d.grade) : '', k = g && Data.major(g, String(d.majorKey)) ? String(d.majorKey) : '', r = k && Data.valid(g, k, String(d.rombel)) ? String(d.rombel) : '';
    return { setId: d.setId, editId: isId(d.editId) ? d.editId : null, name: typeof d.name === 'string' ? clean(d.name).slice(0, NAME_MAX) : '', grade: g, majorKey: k, rombel: r };
  };
  const cleanState = s => {
    const o = {}; if (!isObj(s)) return o;
    if (typeof s.keepOn === 'boolean') o.keepOn = s.keepOn;
    if (isObj(s.keep)) { const g = String(s.keep.grade), k = String(s.keep.majorKey), r = String(s.keep.rombel); o.keep = Data.valid(g, k, r) ? { grade: g, majorKey: k, rombel: r } : {}; }
    if (isObj(s.filters)) {
      const f = s.filters, g = Data.grades().includes(String(f.grade)) ? String(f.grade) : '', k = Data.majorKeys('').includes(String(f.majorKey)) ? String(f.majorKey) : '';
      o.filters = { name: str(f.name, 100), grade: g, majorKey: k, rombel: /^\d{1,2}$/.test(String(f.rombel)) ? String(f.rombel) : '' };
    }
    if (isObj(s.sort) && SORT_COLS.includes(s.sort.col)) o.sort = { col: s.sort.col, dir: s.sort.dir === -1 ? -1 : 1 };
    if (LIST_SORTS.includes(s.listSort)) o.listSort = s.listSort;
    if (MODES.includes(s.mode)) o.mode = s.mode;
    if (s.activeSetId === null || isId(s.activeSetId)) o.activeSetId = s.activeSetId;
    if (isObj(s.export) && typeof Layout !== 'undefined') o.export = Layout.cleanPrefs(s.export);
    return o;
  };

  /* ---------- validasi + migrasi + sanitasi ----------
     Mengembalikan { error } atau { meta, sets, revisions, settings, draft, stats, issues, warnings }. Tidak menyentuh database. */
  const parse = input => {
    if (!isObj(input) || input.format !== FORMAT) return { error: 'File ini bukan ekspor aplikasi Pencatatan Keterlambatan Siswa.' };
    if (!Number.isInteger(input.schemaVersion) || input.schemaVersion < 1) return { error: 'Versi format data tidak valid.' };
    if (input.schemaVersion > VERSION) return { error: `File memakai format versi ${input.schemaVersion}, sedangkan aplikasi ini hanya mengenal sampai versi ${VERSION}. Perbarui aplikasi dulu.` };
    if (!Array.isArray(input.sets)) return { error: 'Daftar kumpulan data tidak ditemukan.' };
    const fileVersion = input.schemaVersion, o = migrate(input);
    const issues = [], warnings = [], issue = m => { if (issues.length < 25) issues.push(m); };
    const stats = { setsInFile: o.sets.length, recordsInFile: 0, setsValid: 0, recordsValid: 0, badSets: 0, badRecords: 0, badRevs: 0, trimmed: 0 };
    const fallbackTs = iso(o.exportedAt) || new Date().toISOString();
    const trim = (raw, n) => { const c = clean(raw); if (c.length > n) stats.trimmed++; return c.slice(0, n); };
    const sets = [], ids = new Set(), rids = new Set();
    o.sets.forEach((s, i) => {
      const nrec = isObj(s) && Array.isArray(s.records) ? s.records.length : 0; stats.recordsInFile += nrec;
      const nm = isObj(s) ? str(s.name, 60) : '', lbl = `Kumpulan data #${i + 1}${nm ? ` “${nm}”` : ''}`;
      const reject = why => { stats.badSets++; stats.badRecords += nrec; issue(`${lbl}: ${why} — dilewati beserta ${nrec} catatannya.`); };
      if (!isObj(s)) return reject('bukan objek');
      if (!isId(s.id)) return reject('ID tidak valid');
      if (ids.has(s.id)) return reject('ID ganda di dalam file');
      const name = trim(s.name, NAME_MAX); if (!name) return reject('nama kosong');
      if (!isRealDate(s.date)) return reject(`tanggal tidak valid (${str(String(s.date), 20)})`);
      if (!Array.isArray(s.records)) return reject('daftar catatan tidak ada');
      ids.add(s.id);
      const records = [];
      s.records.forEach((r, k) => {
        const skip = why => { stats.badRecords++; issue(`${lbl}, catatan #${k + 1}: ${why} — dilewati.`); };
        if (!isObj(r)) return skip('bukan objek');
        if (!isId(r.id)) return skip('ID tidak valid');
        if (rids.has(r.id)) return skip('ID ganda di dalam file');
        const rn = trim(r.name, NAME_MAX); if (!rn) return skip('nama siswa kosong');
        const g = String(r.grade), mk = String(r.majorKey), rb = String(r.rombel);
        if (!Data.valid(g, mk, rb)) return skip(`kombinasi tidak ada di sumber data (tingkat ${g}, jurusan ${str(mk, 20)}, rombel ${str(rb, 5)})`);
        rids.add(r.id);
        records.push({ id: r.id, name: rn, grade: g, majorKey: mk, rombel: rb, order: Number.isFinite(r.order) ? r.order : k, createdAt: iso(r.createdAt) || fallbackTs, updatedAt: iso(r.updatedAt) || iso(r.createdAt) || fallbackTs, locked: r.locked === true, lockedAt: iso(r.lockedAt), unlockedAt: iso(r.unlockedAt) });
      });
      // Urutan unik per kumpulan data (bila ada duplikat/non-bilangan-bulat, dinomori ulang mengikuti urutan terlihat).
      if (new Set(records.map(r => r.order)).size !== records.length || records.some(r => !Number.isInteger(r.order)))
        records.map((r, k) => [r, k]).sort((a, b) => a[0].order - b[0].order || a[0].createdAt.localeCompare(b[0].createdAt) || a[1] - b[1]).forEach(([r], k) => { r.order = k; });
      stats.recordsValid += records.length; stats.setsValid++;
      const co = isId(s.copyOf) ? { copyOf: s.copyOf } : {};
      sets.push({ id: s.id, name, date: s.date, createdAt: iso(s.createdAt) || fallbackTs, updatedAt: iso(s.updatedAt) || iso(s.createdAt) || fallbackTs, status: s.status === 'selesai' ? 'selesai' : 'draf', locked: s.locked === true, lockedAt: iso(s.lockedAt), unlockedAt: iso(s.unlockedAt), note: str(s.note, NOTE_MAX), ...co, records });
    });
    if (!sets.length) return { error: stats.setsInFile ? 'Tidak ada kumpulan data yang valid di dalam file.' : 'File tidak berisi kumpulan data.' };

    const scope = o.scope === 'all' ? 'all' : 'sets';
    let revisions = [], draft = null, settings = null;
    if (scope === 'all') {
      const seen = new Set();
      (Array.isArray(o.revisions) ? o.revisions : []).forEach(r => { const c = cleanRev(r); if (!c || seen.has(c.id)) { stats.badRevs++; return; } seen.add(c.id); revisions.push(c); });
      draft = cleanDraft(o.draft);
      settings = { theme: o.settings && (o.settings.theme === 'dark' || o.settings.theme === 'light') ? o.settings.theme : null, state: cleanState(o.settings && o.settings.state) };
      if (o.counts && isObj(o.counts)) {
        const dec = o.counts, same = (a, b) => !Number.isFinite(a) || a === b;
        if (!same(dec.sets, stats.setsInFile) || !same(dec.records, stats.recordsInFile) || (fileVersion >= 2 && !same(dec.revisions, (Array.isArray(o.revisions) ? o.revisions.length : 0))))
          warnings.push('Jumlah yang tercatat di dalam file tidak sama dengan isinya. File mungkin diedit atau terpotong.');
      }
      if (fileVersion < 2) warnings.push('Cadangan dari versi lama: tidak memuat riwayat revisi, draf formulir, dan sebagian pengaturan.');
    }
    if (stats.trimmed) warnings.push(`${stats.trimmed} nama melebihi ${NAME_MAX} karakter dan dipotong.`);
    return { meta: { fileVersion, schemaVersion: VERSION, scope, exportedAt: iso(o.exportedAt), app: str(o.app, 100), appVersion: str(o.appVersion, 20) }, sets, revisions, settings, draft, stats, issues, warnings };
  };

  /* ---------- rencana GABUNG (merge) — murni, dipakai untuk pratinjau DAN dihitung ulang di dalam transaksi ----------
     local = { sets, recs } keadaan terkini. Aturan penguncian: data terkunci TIDAK PERNAH diubah/ditimpa; kunci objek yang sudah ada
     tidak pernah diubah oleh impor; konflik pada data terkunci dilewati dan dihitung terpisah. */
  const sameRec = (a, b) => a.name === b.name && a.grade === b.grade && a.majorKey === b.majorKey && a.rombel === b.rombel;
  const planMerge = (fsets, local, opt = {}) => {
    const replace = !!opt.replace, newId = opt.newId || (() => Math.random().toString(36).slice(2) + Date.now().toString(36));
    const lsets = new Map(local.sets.map(s => [s.id, s])), lrecs = new Map(local.recs.map(r => [r.id, r]));
    const used = new Set(lrecs.keys()), maxOrder = new Map();
    local.recs.forEach(r => maxOrder.set(r.setId, Math.max(maxOrder.has(r.setId) ? maxOrder.get(r.setId) : -1, r.order)));
    const mint = () => { let id; do { id = newId(); } while (used.has(id)); used.add(id); return id; };
    const claim = id => (used.has(id) ? mint() : (used.add(id), id));
    const P = { addSets: [], addRecs: [], repSets: [], repRecs: [], touched: new Set(), sum: { newSets: 0, merged: 0, newRecs: 0, same: 0, conflicts: 0, conflictsLocked: 0, lockedSkipped: 0, replaced: 0 } };
    fsets.forEach(fs => {
      const ls = lsets.get(fs.id), { records, ...fsMeta } = fs;
      if (!ls) {
        const recs = records.map(r => ({ ...r, id: claim(r.id), setId: fs.id }));
        P.addSets.push({ set: fsMeta, records: recs }); P.sum.newSets++; P.sum.newRecs += recs.length; return;
      }
      if (fs.name !== ls.name || fs.date !== ls.date) {
        P.sum.conflicts++;
        if (ls.locked) P.sum.conflictsLocked++; else if (replace) { P.repSets.push({ local: ls, file: fsMeta }); P.touched.add(ls.id); }
      }
      let added = 0;
      records.slice().sort((a, b) => a.order - b.order).forEach(fr => {
        const lr = lrecs.get(fr.id);
        if (lr && lr.setId === ls.id) {
          if (sameRec(lr, fr)) { P.sum.same++; return; }
          P.sum.conflicts++;
          if (lr.locked || ls.locked) { P.sum.conflictsLocked++; return; }
          if (replace) { P.repRecs.push({ local: lr, file: fr }); P.touched.add(ls.id); P.sum.replaced++; }
          return;
        }
        if (ls.locked) { P.sum.lockedSkipped++; return; }
        const order = (maxOrder.has(ls.id) ? maxOrder.get(ls.id) : -1) + 1; maxOrder.set(ls.id, order);
        P.addRecs.push({ ...fr, id: claim(fr.id), setId: ls.id, order }); P.sum.newRecs++; added++; P.touched.add(ls.id);
      });
      if (added) P.sum.merged++;
    });
    P.sum.skippedLocked = P.sum.lockedSkipped + P.sum.conflictsLocked;
    return P;
  };

  /* ---------- rencana PULIHKAN (ganti seluruh data) ---------- */
  const planRestore = (v, local) => {
    const ls = local.sets.filter(s => s.locked), lr = local.recs.filter(r => r.locked);
    return { blocked: ls.length > 0 || lr.length > 0, lockedSets: ls.length, lockedRecs: lr.length,
      lockedSetNames: ls.slice(0, 5).map(s => s.name), current: { sets: local.sets.length, recs: local.recs.length, revs: local.revs || 0 },
      incoming: { sets: v.sets.length, recs: v.sets.reduce((a, s) => a + s.records.length, 0), revs: v.revisions.length, draft: !!v.draft } };
  };
  // Data siap tulis untuk pemulihan penuh (referensi silang draf/activeSetId diperiksa).
  const restoreData = v => {
    const sets = [], recs = [];
    v.sets.forEach(({ records, ...s }) => { sets.push(s); records.forEach(r => recs.push({ ...r, setId: s.id })); });
    const ids = new Set(sets.map(s => s.id)), state = { ...((v.settings && v.settings.state) || {}) };
    if (state.activeSetId && !ids.has(state.activeSetId)) state.activeSetId = null;
    let draft = v.draft && ids.has(v.draft.setId) ? { ...v.draft } : null;
    if (draft && draft.editId && !recs.some(r => r.id === draft.editId && r.setId === draft.setId)) draft.editId = null;
    return { sets, recs, revs: v.revisions, state, theme: v.settings ? v.settings.theme : null, draft };
  };

  const download = (blob, name) => { const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 10000); };
  return { FORMAT, VERSION, APP_VERSION, NAME_MAX, NOTE_MAX, YEAR_MIN, YEAR_MAX, ID_RE, safe, clean, str, isId, isObj, iso, isRealDate, snapSet, snapRec, buildSets, buildFull, serialize, parse, planMerge, planRestore, restoreData, download };
})();
