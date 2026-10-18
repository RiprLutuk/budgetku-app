# BudgetKu Family

Dashboard keuangan keluarga yang compact, mobile-friendly, dengan format Rupiah, household bersama, dan progres tabungan otomatis.

## Fitur

- Register/login, role owner/member, dan undangan household yang berlaku 7 hari.
- Pemasukan, pengeluaran, kategori, alokasi budget bulanan, dan saldo rollover otomatis antarbulan.
- Goals: saldo awal + total setoran dari transaksi; menghapus setoran otomatis mengoreksi progres.
- Kategori `Target Umroh`, `Target Mobil`, dan `Target Rumah` memilih goal yang sesuai. Alokasi goal dapat diubah pada form transaksi.
- Setoran mengurangi sisa cashflow satu kali; saldo awal tidak menciptakan pengeluaran baru.
- Saldo tersedia bulan aktif = saldo bulan-bulan sebelumnya + arus kas bulan aktif; goals tetap kumulatif sampai tercapai.
- Auto Budget adalah rencana, bukan bukti transfer. Catat uang yang benar-benar disisihkan melalui tombol **Tabung**.
- Invite pasangan, sinkronisasi antarperangkat, OCR nota di browser, dan impor kandidat Gmail opsional.
- PWA dengan aset aplikasi offline; data finansial tetap membutuhkan koneksi server.
- Menu dan bulan terpilih tetap tersimpan saat reload atau membuka ulang PWA; tombol back/forward mengikuti riwayat menu.
- Tarik ke bawah dari bagian teratas halaman untuk memperbarui data tanpa berpindah menu, atau gunakan ikon refresh. Refresh tidak menghapus form yang belum disimpan.
- Desain finansial terintegrasi: IBM Plex Sans + IBM Plex Mono, hierarki saldo cockpit, dan ringkasan cashflow interaktif.

## Runtime

- Production: Cloudflare Worker (`api/index.js`) + D1 + Static Assets (`public/`).
- Development Worker: Wrangler dengan D1 lokal yang terpisah dari database pribadi.
- Runtime lokal mandiri: `server.js` + SQLite di `data/budgetku.sqlite`, tetap tersedia untuk data yang sudah ada.
- Worker menyinkronkan household dengan polling setiap 8 detik saat tab aktif. Runtime Node lokal juga mendukung SSE.

## Development Worker

Gunakan Node.js 22 atau lebih baru:

```bash
npm ci
npm run db:migrate:local
npm run dev
```

Buka `http://localhost:8787`. State emulator berada di `.wrangler/` dan tidak masuk Git.

Untuk konfigurasi Gmail lokal, salin `.dev.vars.example` ke `.dev.vars` dan isi nilai milik sendiri. Jangan commit file berisi secret.

## Data Lokal Yang Sudah Ada

```bash
npm start
```

Runtime mandiri berjalan di `http://localhost:3000` dan memakai `.env` serta `data/`. Tidak membutuhkan dependency npm untuk server Node native.

Migrasi `goal_id` dijalankan otomatis pada database lokal lama. Hanya transaksi dengan kategori persis `Target <nama goal>` yang disambungkan; biaya `Kontrakan / Rumah` tidak dianggap tabungan rumah. Saldo manual lama dipertahankan sebagai saldo awal.

Data SQLite lokal, D1 emulator, dan D1 production adalah tiga database berbeda. Deploy tidak mengunggah akun, transaksi, nota, atau konfigurasi lokal. Untuk memindahkan data pribadi ke production, lakukan migrasi terpisah langsung ke D1; jangan pernah menaruh dump data di Git.

## Deploy Cloudflare

Worker dan binding D1 `DB` dikonfigurasi di `wrangler.jsonc`. Untuk akun berbeda, buat database sendiri dan ganti `database_id`:

```bash
npx wrangler login
npx wrangler d1 create budgetku
npm run db:migrate:remote
npm run deploy
```

Migrasi pada `migrations/` berisi skema dan pembaruan preset bawaan, tanpa dump data pengguna. Aset deploy dibatasi ke `public/`; `data/` dan `.env` tidak menjadi aset publik.

```bash
npm run check
npm run deploy:check
```

### Auto Deploy Dari GitHub

`.github/workflows/deploy.yml` menjalankan validasi dan deploy otomatis setiap push ke
`main` atau saat dijalankan manual dari tab **Actions**. Tambahkan dua repository
secrets di GitHub sebelum mengaktifkannya:

- `CLOUDFLARE_API_TOKEN`: API token Cloudflare untuk deploy Workers dan akses D1.
- `CLOUDFLARE_ACCOUNT_ID`: Account ID Cloudflare yang memiliki Worker `budgetku`.

Jangan menaruh token di repository, `.env`, atau `wrangler.jsonc`. Workflow hanya
mengirim aset dari `public/` dan kode Worker; database lokal tetap dikecualikan.

Endpoint `/health` mengembalikan status Worker. `/api/*` dan `/auth/*` selalu diproses Worker, bukan fallback HTML. Database diakses melalui binding per-request, tanpa koneksi global atau file SQLite di Worker.

## Preset Auto Budget

