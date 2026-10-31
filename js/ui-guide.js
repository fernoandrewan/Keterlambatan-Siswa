/* ui-guide.js — halaman "Panduan" (#/panduan): penjelasan fungsi aplikasi dan cara memakainya, ditulis untuk pemula.
   Halaman ini hanya teks statis; tidak membaca atau menulis data apa pun. Daftar isi memakai tombol yang menggulir halaman
   (bukan tautan #bagian) karena router aplikasi memakai location.hash. */
'use strict';
routes.panduan = vGuide;

const GUIDE_TOC = [
  ['g-fungsi', 'Aplikasi ini untuk apa?'],
  ['g-istilah', 'Istilah yang dipakai'],
  ['g-catat', 'Mencatat siswa yang terlambat'],
  ['g-lihat', 'Melihat dan merapikan data'],
  ['g-gambar', 'Menyimpan hasil sebagai gambar atau PDF'],
  ['g-cadangan', 'Cadangan dan pindah perangkat'],
  ['g-riwayat', 'Mengembalikan data yang terhapus'],
  ['g-pasang', 'Memasang aplikasi dan memakainya tanpa internet'],
  ['g-tanya', 'Pertanyaan yang sering muncul'],
];

// Satu bagian panduan: nomor + judul + isi. tabindex=-1 supaya bisa difokuskan setelah menggulir (pembaca layar).
const gSec = (id, title, body) => {
  const n = GUIDE_TOC.findIndex(t => t[0] === id) + 1;
  return `<section class="gd-sec" id="${id}" tabindex="-1" aria-labelledby="${id}-h">
    <header class="gd-sh"><span class="gd-no" aria-hidden="true">${n}</span><h2 id="${id}-h">${title}</h2></header>
    ${body}
    <p class="gd-top"><button type="button" class="gd-link" data-act="gd-go" data-id="g-toc">↑ Kembali ke daftar isi</button></p>
  </section>`;
};
const gStep = html => `<li>${html}</li>`;
const k = t => `<b class="k">${t}</b>`;   // nama tombol/menu, ditampilkan seperti di layar agar mudah dicocokkan

