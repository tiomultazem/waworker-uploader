# WAWorker - Uploader

Gambar dan pesan yang kamu kirim ke grup wa akan secara otomatis diupload ke **Google Drive** dan dicatat ke **Google Spreadsheets**.

## Cara Kerja

```
WhatsApp Group
    │ (gambar + caption)
    ▼
Baileys (Node.js)
    ├── Upload gambar → Google Drive (milikmu)
    └── Append caption → Google Sheets (milikmu)
```

## Setup

### 1. Clone & Install

```bash
git clone https://github.com/tiomultazem/waworker-uploader
cd waworker-uploader
npm install
```

### 2. Jalankan

Jika `.env` belum ada, aplikasi akan meminta kamu mengisi konfigurasi (Google OAuth, Drive Folder ID, Spreadsheet ID, WhatsApp Group ID) lewat wizard di terminal. Ketik `bantuan` pada langkah OAuth untuk panduan lengkap.

Klik 2× file **r.bat**, atau:

```bash
node src/index.js
```

**Pertama kali:**
1. Browser terbuka otomatis → login Google → izinkan akses Drive & Sheets
2. Scan QR Code WhatsApp di terminal

**Selanjutnya:** session tersimpan, langsung terhubung tanpa langkah tambahan.

## Fitur Utama

- **Auto‑hide ke system‑tray**: terminal muncul sesaat lalu otomatis tersembunyi. Klik ikon tray → **Show Terminal** / **Quit**.
- **Tombol close (×) dinonaktifkan**: mencegah penutupan tidak sengaja. Minimize → otomatis kembali ke tray.
- **Single‑instance**: instance lama otomatis dimatikan saat menjalankan instance baru.
- **Auto‑create `.env`**: jika `.env` belum ada, wizard konfigurasi muncul otomatis di terminal.
- **Web dashboard**: berjalan di `http://localhost:3000`. Pengaturan diubah lewat tab Pengaturan → klik **Simpan & Restart**.
- **Bantuan OAuth**: tersedia di menu tray → **Bantuan OAuth** (popup step‑by‑step).
- **Integrasi Google**: upload ke Drive dan pencatatan ke Sheets via OAuth.

## Struktur Proyek

- `src/index.js` – entry point utama.
- `src/tray.js` – system tray (systray2), auto‑hide, disable close button, monitor minimize, bantuan OAuth.
- `src/pid.js` – PID management, single‑instance enforcement.
- `src/shutdown.js` – graceful shutdown, cleanup tray & PID.
- `src/webServer.js` – web server & dashboard API.
- `src/whatsapp/` – client WhatsApp (Baileys).
- `src/processor/` – pemrosesan pesan & upload.
- `r.bat` – wrapper Windows (`conhost` → `node src/index.js`).
- `.env` – kredensial & konfigurasi.

## Struktur Spreadsheet

| A (Timestamp) | B (Pesan/Caption) | C (Nama File) | D (Link Google Drive) |
|---|---|---|---|
| 16/8/2026, 10.30 | Dokumentasi rumah 123 | img-2026-08-16T02-30-00-000Z.jpg | https://drive.google.com/file/d/... |

## Catatan

- Token Google disimpan di `auth/token.json` (diabaikan Git, hanya di PC kamu)
- Session WhatsApp disimpan di `auth/baileys/` (diabaikan Git, hanya di PC kamu)
- Gambar diunduh sementara ke `tmp/` lalu **otomatis dihapus** setelah upload selesai
- Pastikan Node.js 18+ terpasang
