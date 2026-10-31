/* zip.js — penulis ZIP minimal (tanpa kompresi/"store") untuk mengunduh banyak gambar sekaligus. Tanpa pustaka luar, bekerja offline.
   PNG/JPG sudah terkompresi, jadi menyimpan apa adanya tidak membuat berkas lebih besar secara berarti dan menjaga kode tetap sederhana.
   Nama berkas dikodekan UTF-8 (flag bit 11). Batas format ZIP klasik: ≤ 65.535 berkas, total < 4 GiB (dicek; melempar galat bila terlewati). */
'use strict';
const Zip = (() => {
  const TABLE = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let crc = 0xffffffff; for (let i = 0; i < u8.length; i++) crc = TABLE[(crc ^ u8[i]) & 0xff] ^ (crc >>> 8); return (crc ^ 0xffffffff) >>> 0; }
  const enc = new TextEncoder(), tick = () => new Promise(r => setTimeout(r, 0));
  const u16 = n => Uint8Array.of(n & 255, (n >>> 8) & 255), u32 = n => Uint8Array.of(n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255);
  const cat = (...a) => { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; a.forEach(x => { o.set(x, p); p += x.length; }); return o; };
  function dos(d) { return { t: ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff, d: (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff }; }

  /* files: [{ name, blob }] → Blob 'application/zip'. onProgress(i, n) dipanggil per berkas. */
  async function build(files, { signal, onProgress } = {}) {
    if (!files.length) throw new Error('Tidak ada berkas untuk dimasukkan ke ZIP.');
    if (files.length > 65535) throw new Error('Terlalu banyak berkas untuk satu ZIP.');
    const seen = new Set(); files.forEach(f => { if (seen.has(f.name)) throw new Error('Nama berkas ganda di dalam ZIP: ' + f.name); seen.add(f.name); });
    const now = dos(new Date()), parts = [], central = []; let off = 0;
    for (let i = 0; i < files.length; i++) {
      if (signal && signal.aborted) { const e = new Error('Dibatalkan.'); e.cancelled = true; throw e; }
      if (onProgress) onProgress(i, files.length);
      const f = files[i], name = enc.encode(f.name), size = f.blob.size;
      if (size >= 0xffffffff || off + size >= 0xfffffff0) throw new Error('Total ukuran ZIP melebihi batas format (4 GB).');
      const crc = crc32(new Uint8Array(await f.blob.arrayBuffer()));
      const head = cat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(now.t), u16(now.d), u32(crc), u32(size), u32(size), u16(name.length), u16(0), name);
      central.push(cat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(now.t), u16(now.d), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), name));
      parts.push(head, f.blob); off += head.length + size;
      await tick();
    }
    const cd = cat(...central);
    if (off + cd.length >= 0xfffffff0) throw new Error('Total ukuran ZIP melebihi batas format (4 GB).');
    parts.push(cd, cat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cd.length), u32(off), u16(0)));
    if (onProgress) onProgress(files.length, files.length);
    return new Blob(parts, { type: 'application/zip' });
  }
  return { build, crc32 };
})();
