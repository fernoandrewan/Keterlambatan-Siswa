/* boot.js — memulai aplikasi: membuka database, siklus hidup halaman (simpan saat disembunyikan), service worker, spanduk pemberitahuan. */
'use strict';

/* ---------- spanduk pemberitahuan (beberapa dapat tampil bersamaan, masing-masing punya kunci) ---------- */
function notice(key, html) {
  const host = $('#warn'); let el = host.querySelector(`[data-k="${key}"]`);
  if (!el) { el = document.createElement('div'); el.dataset.k = key; host.appendChild(el); }
  el.innerHTML = html; host.hidden = false;
}
function clearNotice(key) { const host = $('#warn'), el = host.querySelector(`[data-k="${key}"]`); if (el) el.remove(); host.hidden = !host.children.length; }
acts.reload = async () => { try { await settle(false); } catch (_) {} location.reload(); };
const reloadBtn = '<button class="btn" data-act="reload">Muat ulang</button>';
const msg = t => `<span>${t}</span>`;   // teks dibungkus satu elemen agar kalimat tidak terpecah oleh tombol saat layar sempit

/* ---------- siklus hidup: simpan secepat mungkin saat halaman disembunyikan/ditutup ----------
   Peramban HP dapat mematikan halaman tanpa "beforeunload". Saat hidden/pagehide/freeze, penulisan yang tertunda dimulai SEKARANG
   (transaksi dibuat sinkron di Store sehingga berurutan di antrean IndexedDB). Ini upaya terbaik; tidak menjanjikan bertahan dari mati listrik mendadak. */
function flushNow() {
  try { flushDraft(); } catch (_) {}
  try { if (sT) saveSetFields(false).catch(() => {}); } catch (_) {}
  if (ssT) { clearTimeout(ssT); ssT = 0; Store.saveState().catch(() => {}); }
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
addEventListener('pagehide', flushNow);
document.addEventListener('freeze', flushNow);
// Peringatan keluar hanya bila ada perubahan yang GAGAL tersimpan (bukan sekadar sedang menulis), agar tidak mengganggu pemakaian normal.
addEventListener('beforeunload', e => { flushNow(); if (Store.status().errors.length) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('unhandledrejection', e => { const r = e.reason; if (r && (r.saveFailed || r.shown || r.rule)) return; console.error(r); toast('Terjadi kesalahan tak terduga: ' + ((r && r.message) || r), true); });

/* ---------- service worker ---------- */
function registerSW() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const had = !!navigator.serviceWorker.controller;   // sudah ada pengendali = ini PEMBARUAN, bukan pemasangan pertama
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) notice('update', `${msg('Versi baru aplikasi sudah terpasang. Muat ulang halaman untuk memakainya. Data Anda tidak dihapus.')}${reloadBtn}`); });
  navigator.serviceWorker.register('./sw.js').then(reg => { reg.update().catch(() => {}); }).catch(() => {});
}

/* ---------- start ---------- */
(async function boot() {
  const view = $('#view'), chip = (t, s) => { const e = $('#save'); e.textContent = t; e.dataset.s = s; };
  if (!window.indexedDB) { view.innerHTML = '<div class="warn">Browser ini tidak mendukung IndexedDB, jadi data tidak dapat disimpan.</div>'; chip('Tidak dapat menyimpan', 'err'); return; }
  if (!window.isSecureContext) notice('ctx', 'Aplikasi dibuka tanpa HTTPS: mode offline dan pemasangan tidak aktif. Sajikan lewat HTTPS atau localhost.');
  DB.hooks.onblocked = () => notice('dbblock', 'Pembaruan database tertahan karena aplikasi ini masih terbuka di tab/jendela lain. Tutup tab lain, lalu muat ulang halaman ini.');
  DB.hooks.onclose = why => {
    chip('Terputus', 'err');
    notice('dbclose', why === 'versionchange' ? `${msg('Aplikasi diperbarui di tab lain, jadi sambungan database di tab ini ditutup. Muat ulang halaman agar tetap sinkron.')}${reloadBtn}` : `${msg('Sambungan ke penyimpanan lokal terputus (browser menutupnya atau data situs dibersihkan). Muat ulang halaman. Perubahan yang belum tersimpan mungkin hilang.')}${reloadBtn}`);
  };
  try {
    await Store.init(); clearNotice('dbblock');
    if (S.meta.theme) document.documentElement.dataset.theme = S.meta.theme;
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) { view.innerHTML = `<div class="warn">Gagal membuka penyimpanan lokal: ${esc(e.message || e)}. Data tidak dapat disimpan.</div>`; chip('Gagal menyimpan', 'err'); return; }
  addEventListener('hashchange', render); render();
  registerSW();
})();
