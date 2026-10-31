/**
 * majors.js — Daftar jurusan (konsentrasi keahlian) per tingkat kelas.
 *
 * CARA EDIT:
 * - "key"     kode internal jurusan (dipakai scheduleData di schedule.js,
 *             JANGAN diubah kecuali kode yang sama juga diubah di sana).
 * - "name"    nama lengkap jurusan, ditampilkan di layar "Pilih Jurusan".
 * - "short"   singkatan, dipakai di judul jadwal & breadcrumb (mis. "AKL 2").
 * - "rombels" daftar nomor rombongan belajar (kelas paralel) di jurusan itu
 *             untuk tingkat tersebut. Jurusan dengan 1 rombel saja otomatis
 *             melewati langkah "Pilih Rombel" (langsung ke Pilih Hari).
 *
 * Menambah/mengubah jurusan di sini SAJA TIDAK cukup — jadwalnya juga harus
 * ditambahkan di schedule.js dengan "key" yang sama persis.
 */

const majorsData = {
    "10": [
        {
            "key": "akl",
            "name": "Akuntansi dan Keuangan Lembaga",
            "short": "AKL",
            "rombels": [
                "1",
                "2",
                "3"
            ]
        },
        {
            "key": "mplb",
            "name": "Manajemen Perkantoran dan Layanan Bisnis",
            "short": "MPLB",
            "rombels": [
                "1",
                "2",
                "3"
            ]
        },
        {
            "key": "br",
            "name": "Pemasaran",
            "short": "PEM",
            "rombels": [
                "1",
                "2"
            ]
        },
        {
            "key": "tjkt",
            "name": "Teknik Jaringan Komputer dan Telekomunikasi",
            "short": "TJKT",
            "rombels": [
                "1",
                "2",
                "3"
            ]
        },
        {
            "key": "ulw",
            "name": "Usaha Layanan Pariwisata",
            "short": "ULP",
            "rombels": [
                "1"
            ]
        },
        {
            "key": "perhotelan",
            "name": "Perhotelan",
            "short": "PHT",
            "rombels": [
                "1"
            ]
        },
        {
            "key": "kuliner",
            "name": "Kuliner",
            "short": "KLN",
            "rombels": [
                "1"
            ]
        }
    ],
    "11": [
        {
            "key": "akl",
            "name": "Akuntansi dan Keuangan Lembaga",
            "short": "AKL",
            "rombels": [
                "1",
                "2",
                "3"
            ]
        },
        {
            "key": "mplb",
            "name": "Manajemen Perkantoran dan Layanan Bisnis",
            "short": "MPLB",
            "rombels": [
                "1",
                "2",
                "3"
            ]
        },
        {
            "key": "br",
            "name": "Bisnis Ritel",
            "short": "BR",
            "rombels": [
                "1",
                "2"
            ]
        },
        {
            "key": "tjkt",
            "name": "Teknik Jaringan Komputer dan Telekomunikasi",
            "short": "TJKT",
            "rombels": [
                "1",
                "2",
                "3"
            ]
        },
        {
            "key": "ulw",
            "name": "Usaha Layanan Wisata",
            "short": "ULW",
            "rombels": [
                "1"
            ]
        },
        {
            "key": "perhotelan",
            "name": "Perhotelan",
            "short": "PHT",
            "rombels": [
                "1"
            ]
        },
        {
            "key": "kuliner",
            "name": "Kuliner",
            "short": "KLN",
            "rombels": [
                "1"
            ]
        }
    ],
    "12": [
        {
            "key": "akl",
            "name": "Akuntansi dan Keuangan Lembaga",
            "short": "AKL",
            "rombels": [
                "1",
                "2"
            ]
        },
        {
            "key": "mplb",
            "name": "Manajemen Perkantoran dan Layanan Bisnis",
            "short": "MPLB",
            "rombels": [
                "1",
                "2",
                "3"
            ]
        },
        {
            "key": "br",
            "name": "Bisnis Ritel",
            "short": "BR",
            "rombels": [
                "1",
                "2"
            ]
        },
        {
            "key": "tjkt",
            "name": "Teknik Jaringan Komputer dan Telekomunikasi",
            "short": "TJKT",
            "rombels": [
                "1",
                "2",
                "3"
            ]
        },
        {
            "key": "ulw",
            "name": "Usaha Layanan Wisata",
            "short": "ULW",
            "rombels": [
                "1"
            ]
        },
        {
            "key": "perhotelan",
            "name": "Perhotelan",
            "short": "PHT",
            "rombels": [
                "1"
            ]
        },
        {
            "key": "kuliner",
            "name": "Kuliner",
            "short": "KLN",
            "rombels": [
                "1"
            ]
        }
    ]
};
