# BudgetKu Family

Dashboard keuangan keluarga yang compact, mobile-friendly, dengan format Rupiah, household bersama, dan progres tabungan otomatis.

## Fitur

- Register/login, role owner/member, dan undangan household yang berlaku 7 hari.
- Pemasukan, pengeluaran, kategori, dan alokasi budget bulanan.
- Goals: saldo awal + total setoran dari transaksi; menghapus setoran otomatis mengoreksi progres.
- Kategori `Target Umroh`, `Target Mobil`, dan `Target Rumah` memilih goal yang sesuai. Alokasi goal dapat diubah pada form transaksi.
- Setoran mengurangi sisa cashflow satu kali; saldo awal tidak menciptakan pengeluaran baru.
- Auto Budget adalah rencana, bukan bukti transfer. Catat uang yang benar-benar disisihkan melalui tombol **Tabung**.
- Invite pasangan, sinkronisasi antarperangkat, OCR nota di browser, dan impor kandidat Gmail opsional.
- PWA dengan aset aplikasi offline; data finansial tetap membutuhkan koneksi server.

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

Migrasi pada `migrations/` hanya berisi skema, tanpa data pengguna. Aset deploy dibatasi ke `public/`; `data/` dan `.env` tidak menjadi aset publik.

```bash
npm run check
npm run deploy:check
```

Endpoint `/health` mengembalikan status Worker. `/api/*` dan `/auth/*` selalu diproses Worker, bukan fallback HTML. Database diakses melalui binding per-request, tanpa koneksi global atau file SQLite di Worker.

## Kolaborasi

1. Daftar melalui URL aplikasi production.
2. Buka **Family** dan buat invite link sebagai owner.
3. Pasangan membuka link lalu daftar/login.
4. Setelah bergabung, keduanya memakai household yang sama dan melihat perubahan otomatis.

Jangan membagikan `localhost` ke perangkat lain. Untuk runtime mandiri dalam satu Wi-Fi, gunakan IP mesin server. Production menggunakan URL HTTPS Worker.

## Nota Dan Gmail

Nota Worker disimpan privat di D1, maksimum **1 MB per gambar**, dan hanya dapat dibaca member household. Gunakan gambar yang dikompres; pantau ukuran database. OCR berjalan di browser dan hasilnya wajib direview sebelum disimpan. Runtime Node menyimpan gambar pada `data/receipts/`.

Gmail tidak aktif sampai Google OAuth dikonfigurasi. Simpan nilai melalui Worker secrets:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put GOOGLE_REDIRECT_URI
```

Tambahkan redirect URI `https://<domain-aplikasi>/auth/google/callback` ke Google Cloud OAuth client. Akses Gmail read-only dan terpisah per user; impor hanya mencatat transaksi setelah review. Kandidat dibatasi 20 pesan per permintaan. Mengimpor referensi email yang sama tidak menggandakan transaksi.

## Privasi Dan Backup

- `.gitignore` mengecualikan `.env`, `.dev.vars`, database SQLite, state Wrangler, nota/data lokal, log, dan build output.
- Hanya template konfigurasi kosong yang masuk repository. Jangan menaruh secret pada `wrangler.jsonc`.
- Password memakai PBKDF2-SHA256 dengan salt; sesi disimpan di database, dengan cookie HttpOnly, SameSite=Lax, dan Secure di HTTPS.
- API memeriksa membership household untuk pembacaan, setoran goal, dan nota. Pengaturan household dan pembuatan invite hanya untuk owner.
- Ini aplikasi MVP. Evaluasi rate limiting, retensi data, enkripsi token Gmail, monitoring, dan backup sebelum penggunaan finansial skala besar.
- Backup SQLite secara konsisten menggunakan SQLite backup API atau ketika server berhenti; sertakan folder nota. Jangan commit backup.
- D1 production mulai kosong dan terpisah dari data lokal. Gunakan fasilitas backup/export D1 secara privat sesuai kebutuhan akun Cloudflare.
