/* sw.js — cache-first untuk app shell. Pola diadaptasi dari sw.js proyek Jadwal SMKN1 Bitung (AGPL-3.0).
   Tidak menyentuh IndexedDB dan tidak men-cache respons lain (file impor/ekspor, data pribadi).
   Seluruh aset (termasuk modul ekspor gambar/PDF) dimuat dari berkas lokal; tidak ada CDN. Naikkan VERSION setiap kali ada aset yang berubah agar
   perangkat menerima versi baru; cache versi lama dihapus saat aktivasi, sedangkan IndexedDB (data pengguna) tidak pernah disentuh. */
const VERSION = 'keterlambatan-smkn1-v8';
const SHELL = ['./', './index.html', './manifest.json', './css/app.css',
  './js/data/majors.js', './js/majors-adapter.js', './js/db.js', './js/io.js', './js/store.js', './js/pdf-fonts.js', './js/layout.js', './js/render.js', './js/zip.js', './js/pdf.js',
  './js/app.js', './js/install.js', './js/ui-io.js', './js/ui-bulk.js', './js/ui-history.js', './js/ui-export.js', './js/ui-guide.js', './js/boot.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-192.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png', './icons/favicon-16.png', './icons/logo-sekolah-96.png'];
// cache:'reload' melewati cache HTTP browser, sehingga berkas yang masuk ke cache aplikasi selalu salinan terbaru dari server (bukan salinan basi).
self.addEventListener('install', e => e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys()
  .then(ks => Promise.all(ks.filter(k => k.startsWith('keterlambatan-smkn1-') && k !== VERSION).map(k => caches.delete(k))))
  .then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== self.location.origin) return;
  e.respondWith(caches.match(r, { ignoreSearch: true }).then(hit => hit || fetch(r).catch(() =>
    r.mode === 'navigate' ? caches.match('./index.html') : new Response('', { status: 504, statusText: 'Offline' }))));
});
