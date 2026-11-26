# Antigravity 3D Agent Office

Kantor 3D bergaya **Cozy Isometric Startup Office** di browser untuk memantau semua **agent dan subagent Antigravity** yang sedang aktif beserta **file yang sedang mereka kerjakan** secara real-time.

## Fitur Utama
- **Pantau Semua Sesi Sekaligus:** Semua conversation Antigravity yang aktif (agent utama + para subagent-nya) dikelompokkan dalam klaster meja tim, lengkap dengan filter per project dan jendela waktu (`30m` / `2j` / `Hari ini`).
- **Pelacakan File Akurat:** Label file aktif melayang di atas meja (`edit`, `write`, `read`), dan klik karakter/meja untuk membuka **Slide-Over Inspector** berisi daftar lengkap file yang disentuh + tombol salin path.
- **Arsitektur Hybrid (Instan + Tahan Banting):** Menggabungkan **Global Lifecycle Hook** Antigravity (instan tanpa jeda) dengan **Incremental Transcript Watcher** (`~/.gemini/antigravity/brain/*/transcript.jsonl`).
- **Gedung Bertingkat Cutaway, Ruangan Kaca, Dekorasi 3D & Panel Lift:** Tambah hingga 8 lantai gedung lewat panel lift di kiri (`+ Tambah Lantai`), pilih **4 tema ruangan 3D per lantai** (`Engineering`, `Lobby`, `Creative`, `Pantry`) lengkap dengan **partisi ruangan kaca, kisi-kisi kayu, karpet koridor, rak server mini, TV dashboard, sofa lounge, coffee bar, & meja kolaborasi**, pindahkan tiap tim antar lantai dari panel Inspector (`Lantai Tim`), dan fokus ke satu lantai tertentu.
- **Subagent Santai Jalan-Jalan & Berinteraksi:** Saat subagent sedang `idle`, ia otomatis berdiri dari kursinya, berjalan santai ke ruang rapat/pantry/lounge, dan bisa bertemu & mengobrol (dengan gelembung `💬`/`☕`/`💡`/`👋`) bersama rekan subagent santai lainnya di lantai yang sama — lalu langsung berjalan cepat kembali ke mejanya begitu mendapat tugas baru.
- **Rename Main Agent & Subagent:** Klik ikon pensil di panel Inspector untuk mengganti nama agent mana saja (tersimpan persisten di `server/data/`).
- **Mode Simulasi Bawaan:** Bisa dicoba kapan saja lewat tombol **Mode Simulasi** di bar atas (default 2 lantai) tanpa harus menunggu subagent sungguhan berjalan.
- **100% Lokal & Aman:** Server hanya berjalan di `127.0.0.1` dan tidak pernah mengirim data ke luar komputer.

---

## Panduan Setup (Langkah demi Langkah)

### 1. Prasyarat
- **Node.js v22+** sudah terpasang di Windows.

### 2. Instal Dependensi
Buka terminal di folder project ini, lalu jalankan:

```powershell
npm install
```

### 3. Pasang Global Hook Antigravity *(Sekali Saja)*
Agar perubahan status (berpikir, mengedit file, menjalankan command, selesai) muncul **seketika tanpa jeda** dan nama project terbaca akurat:

```powershell
npm run setup-hooks
```

**Apa yang dilakukan perintah ini?**
- Menambahkan satu entri bernama `"antigravity-3d-office"` ke `C:\Users\<user>\.gemini\config\hooks.json`.
- Jika `hooks.json` sudah ada sebelumnya, skrip otomatis membuat file backup (`.bak`) dan **tidak mengubah hook lain milikmu**.
- Hook bersifat **fail-open (`<=150ms`)**: jika server 3D Office sedang kamu matikan, Antigravity tetap berjalan normal 100% tanpa hambatan atau error.

### 4. Jalankan Kantor 3D
```powershell
npm run dev
```

Setelah berjalan, buka browser (Chrome / Edge) ke:
- **http://127.0.0.1:5173**

*(Backend telemetry berjalan di `http://127.0.0.1:4174` dan terhubung otomatis via WebSocket.)*

### 5. Mencoba & Menginspeksi
- **Putar / Zoom / Geser:** Drag kiri untuk orbit, scroll untuk zoom, drag kanan untuk geser kamera.
- **Inspeksi File Agent:** Klik karakter, meja, atau label file yang melayang → panel kanan akan terbuka menampilkan daftar file (`EDIT`, `WRITE`, `READ`), relasi induk–subagent (klik nama rekan untuk terbang ke mejanya), dan riwayat aktivitas.
- **Mode Simulasi:** Klik tombol **Mode Simulasi** di pojok kanan atas untuk melihat demo 2 project dengan beberapa agent & subagent bekerja bersamaan.

---

## Cara Melepas Global Hook
Kalau suatu saat ingin melepas integrasi hook dari Antigravity:

```powershell
npm run remove-hooks
```

Perintah ini hanya menghapus entri `"antigravity-3d-office"` dan otomatis menyimpan backup `hooks.json`.

---

## Perintah Pengembangan
- `npm run dev` — Jalankan server telemetry + frontend 3D secara bersamaan.
- `npm test` — Jalankan seluruh test suite (`shared`, `hooks`, `server`, `client`).
- `npm run build` — Build produksi untuk `shared`, `server`, dan `client`.
