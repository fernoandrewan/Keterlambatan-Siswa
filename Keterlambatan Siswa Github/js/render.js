/* render.js — penggambar kanvas: mengubah halaman hasil Layout.plan (daftar operasi persegi/teks) menjadi berkas PNG/JPG SUNGGUHAN.
   Ini bukan tangkapan layar tampilan aplikasi: gambar dibuat dari data pada resolusi yang sudah dihitung lebih dulu oleh Layout (batas sisi & luas piksel).

   Prinsip:
   - Persegi dibulatkan ke piksel perangkat → garis tipis tajam (tidak kabur).
   - Menggambar bertahap (menyerahkan kendali ke UI tiap ±1500 operasi) dan bisa dibatalkan.
   - Satu kanvas pada satu waktu; segera dilepas setelah dikodekan → memori tidak menumpuk saat banyak gambar.
   - Kegagalan (memori kurang, kanvas ditolak browser, berkas kosong) dilaporkan jelas — tidak pernah menghasilkan berkas rusak/kosong diam-diam. */
'use strict';
const Render = (() => {
  const tick = () => new Promise(r => setTimeout(r, 0));
  const fontOf = (z, b) => `${b ? 'bold ' : ''}${Math.round(z * 100) / 100}px ${Layout.FONT}`;
  const cancelled = () => { const e = new Error('Dibatalkan.'); e.cancelled = true; return e; };
  const isCancel = e => !!(e && e.cancelled);

  /* Pengukur teks: diukur pada ukuran z×scale lalu dibagi scale, supaya sama persis dengan yang akan digambar pada resolusi itu. */
  function measurer(scale = 1) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const c = cv.getContext('2d'); let cur = '';
    return { scale, w(s, z, b) { const f = fontOf(z * scale, b); if (f !== cur) { c.font = f; cur = f; } return c.measureText(s).width / scale; } };
  }

  // Pembulatan dengan epsilon kecil: tepi dua persegi yang bersebelahan (selisih 1e-13 akibat floating point) tetap jatuh di piksel yang sama → tanpa celah.
  const q = (v, s) => Math.round(v * s + 1e-6);

  /* Menggambar halaman pada kanvas cv dengan skala s (piksel per satuan tata letak). Hanya operasi yang terlihat di area kanvas yang digambar. */
  async function draw(cv, page, s, o = {}) {
    const c = cv.getContext('2d');                       // sengaja punya alpha: teks memakai anti-alias abu-abu (bukan LCD berwarna) yang aman untuk berkas
    if (!c) throw new Error('Browser tidak dapat membuat kanvas sebesar ini.');
    c.fillStyle = page.bg; c.fillRect(0, 0, cv.width, cv.height);
    c.textBaseline = 'alphabetic'; c.textAlign = 'left';
    const maxY = cv.height / s + 2, ops = page.ops; let font = '', fill = page.bg;
    for (let i = 0; i < ops.length; i++) {
      const p = ops[i];
      if (p.t === 'r') {
        if (p.y > maxY) continue;
        if (p.c !== fill) { c.fillStyle = p.c; fill = p.c; }
        const x0 = q(p.x, s), y0 = q(p.y, s), x1 = Math.max(x0 + 1, q(p.x + p.w, s)), y1 = Math.max(y0 + 1, q(p.y + p.h, s));
        c.fillRect(x0, y0, x1 - x0, y1 - y0);
      } else {
        if (p.y - p.z > maxY) continue;
        if (p.c !== fill) { c.fillStyle = p.c; fill = p.c; }
        const f = fontOf(p.z * s, p.b); if (f !== font) { c.font = f; font = f; }
        c.fillText(p.s, p.x * s, p.y * s);
      }
      if ((i & 1023) === 1023) { await tick(); if (o.signal && o.signal.aborted) throw cancelled(); }
    }
  }

  const toBlob = (cv, type, quality) => new Promise((res, rej) => {
    try { cv.toBlob(b => (b ? res(b) : rej(new Error('Browser gagal membuat berkas gambar (kemungkinan memori tidak cukup).'))), type, quality); } catch (e) { rej(e); }
  });
  const SIG = { 'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/jpeg': [0xff, 0xd8, 0xff] };
  async function signatureOK(blob, type) {
    const sig = SIG[type]; if (!sig || blob.size < 64) return false;
    const h = new Uint8Array(await blob.slice(0, sig.length).arrayBuffer()); return sig.every((v, i) => h[i] === v);
  }

  /* Memastikan browser sanggup membuat kanvas w×h: membuat, mengecat, lalu membaca balik piksel terakhir. */
  function probe(w, h) {
    const cv = document.createElement('canvas');
    try {
      cv.width = w; cv.height = h; const c = cv.getContext('2d'); if (!c) return false;
      c.fillStyle = '#123456'; c.fillRect(w - 1, h - 1, 1, 1);
      const d = c.getImageData(w - 1, h - 1, 1, 1).data; return d[3] === 255 && d[0] === 0x12 && d[1] === 0x34 && d[2] === 0x56;
    } catch (_) { return false; } finally { cv.width = cv.height = 0; }
  }

  /* Satu halaman → satu berkas gambar (Blob). format: 'png' | 'jpg'. */
  async function image(page, o) {
    const s = o.scale, W = Math.ceil(page.w * s), H = Math.ceil(page.h * s), type = o.format === 'jpg' ? 'image/jpeg' : 'image/png';
    const cv = document.createElement('canvas');
    try {
      cv.width = W; cv.height = H;
      await draw(cv, page, s, o);
      const px = cv.getContext('2d').getImageData(W - 1, H - 1, 1, 1).data;
      if (px[3] !== 255) throw new Error(`Browser tidak mampu membuat gambar ${W}×${H} piksel. Turunkan ketajaman atau pilih batas "Aman untuk HP".`);
      if (o.signal && o.signal.aborted) throw cancelled();
      const blob = await toBlob(cv, type, o.format === 'jpg' ? o.quality : undefined);
      if (!(await signatureOK(blob, type))) throw new Error('Berkas gambar yang dihasilkan browser tidak valid.');
      return { blob, w: W, h: H, bytes: blob.size, type };
    } finally { cv.width = cv.height = 0; }                // lepas memori kanvas segera
  }

  /* Banyak halaman → banyak berkas, berurutan. Mengembalikan { files, error } — bila gagal/dibatalkan di tengah, berkas yang sudah jadi tetap dikembalikan. */
  async function images(pages, names, o, onProgress) {
    const files = []; let error = null;
    for (let i = 0; i < pages.length; i++) {
      if (o.signal && o.signal.aborted) { error = cancelled(); break; }
      if (onProgress) onProgress(i, pages.length);
      try { const r = await image(pages[i], o); files.push({ name: names[i], ...r }); }
      catch (e) { error = e; error.index = i; break; }
      await tick();
    }
    if (!error && onProgress) onProgress(pages.length, pages.length);
    return { files, error };
  }

  /* Pratinjau cepat ke kanvas di layar: lebar mengikuti ruang yang tersedia, hanya bagian atas halaman. */
  async function preview(cv, page, availCss, maxCssH) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), css = Math.min(1, availCss / page.w) , vis = Math.min(page.h, maxCssH / css);
    const s = css * dpr; cv.width = Math.max(1, Math.ceil(page.w * s)); cv.height = Math.max(1, Math.ceil(vis * s));
    cv.style.width = Math.ceil(page.w * css) + 'px'; cv.style.height = Math.ceil(vis * css) + 'px';
    await draw(cv, page, s);
    return { cut: vis < page.h - 0.5 };
  }

  return { measurer, draw, image, images, preview, probe, isCancel, cancelled };
})();
