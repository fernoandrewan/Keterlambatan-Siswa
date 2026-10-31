/* install.js — kartu "Pasang Aplikasi" di beranda (richer install UI).
   - Chrome/Edge/Samsung Internet/Opera (Android & desktop): memakai event beforeinstallprompt, jadi tombol memicu dialog pemasangan asli browser.
     Dialog asli itu sendiri tampil "kaya" (deskripsi + tangkapan layar) berkat `description` dan `screenshots` di manifest.json.
   - iPhone/iPad: Safari tidak punya API pemasangan, jadi tombol membuka panduan langkah demi langkah.
   - Kartu otomatis hilang bila: aplikasi sudah berjalan sebagai aplikasi terpasang (display-mode standalone), event `appinstalled` terpicu,
     atau browser tidak mendukung pemasangan. Pengguna juga bisa menunda kartu selama 3 hari ("Nanti saja").
   Tidak menyentuh IndexedDB; hanya satu kunci kecil di localStorage untuk status tunda/terpasang (dibungkus try/catch). */
'use strict';
const PWAInstall = (() => {
  const K_SNOOZE = 'pwa-install-snooze-until', K_DONE = 'pwa-install-done', SNOOZE_MS = 3 * 24 * 3600 * 1000;
  let deferred = null;   // event beforeinstallprompt yang ditahan
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };
  const standalone = () => matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: window-controls-overlay)').matches
    || matchMedia('(display-mode: minimal-ui)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const snoozed = () => +ls.get(K_SNOOZE) > Date.now();

  // 'native' = ada prompt bawaan; 'ios' = panduan manual; '' = jangan tampilkan
  function mode() {
    if (!window.isSecureContext || standalone() || ls.get(K_DONE) === '1' && !deferred) return '';
    if (snoozed()) return '';
    if (deferred) return 'native';
    if (isIOS()) return 'ios';
    return '';
  }

  const ICON_DL = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14"/></svg>';
  function inner() {
    const m = mode(); if (!m) return '';
    return `<div class="pwa-head"><img class="pwa-ic" src="icons/icon-192.png" alt="" width="56" height="56">
      <div class="pwa-tx"><b>Pasang aplikasi di perangkat ini</b><span>Buka langsung dari layar utama, seperti aplikasi biasa.</span></div></div>
      <ul class="pwa-ft"><li>Bisa dipakai offline</li><li>Data tersimpan di perangkat</li><li>Lebih cepat &amp; layar penuh</li></ul>
      <div class="pwa-cta"><button type="button" class="pwa-btn" data-act="pwa-install">${ICON_DL}<span>${m === 'ios' ? 'Cara memasang' : 'Pasang Aplikasi'}</span></button>
      <button type="button" class="pwa-later" data-act="pwa-later">Nanti saja</button></div>`;
  }
  const html = () => `<section id="pwa-slot" class="pwa" aria-label="Pasang aplikasi"${mode() ? '' : ' hidden'}>${inner()}</section>`;
  function refresh() { const el = document.getElementById('pwa-slot'); if (!el) return; el.innerHTML = inner(); el.hidden = !el.innerHTML; }

  /* ---------- peristiwa peramban ---------- */
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; ls.del(K_DONE); refresh(); });
  addEventListener('appinstalled', () => {
    deferred = null; ls.set(K_DONE, '1'); ls.del(K_SNOOZE); refresh();
    if (typeof toast === 'function') toast('Aplikasi berhasil dipasang. Cari ikonnya di layar utama.');
  });
  try { matchMedia('(display-mode: standalone)').addEventListener('change', refresh); } catch (_) {}

  /* ---------- tindakan ---------- */
  async function install() {
    if (deferred) {
      const ev = deferred; deferred = null;   // event hanya dapat dipakai sekali
      try {
        await ev.prompt();
        const { outcome } = await ev.userChoice;
        if (outcome === 'accepted') { ls.set(K_DONE, '1'); }
      } catch (_) {}
      refresh();   // bila ditolak, kartu hilang sampai browser memicu beforeinstallprompt lagi
      return;
    }
    if (isIOS()) await ask('Pasang di iPhone/iPad', `<ol class="pwa-steps">
      <li>Buka halaman ini di <b>Safari</b>.</li>
      <li>Ketuk tombol <b>Bagikan</b> <span class="pwa-share" aria-hidden="true">⬆︎</span> di bagian bawah/atas layar.</li>
      <li>Gulir, lalu pilih <b>Tambah ke Layar Utama</b>.</li>
      <li>Ketuk <b>Tambah</b>. Ikon aplikasi akan muncul di layar utama.</li></ol>
      <p class="meta">Setelah terpasang, buka sekali dengan internet agar semua aset tersimpan. Setelah itu aplikasi berjalan offline.</p>`, ['Mengerti']);
  }
  function later() { ls.set(K_SNOOZE, String(Date.now() + SNOOZE_MS)); refresh(); }

  acts['pwa-install'] = install;
  acts['pwa-later'] = later;
  return { html, refresh };
})();