Preset keluarga mengalokasikan total 100% dari pemasukan bulan terpilih, bukan saldo bawaan atau batas bulanan household. Jika belum ada pemasukan, nominal alokasi masih nol sampai pemasukan dicatat. Nominal mengikuti pemasukan tersebut, bukan batas rupiah tetap; persentase dapat diubah melalui **Ubah alokasi budget**.

Dengan contoh basis Rp15.000.000 per bulan:

- Makan Harian: 33% = Rp4.950.000, terpisah dari kopi.
- Kopi & Jajan Kerja: 3% = Rp450.000, dibanding asumsi kopi Rp20.000 x 22 hari kerja = Rp440.000.
- Transport & Parkir: 5% = Rp750.000, dibanding asumsi transport Rp400.000 + parkir Rp6.000-15.000 x 22 hari kerja = Rp532.000-730.000. Sabtu-Minggu tidak dihitung sebagai hari parkir kerja.

Target makan sekitar Rp4-5 juta adalah batas pengeluaran yang perlu diusahakan, bukan estimasi bahwa pola belanja sekarang sudah cukup. Untuk keluarga tiga orang, asumsi 30 hari dengan sarapan Rp50.000-80.000, makan siang istri dan anak Rp30.000, makan siang kantor Rp30.000 x 22 hari kerja, serta makan malam Rp100.000-150.000 menghasilkan Rp6.060.000-8.460.000, belum termasuk makan siang suami saat akhir pekan. Target lebih rendah membutuhkan penyesuaian pola makan, terutama sarapan dan makan malam.

Migrasi `0004` hanya memperbarui household yang seluruh 12 posnya masih persis preset lama, termasuk persentase dan urutannya. Budget kustom tidak ditimpa, termasuk kategori kopi yang sudah dibuat sendiri. ID kategori lama, transaksi, saldo, dan goals tidak diubah. Runtime SQLite menjalankan revisi ini satu kali saat startup; D1 menjalankannya lewat perintah migrasi saat deploy.

## Kolaborasi

1. Daftar melalui URL aplikasi production.
2. Buka **Family** dan buat invite link sebagai owner.
3. Pasangan membuka link lalu daftar/login.
4. Setelah bergabung, keduanya memakai household yang sama dan melihat perubahan otomatis.

Jangan membagikan `localhost` ke perangkat lain. Untuk runtime mandiri dalam satu Wi-Fi, gunakan IP mesin server. Production menggunakan URL HTTPS Worker.

## Nota Dan Gmail

Nota Worker disimpan privat di D1, maksimum **1 MB per gambar**, dan hanya dapat dibaca member household. Gunakan gambar yang dikompres; pantau ukuran database. OCR berjalan di browser dan hasilnya wajib direview sebelum disimpan. Runtime Node menyimpan gambar pada `data/receipts/`.

Gmail tidak aktif sampai Google OAuth dikonfigurasi. Login sebagai superadmin lalu buka **Settings -> Integrasi Google** untuk mengisi Client ID, Client Secret, dan redirect URI. Konfigurasi bisa dibaca (tanpa mengembalikan secret), diperbarui, dan dihapus dari dashboard kapan pun; tidak perlu mengedit `.env` atau deploy ulang.

Nilai disimpan di `app_settings` pada database server, bukan di aset publik atau repository. Saat konfigurasi berubah, koneksi Gmail lama direset agar setiap member menghubungkan ulang dengan kredensial yang baru. Konfigurasi environment lama tetap dibaca jika belum pernah ada konfigurasi dashboard; menghapus konfigurasi melalui dashboard juga menonaktifkan fallback tersebut.

Tambahkan redirect URI `https://<domain-aplikasi>/auth/google/callback` ke Google Cloud OAuth client bertipe **Web application**. Redirect URI harus memakai origin aplikasi yang sama; HTTP hanya diizinkan pada localhost untuk development. Akses Gmail read-only dan terpisah per user; impor hanya mencatat transaksi setelah review. Kandidat Worker dibatasi 20 pesan per permintaan. Mengimpor referensi email yang sama tidak menggandakan transaksi.

## Privasi Dan Backup

- `.gitignore` mengecualikan `.env`, `.dev.vars`, database SQLite, state Wrangler, nota/data lokal, log, dan build output.
- Hanya template konfigurasi kosong yang masuk repository. Jangan menaruh secret pada `wrangler.jsonc`.
- Password memakai PBKDF2-SHA256 dengan salt dan 100.000 iterasi sesuai batas runtime Cloudflare Workers. Hash baru menyimpan algoritma dan jumlah iterasi; hash lokal lama di-upgrade saat login berhasil. Sesi disimpan di database, dengan cookie HttpOnly, SameSite=Lax, dan Secure di HTTPS.
- API memeriksa membership household untuk pembacaan, setoran goal, dan nota. Pengaturan household dan pembuatan invite hanya untuk owner.
- Ini aplikasi MVP. Evaluasi rate limiting, retensi data, enkripsi token Gmail, monitoring, dan backup sebelum penggunaan finansial skala besar.
- Backup SQLite secara konsisten menggunakan SQLite backup API atau ketika server berhenti; sertakan folder nota. Jangan commit backup.
- D1 production mulai kosong dan terpisah dari data lokal. Gunakan fasilitas backup/export D1 secara privat sesuai kebutuhan akun Cloudflare.