function vGuide() {
  return `<div class="gd">
  <p class="gd-back"><a class="btn" href="#/">← Kembali ke beranda</a></p>

  <header class="gd-hero">
    <h1>Panduan Penggunaan</h1>
    <p class="gd-lead">Halaman ini menjelaskan aplikasi dari awal, dengan bahasa sehari-hari. Anda tidak perlu paham komputer. Ikuti saja langkahnya satu per satu.</p>
  </header>

  <section class="gd-quick" aria-label="Ringkasan tiga langkah">
    <h2 class="gd-sub">Kalau terburu-buru, ingat tiga hal ini</h2>
    <ol class="gd-three">
      <li><b>Catat</b><span>Di beranda, ketuk ${k('Membuat Data')}. Ketik nama siswa, pilih kelasnya, lalu ketuk ${k('Masukan Data')}.</span></li>
      <li><b>Lihat &amp; bagikan</b><span>Ketuk ${k('Melihat Data')} untuk membuka daftar, mencari nama, atau mengubahnya jadi gambar atau PDF.</span></li>
      <li><b>Cadangkan</b><span>Ketuk ${k('Ekspor/Impor Data')}, lalu ${k('Unduh cadangan penuh')}. Lakukan ini secara rutin.</span></li>
    </ol>
  </section>

  <nav class="gd-toc" id="g-toc" tabindex="-1" aria-label="Daftar isi panduan">
    <h2 class="gd-sub">Daftar isi</h2>
    <ol>${GUIDE_TOC.map(([id, t], i) => `<li><button type="button" data-act="gd-go" data-id="${id}"><span class="gd-no" aria-hidden="true">${i + 1}</span><span class="gd-tt">${t}</span></button></li>`).join('')}</ol>
  </nav>

  ${gSec('g-fungsi', 'Aplikasi ini untuk apa?', `
    <p>Aplikasi ini adalah <b>buku catatan digital</b> untuk mencatat siswa SMK Negeri 1 Bitung yang terlambat. Sebagai pengganti buku tulis, Anda cukup mengetik nama siswa dan memilih kelasnya. Aplikasi menyimpan dan merapikannya menjadi daftar.</p>
    <p>Dengan aplikasi ini Anda bisa:</p>
    <ul class="gd-list">
      <li><b>Mencatat</b> nama siswa beserta kelas, jurusan, dan rombelnya.</li>
      <li><b>Melihat, mencari, dan mengurutkan</b> catatan yang sudah tersimpan.</li>
      <li><b>Mengubah daftar menjadi gambar atau PDF</b> untuk dicetak, atau mengirimkannya ke orang lain.</li>
      <li><b>Membuat cadangan</b> supaya data aman bila perangkat bermasalah.</li>
    </ul>
    <div class="gd-callout gd-warn" role="note"><b>Penting: data disimpan di perangkat ini saja</b>
      <p>Catatan tidak dikirim ke internet dan tidak disimpan di komputer lain. Karena itu, kalau HP rusak, hilang, atau data browser dibersihkan, catatan di dalamnya ikut hilang. Cara mencegahnya ada di bagian 6, yaitu membuat <b>cadangan</b>.</p></div>
  `)}

  ${gSec('g-istilah', 'Istilah yang dipakai', `
    <p>Beberapa kata di aplikasi mungkin terdengar asing. Ini artinya, dengan contoh:</p>
    <dl class="gd-terms">
      <div><dt>Kumpulan data</dt><dd>Satu &ldquo;lembar&rdquo; daftar, biasanya untuk satu hari. Contoh namanya: <i>Keterlambatan, 5 Agustus 2026</i>. Di dalamnya ada banyak catatan.</dd></div>
      <div><dt>Catatan</dt><dd>Satu baris untuk satu siswa yang terlambat.</dd></div>
      <div><dt>Kelas</dt><dd>Tingkat kelas siswa: Kelas X, XI, atau XII.</dd></div>
      <div><dt>Jurusan</dt><dd>Jurusan atau keahlian siswa, misalnya AKL atau MPLB.</dd></div>
      <div><dt>Rombel</dt><dd>Singkatan dari <i>rombongan belajar</i>, yaitu kelas yang sejurusan dan sama tingkatnya, dibedakan dengan nomor (1, 2, 3, dan seterusnya).</dd></div>
      <div><dt>Draf dan Selesai</dt><dd><b>Draf</b> berarti daftar masih dalam pencatatan dan boleh ditambah. <b>Selesai</b> berarti pencatatan sudah ditutup.</dd></div>
      <div><dt>Kunci 🔒</dt><dd>Pengaman agar catatan tidak terhapus atau berubah karena salah ketuk. Catatan terkunci tidak bisa diubah sampai kuncinya dibuka. Kunci ini <b>bukan kata sandi</b>, jadi tidak mencegah orang lain membuka aplikasi.</dd></div>
      <div><dt>Cadangan</dt><dd>Salinan seluruh data Anda dalam bentuk satu <i>file</i>, yang disimpan di tempat lain sebagai penyelamat.</dd></div>
      <div><dt>File</dt><dd>Berkas yang tersimpan di HP atau komputer, seperti foto atau dokumen. Aplikasi ini bisa membuat file gambar, PDF, dan file cadangan. File cadangan berakhiran <b>.json</b>. File ini hanya untuk dibaca oleh aplikasi ini, jadi tidak perlu dibuka dengan cara lain.</dd></div>
    </dl>
  `)}

  ${gSec('g-catat', 'Mencatat siswa yang terlambat', `
    <ol class="gd-steps">
      ${gStep(`Di beranda, ketuk ${k('Membuat Data')}.`)}
      ${gStep(`Bila belum ada sesi yang berjalan, muncul halaman <b>Sesi Baru</b>. Nama dan tanggalnya sudah terisi otomatis dengan hari ini. Anda boleh mengubahnya. Lalu ketuk ${k('Mulai Mencatat')}.`)}
      ${gStep(`Ketik <b>Nama siswa</b> pada kotak yang tersedia.`)}
      ${gStep(`Pilih <b>Kelas</b>, lalu <b>Jurusan</b>, lalu <b>Rombel</b>. Pilihlah berurutan dari atas ke bawah, karena pilihan berikutnya menyesuaikan pilihan sebelumnya.`)}
      ${gStep(`Ketuk ${k('Masukan Data')}. Nama siswa akan muncul di <b>Daftar entri</b> di bawahnya, dan kotak nama kosong lagi, siap untuk siswa berikutnya.`)}
      ${gStep(`Ulangi langkah 3 sampai 5 untuk siswa lain. Bila banyak siswa berasal dari kelas yang sama, biarkan kotak <b>Pertahankan pilihan kelas</b> tercentang. Kelas, jurusan, dan rombel tidak perlu dipilih ulang.`)}
      ${gStep(`Bila semua sudah tercatat, ketuk ${k('Simpan &amp; Selesaikan')}.`)}
    </ol>
    <div class="gd-callout gd-tip" role="note"><b>Tidak perlu menekan tombol &ldquo;simpan&rdquo;</b>
      <p>Aplikasi menyimpan sendiri setiap perubahan. Lihat tulisan kecil di bagian atas layar: <b>Tersimpan</b> artinya aman, <b>Menyimpan…</b> artinya tunggu sebentar.</p>
      <p>Kalau aplikasi tertutup di tengah pencatatan, tenang saja. Buka lagi, lalu di beranda akan muncul kotak <b>Sesi belum selesai</b>. Ketuk ${k('Lanjutkan pencatatan')} untuk meneruskan.</p></div>
    <h3 class="gd-h3">Salah ketik atau salah kelas?</h3>
    <p>Setiap nama di <b>Daftar entri</b> punya beberapa tombol kecil di sebelah kanannya:</p>
    <ul class="gd-list">
      <li><b>✎</b> untuk mengubah. Nama dan kelasnya naik ke formulir. Setelah diperbaiki, ketuk ${k('Simpan Perubahan')}.</li>
      <li><b>↑</b> dan <b>↓</b> untuk menggeser urutan nama ke atas atau ke bawah.</li>
      <li><b>🔓 / 🔒</b> untuk mengunci atau membuka kunci catatan itu.</li>
      <li><b>🗑</b> untuk menghapus. Aplikasi akan bertanya dulu sebelum benar-benar menghapus.</li>
    </ul>
    <p>Bila Anda memasukkan nama dan kelas yang sama dua kali, aplikasi memperingatkan dengan pesan <b>Kemungkinan data ganda</b>. Bila itu memang dua siswa yang berbeda tetapi namanya kebetulan sama, ketuk ${k('Tetap masukkan')}.</p>
  `)}

  ${gSec('g-lihat', 'Melihat dan merapikan data', `
    <ol class="gd-steps">
      ${gStep(`Di beranda, ketuk ${k('Melihat Data')}. Semua kumpulan data yang pernah dibuat tampil di sini.`)}
      ${gStep(`Untuk mencari, ketik sebagian nama daftarnya di kotak <b>Cari kumpulan data</b>. Untuk mengatur urutan daftar, pakai pilihan <b>Urutkan</b>.`)}
      ${gStep(`Ketuk ${k('Buka')} pada daftar yang ingin dilihat. Isinya tampil sebagai tabel berisi nama siswa dan kelasnya.`)}
    </ol>
    <h3 class="gd-h3">Tombol pada setiap kumpulan data</h3>
    <dl class="gd-terms">
      <div><dt>Buka</dt><dd>Melihat isi daftar.</dd></div>
      <div><dt>Salin</dt><dd>Membuat daftar baru dengan isi yang sama. Berguna bila daftarnya mirip dan Anda tidak ingin mengetik ulang. Daftar aslinya tidak berubah.</dd></div>
      <div><dt>Kunci</dt><dd>Mengunci seluruh daftar agar tidak bisa diubah.</dd></div>
      <div><dt>Bagikan</dt><dd>Mengirim daftar ke orang lain, misalnya lewat WhatsApp.</dd></div>
      <div><dt>Ekspor</dt><dd>Mengunduh daftar sebagai file cadangan kecil.</dd></div>
      <div><dt>Hapus</dt><dd>Menghapus daftar dari perangkat ini. Aplikasi akan bertanya dulu.</dd></div>
    </dl>
    <h3 class="gd-h3">Di dalam sebuah daftar</h3>
    <ul class="gd-list">
      <li><b>Tabel</b> dan <b>Kelompok Kelas</b>: dua cara melihat daftar yang sama. Tabel adalah daftar biasa, sedangkan Kelompok Kelas mengelompokkan nama menurut kelas, jurusan, dan rombel.</li>
      <li><b>Filter &amp; urutan</b>: untuk menampilkan hanya siswa tertentu, misalnya satu kelas saja, atau mengetik sebagian nama. Ketuk ${k('Reset filter')} untuk menampilkan semua lagi.</li>
      <li>${k('Tambah / edit')}: untuk menambah siswa atau memperbaiki catatan yang sudah ada.</li>
      <li>${k('Pilih (edit massal)')}: untuk memilih banyak siswa sekaligus lalu memindahkan, mengubah kelas, mengurutkan, mengunci, atau menghapusnya dalam sekali ketuk.</li>
    </ul>
    <div class="gd-callout gd-tip" role="note"><b>Kenapa catatan tidak bisa diubah atau dihapus?</b>
      <p>Hampir pasti karena <b>terkunci</b> (ada ikon 🔒). Ketuk ikon itu, atau tombol ${k('Buka kunci')}, lalu coba lagi. Kunci ada agar data penting tidak berubah karena salah ketuk.</p></div>
  `)}

  ${gSec('g-gambar', 'Menyimpan hasil sebagai gambar atau PDF', `
    <p>Bagian ini berguna bila Anda ingin <b>mencetak</b> daftar, atau mengirimnya dalam bentuk yang bisa dibuka siapa saja tanpa aplikasi ini.</p>
    <ol class="gd-steps">
      ${gStep(`Buka daftar lewat ${k('Melihat Data')} lalu ${k('Buka')}.`)}
      ${gStep(`Ketuk ${k('Gambar / PDF…')}. Untuk daftar yang dikelompokkan per kelas, bisa juga langsung ketuk ${k('Ekspor Matriks Kelas')}.`)}
      ${gStep(`Pilih <b>Jenis</b>: <b>Tabel standar</b> (daftar berurutan dari atas ke bawah) atau <b>Matriks Kelas</b> (nama-nama dikelompokkan per kelas, jurusan, dan rombel).`)}
      ${gStep(`Pilih <b>Format berkas</b>: <b>PDF</b> bagus untuk dicetak, <b>PNG</b> menghasilkan gambar paling tajam, dan <b>JPG</b> menghasilkan gambar dengan ukuran file lebih kecil.`)}
      ${gStep(`Lihat pratinjau di layar. Bila sudah sesuai, ketuk ${k('Buat file')} dan tunggu sampai selesai.`)}
      ${gStep(`Ketuk ${k('Unduh')} untuk satu file, atau ${k('Unduh semua (ZIP)')} bila ada banyak file, atau ${k('Bagikan…')} untuk mengirimnya lewat aplikasi lain.`)}
    </ol>
    <div class="gd-callout gd-tip" role="note"><b>Ke mana file yang diunduh?</b>
      <p>Biasanya masuk ke folder <b>Unduhan</b> (<i>Downloads</i>). Di HP, buka aplikasi <b>File</b> atau <b>Files</b>, lalu cari folder itu. Di komputer, buka folder <i>Downloads</i>.</p>
      <p><b>ZIP</b> adalah satu file yang membungkus banyak file. Untuk membukanya, ketuk file ZIP lalu pilih <i>Ekstrak</i>, atau di komputer klik dua kali.</p></div>
  `)}

  ${gSec('g-cadangan', 'Cadangan dan pindah perangkat', `
    <p>Bagian ini yang paling sering membingungkan, jadi kita bahas pelan-pelan. Semua ada di menu ${k('Ekspor/Impor Data')} di beranda. Menu itu punya <b>empat kotak</b> dengan fungsi berbeda:</p>
    <div class="gd-opts">
      <div class="gd-opt"><span class="gd-n">1</span><div><b>Ekspor sebagian</b><p>Mengirim <b>satu atau beberapa</b> daftar tertentu ke orang lain.</p><p class="gd-when">Dipakai saat: ingin memberikan sebagian data kepada rekan.</p></div></div>
      <div class="gd-opt gd-main"><span class="gd-n">2</span><div><b>Cadangan penuh</b><p>Menyalin <b>seluruh isi aplikasi</b> menjadi satu file: semua daftar, catatan, riwayat, dan pengaturan.</p><p class="gd-when">Dipakai saat: rutin (misalnya seminggu sekali), atau sebelum ganti HP.</p></div></div>
      <div class="gd-opt"><span class="gd-n">3</span><div><b>Gabungkan berkas ke data saat ini</b><p><b>Menambahkan</b> isi sebuah file ke data Anda tanpa menghapus apa pun. Data yang terkunci tidak pernah ditimpa. Anda diperlihatkan ringkasannya dulu sebelum menyetujui.</p><p class="gd-when">Dipakai saat: menerima file dari rekan dan ingin memasukkannya.</p></div></div>
      <div class="gd-opt gd-danger"><span class="gd-n">4</span><div><b>Pulihkan cadangan penuh</b><p><b>Mengganti seluruh data</b> di perangkat ini dengan isi file cadangan. Aplikasi akan meminta persetujuan dan menawarkan menyimpan data yang ada sekarang terlebih dulu.</p><p class="gd-when">Dipakai saat: HP baru atau data hilang. Gunakan dengan hati-hati.</p></div></div>
    </div>
    <h3 class="gd-h3">Cara membuat cadangan</h3>
    <ol class="gd-steps">
      ${gStep(`Di beranda, ketuk ${k('Ekspor/Impor Data')}.`)}
      ${gStep(`Pada kotak <b>2. Cadangan penuh</b>, ketuk ${k('Unduh cadangan penuh')}.`)}
      ${gStep(`File bernama seperti <b>cadangan-penuh-keterlambatan_…json</b> masuk ke folder Unduhan.`)}
      ${gStep(`<b>Pindahkan file itu ke tempat lain</b> yang aman: kirim ke diri sendiri lewat WhatsApp atau email, unggah ke Google Drive, atau salin ke flashdisk. Cadangan yang hanya ada di HP yang sama tidak menolong bila HP itu rusak.`)}
    </ol>
    <p class="gd-small">Di kotak itu aplikasi juga memberi tahu kapan terakhir kali Anda mengunduh cadangan, dan apakah ada perubahan sesudahnya.</p>
    <h3 class="gd-h3">Cara pindah ke HP atau komputer baru</h3>
    <ol class="gd-steps">
      ${gStep(`Di perangkat <b>lama</b>, buat cadangan penuh seperti di atas.`)}
      ${gStep(`Kirim file cadangannya ke perangkat <b>baru</b> (WhatsApp, email, Google Drive, atau flashdisk) dan simpan di sana.`)}
      ${gStep(`Di perangkat baru, buka aplikasi ini, lalu ${k('Ekspor/Impor Data')}.`)}
      ${gStep(`Pada kotak <b>4. Pulihkan cadangan penuh</b>, ketuk <b>Pilih berkas</b> dan pilih file cadangan tadi.`)}
      ${gStep(`Baca kotak konfirmasi, lalu ketuk ${k('Ganti semua data')}. Selesai.`)}
    </ol>
    <h3 class="gd-h3">Soal tombol Bagikan</h3>
    <p>Saat Anda mengetuk ${k('Bagikan')}, aplikasi memunculkan menu berbagi bawaan HP (WhatsApp dan sebagainya). Bila perangkat Anda tidak mendukungnya, file diunduh dan WhatsApp terbuka dengan pesan tertulis. Dalam kasus itu, <b>lampirkan sendiri file yang baru diunduh</b> ke chat, karena WhatsApp tidak bisa menerima lampiran otomatis dari aplikasi ini.</p>
    <div class="gd-callout gd-warn" role="note"><b>Jaga file ini baik-baik</b>
      <p>Isi file adalah daftar nama siswa. Kirim hanya kepada orang yang berhak, dan ingat bahwa penerima bisa menyalin atau meneruskannya.</p></div>
  `)}

  ${gSec('g-riwayat', 'Mengembalikan data yang terhapus', `
    <p>Terhapus tanpa sengaja? Biasanya masih bisa dikembalikan, karena aplikasi mencatat setiap perubahan di <b>riwayat</b>.</p>
    <ol class="gd-steps">
      ${gStep(`Di beranda, ketuk ${k('Melihat Data')}, lalu ${k('Riwayat &amp; pemulihan')}. Untuk melihat riwayat satu daftar saja, buka daftar itu lalu ketuk ${k('Riwayat')}.`)}
      ${gStep(`Cari baris yang berlabel <b>Dihapus</b>. Setiap baris menunjukkan apa yang berubah dan kapan.`)}
      ${gStep(`Ketuk ${k('Pulihkan catatan')} (atau ${k('Pulihkan kumpulan data')}), lalu konfirmasi.`)}
    </ol>
    <div class="gd-callout gd-warn" role="note"><b>Riwayat bukan pengganti cadangan</b>
      <p>Riwayat tersimpan di perangkat yang sama dengan datanya. Bila data browser dibersihkan, riwayat ikut hilang. Tetaplah membuat cadangan secara rutin.</p></div>
  `)}

  ${gSec('g-pasang', 'Memasang aplikasi dan memakainya tanpa internet', `
    <p>Aplikasi ini bisa <b>dipasang</b> di HP atau komputer, sehingga ikonnya muncul di layar utama seperti aplikasi biasa dan terbuka dalam layar penuh. Setelah dipasang, aplikasi tetap bisa dipakai <b>tanpa internet</b>.</p>
    <ol class="gd-steps">
      ${gStep(`Buka aplikasi ini <b>sekali</b> saat HP tersambung internet, supaya semua bagiannya tersimpan di perangkat.`)}
      ${gStep(`Pasang lewat menu browser. Langkahnya berbeda untuk Android dan iPhone. Ketuk tombol di bawah untuk melihat langkah yang sesuai.`)}
    </ol>
    <p><button type="button" class="btn pri" data-act="help">Lihat cara memasang</button></p>
    <p class="gd-small">Tombol <b>?</b> di pojok kanan atas layar juga membuka petunjuk yang sama. Tombol <b>◐</b> di sebelahnya mengganti tampilan antara terang dan gelap.</p>
  `)}

  ${gSec('g-tanya', 'Pertanyaan yang sering muncul', `
    <div class="gd-faq">
      <details><summary>Apakah harus terhubung ke internet?</summary><p>Hanya saat pertama kali membuka atau memasang aplikasi. Setelah itu, aplikasi bisa dipakai tanpa internet.</p></details>
      <details><summary>Datanya disimpan di mana?</summary><p>Di browser pada perangkat yang Anda pakai sekarang. Data tidak dikirim ke internet. Konsekuensinya, HP atau komputer lain tidak otomatis punya data yang sama. Untuk memindahkannya, gunakan cadangan (bagian 6).</p></details>
      <details><summary>Data saya hilang setelah membersihkan browser. Kenapa?</summary><p>Menghapus &ldquo;data situs&rdquo; atau &ldquo;data penjelajahan&rdquo; di browser juga menghapus catatan aplikasi ini. Jika itu terjadi, pulihkan dari file cadangan. Karena itulah cadangan rutin sangat dianjurkan.</p></details>
      <details><summary>Tulisan di pojok atas berubah menjadi &ldquo;Gagal menyimpan&rdquo; atau &ldquo;Perlu perhatian&rdquo;</summary><p>Ketuk tulisan itu untuk mencoba menyimpan ulang. Bila masih gagal, ruang penyimpanan perangkat mungkin penuh. Unduh cadangan penuh sebagai pengaman, lalu kosongkan ruang dengan menghapus foto atau file lain yang tidak dipakai. Catatan yang sudah tersimpan tidak dihapus oleh aplikasi.</p></details>
      <details><summary>Muncul pesan &ldquo;Versi baru aplikasi sudah terpasang&rdquo;</summary><p>Itu kabar baik. Ketuk ${k('Muat ulang')} untuk memakai versi terbaru. Data Anda tidak dihapus.</p></details>
      <details><summary>Bolehkah dipakai oleh beberapa guru atau di beberapa HP?</summary><p>Boleh. Namun setiap perangkat punya data sendiri-sendiri. Untuk menyatukannya, pakai <b>Ekspor sebagian</b> di perangkat pengirim, lalu <b>Gabungkan berkas</b> di perangkat penerima (bagian 6).</p></details>
      <details><summary>Apakah data siswa di sini aman?</summary><p>Data tidak dikirim ke server mana pun, tetapi juga <b>tidak dienkripsi</b>. Siapa pun yang memegang perangkat yang sedang terbuka, atau memegang file cadangan, dapat membaca isinya. Jaga perangkat Anda, dan kirim file hanya kepada orang yang berhak. Ingat, kunci 🔒 bukan kata sandi.</p></details>
      <details><summary>Kalau ragu saat menekan tombol, bagaimana?</summary><p>Hampir semua tindakan yang berisiko (menghapus, mengganti seluruh data) selalu meminta konfirmasi dulu. Baca pesannya, dan ketuk <b>Batal</b> bila belum yakin. Tidak ada yang berubah sampai Anda menyetujui.</p></details>
    </div>
  `)}

  <section class="gd-end" aria-label="Mulai">
    <p>Sudah siap? Mulailah dengan mencatat satu siswa. Dari situ, sisanya akan terasa mudah.</p>
    <div class="row"><a class="btn pri grow" href="#/buat">Mulai mencatat</a><a class="btn grow" href="#/">Kembali ke beranda</a></div>
  </section>
  </div>`;
}

// Gulir ke bagian yang dipilih. Tanpa animasi bila pengguna meminta gerakan dikurangi.
acts['gd-go'] = id => {
  const el = document.getElementById(id); if (!el) return;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
};
