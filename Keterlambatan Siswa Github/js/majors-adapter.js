/* majors-adapter.js — satu-satunya pintu ke majorsData (js/data/majors.js, tidak diubah).
   Tidak ada salinan daftar kelas/jurusan di tempat lain: form, filter, tabel, ekspor gambar/PDF, dan validasi impor memakai ini.
   Catatan penting: kode jurusan yang sama bisa memiliki nama/singkatan berbeda per tingkat kelas
   (br: Pemasaran/PEM di kelas X, Bisnis Ritel/BR di XI–XII; ulw: Usaha Layanan Pariwisata/ULP di X, Usaha Layanan Wisata/ULW di XI–XII),
   dan jumlah rombel bisa berbeda per tingkat (AKL: 3 rombel di X–XI, 2 di XII). Semua fungsi di bawah selalu sadar-tingkat. */
const Data = (() => {
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const LBL = { '10': 'X', '11': 'XI', '12': 'XII' };
  const grades = () => Object.keys(majorsData).sort((a, b) => a - b);
  const majors = g => (has(majorsData, g) ? majorsData[g] : []);
  const major = (g, k) => majors(g).find(m => m.key === k);
  const rombels = (g, k) => (major(g, k) || { rombels: [] }).rombels;
  const valid = (g, k, r) => rombels(g, k).includes(String(r));
  const roman = g => LBL[g] || String(g);
  const label = g => 'Kelas ' + roman(g);
  // Singkatan/nama sesuai sumber data untuk tingkat tertentu; kode tak dikenal (data lama) ditampilkan apa adanya.
  const short = (g, k) => (major(g, k) || { short: k }).short;
  const fullName = (g, k) => (major(g, k) || { name: k }).name;
  const majorIndex = (g, k) => { const i = majors(g).findIndex(m => m.key === k); return i < 0 ? 999 : i; };
  const gradeText = gs => gs.map(roman).join(', ');

  // Semua variasi (singkatan + nama) sebuah kode jurusan lintas tingkat, dikelompokkan: [{short, name, grades:[...]}].
  const variants = k => {
    const out = [];
    grades().forEach(g => {
      const m = major(g, k); if (!m) return;
      const v = out.find(x => x.short === m.short && x.name === m.name);
      v ? v.grades.push(g) : out.push({ short: m.short, name: m.name, grades: [g] });
    });
    return out;
  };
  const majorKeys = g => { const ks = []; (g ? [g] : grades()).forEach(x => majors(x).forEach(j => ks.includes(j.key) || ks.push(j.key))); return ks; };
  // Untuk filter: tanpa tingkat kelas = gabungan semua tingkat. Entri memuat SEMUA variasi nama (bukan hanya tingkat pertama).
  const majorsFor = g => majorKeys(g).map(k => {
    const vs = g ? [{ short: short(g, k), name: fullName(g, k), grades: [g] }] : variants(k);
    return { key: k, short: vs.map(v => v.short).join(' / '), name: vs.map(v => v.name).join(' / '), variants: vs, mixed: vs.length > 1 };
  });
  // Label pilihan jurusan. Tanpa tingkat, nama yang berbeda antartingkat disebutkan eksplisit beserta tingkatnya.
  const majorLabel = (g, k) => {
    if (g) return `${short(g, k)} — ${fullName(g, k)}`;
    const vs = variants(k);
    if (vs.length === 1) {
      const all = grades().length, v = vs[0];
      return `${v.short} — ${v.name}` + (v.grades.length === all ? '' : ` (hanya ${gradeText(v.grades)})`);
    }
    return `${vs.map(v => v.short).join(' / ')} — ${vs.map(v => `${v.name} (${gradeText(v.grades)})`).join(' / ')}`;
  };
  const hasMixedNames = () => majorKeys('').some(k => variants(k).length > 1);
  const mixedNames = () => majorKeys('').filter(k => variants(k).length > 1).map(k => ({ key: k, variants: variants(k) }));
  const rombelsFor = (g, k) => { const s = new Set(); (g ? [g] : grades()).forEach(x => majors(x).forEach(j => (!k || j.key === k) && j.rombels.forEach(r => s.add(r)))); return [...s].sort((a, b) => a - b); };
  const rombelGrades = (k, r) => grades().filter(g => valid(g, k, r));
  // Label rombel; lintas tingkat memberi tahu bila rombel itu tidak ada di semua tingkat (mis. AKL Rombel 3 tidak ada di XII).
  const rombelLabel = (g, k, r) => {
    if (g || !k) return 'Rombel ' + r;
    const gs = rombelGrades(k, r), have = grades().filter(x => major(x, k));
    return gs.length === have.length ? 'Rombel ' + r : `Rombel ${r} (hanya ${gradeText(gs)})`;
  };
  // Seluruh kombinasi sah sesuai urutan sumber data (dipakai "tampilkan kelompok kosong" pada Matriks Kelas).
  const combos = () => grades().flatMap(g => majors(g).flatMap(m => m.rombels.map(r => ({ grade: g, majorKey: m.key, rombel: r }))));
  return { grades, majors, major, rombels, valid, label, roman, short, fullName, majorIndex, variants, majorKeys, majorsFor, majorLabel, hasMixedNames, mixedNames, rombelsFor, rombelGrades, rombelLabel, gradeText, combos };
})();
