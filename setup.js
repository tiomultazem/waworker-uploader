import 'dotenv/config';
import readline from 'readline';
import fs from 'fs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question, defaultValue = '') {
  return new Promise((resolve) => {
    const hint = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${hint}: `, (answer) => {
      resolve(answer.trim() || defaultValue);
    });
  });
}

function line(char = '─', len = 55) {
  console.log(char.repeat(len));
}

async function main() {
  const existing = process.env;

  console.log('\n');
  line('═');
  console.log('  🛠️   WAWorker - Uploader — Setup Wizard');
  line('═');
  console.log('  Jawab setiap pertanyaan, tekan Enter untuk memakai nilai dalam [].');
  console.log('  Hasilnya akan disimpan ke file .env\n');

  // ── Google OAuth ──────────────────────────────────────────
  line();
  console.log('  LANGKAH 1 — Google OAuth Credentials\n');
  console.log('  1. Buka: https://console.cloud.google.com/');
  console.log('  2. Buat Project baru (atau pilih yang ada)');
  console.log('  3. Pergi ke: APIs & Services → Library');
  console.log('     → Aktifkan "Google Drive API"');
  console.log('     → Aktifkan "Google Sheets API"');
  console.log('  4. Pergi ke: APIs & Services → Credentials');
  console.log('     → "+ Create Credentials" → "OAuth client ID"');
  console.log('     → Application type: Web application');
  console.log('     → Authorized redirect URIs: http://localhost:3000/oauth2callback');
  console.log('     → Atur Consent Screen (nama aplikasi, email, scope Drive & Sheets)');
  console.log('     → Salin Client ID dan Client Secret\n');
  console.log('  Ketik "bantuan" untuk menampilkan panduan lengkap.\n');
  
  const rawClientId = await ask('  Client ID', existing.GOOGLE_CLIENT_ID || '');
  let clientId = rawClientId;
  if (rawClientId && rawClientId.trim().toLowerCase() === 'bantuan') {
    showOAuthHelp();
    clientId = await ask('  Client ID', existing.GOOGLE_CLIENT_ID || '');
  }
  const clientSecret = await ask('  Client Secret', existing.GOOGLE_CLIENT_SECRET || '');
  
  function showOAuthHelp() {
    console.log('\n=== Panduan Lengkap Google OAuth ===');
    console.log('1. Buka Google Cloud Console, buat atau pilih project.');
    console.log('2. Buka “APIs & Services → OAuth consent screen”.');
    console.log('   - Pilih External atau Internal sesuai kebutuhan.');
    console.log('   - Isi App name, User support email, Developer contact email.');
    console.log('   - Tambahkan scope: https://www.googleapis.com/auth/drive.file dan https://www.googleapis.com/auth/spreadsheets');
    console.log('   - Simpan dan verifikasi jika diperlukan.');
    console.log('3. Buka “APIs & Services → Library” dan aktifkan Google Drive API serta Google Sheets API.');
    console.log('4. Buka “APIs & Services → Credentials”.');
    console.log('   - Klik “Create Credentials → OAuth client ID”.');
    console.log('   - Pilih Application type: Web application.');
    console.log('   - Tambahkan Authorized redirect URI: http://localhost:3000/oauth2callback');
    console.log('   - Simpan, salin Client ID dan Client Secret.');
    console.log('=== End of Help ===\n');
  }

  // ── Google Drive ──────────────────────────────────────────
  console.log('');
  line();
  console.log('  LANGKAH 2 — Google Drive Folder\n');
  console.log('  1. Buka Google Drive');
  console.log('  2. Buat atau buka folder tujuan upload gambar');
  console.log('  3. Salin ID dari URL:');
  console.log('     drive.google.com/drive/folders/[ ID INI ]\n');

  const driveFolderId = await ask('  Drive Folder ID', existing.DRIVE_FOLDER_ID || '');

  // ── Google Sheets ─────────────────────────────────────────
  console.log('');
  line();
  console.log('  LANGKAH 3 — Google Sheets\n');
  console.log('  1. Buat atau buka Google Spreadsheet tujuan');
  console.log('  2. Pastikan sudah ada tab/sheet bernama "Data"');
  console.log('     (atau sesuai nama yang kamu pilih)');
  console.log('  3. Salin ID dari URL:');
  console.log('     docs.google.com/spreadsheets/d/[ ID INI ]/edit\n');

  const spreadsheetId = await ask('  Spreadsheet ID', existing.SPREADSHEET_ID || '');
  const sheetName = await ask('  Nama Sheet/Tab', existing.SHEET_NAME || 'Data');

  // ── WhatsApp Group ────────────────────────────────────────
  console.log('');
  line();
  console.log('  LANGKAH 4 — WhatsApp Group ID\n');
  console.log('  Cara mendapatkan Group ID:');
  console.log('  1. Lewati langkah ini dulu (kosongkan)');
  console.log('  2. Jalankan: node index.js');
  console.log('  3. Scan QR → kirim pesan sembarang ke grup target');
  console.log('  4. Lihat log terminal → salin ID grup');
  console.log('  5. Jalankan setup lagi atau edit .env manual\n');

  const targetGroupId = await ask('  Target Group ID (boleh kosong dulu)', existing.TARGET_GROUP_ID || '');

  // ── Tulis .env ────────────────────────────────────────────
  console.log('');
  line();

  const envContent = `# Google OAuth Credentials
GOOGLE_CLIENT_ID=${clientId}
GOOGLE_CLIENT_SECRET=${clientSecret}

# Google Drive
DRIVE_FOLDER_ID=${driveFolderId}

# Google Sheets
SPREADSHEET_ID=${spreadsheetId}
SHEET_NAME=${sheetName}

# WhatsApp
TARGET_GROUP_ID=${targetGroupId}
`;

  fs.writeFileSync('.env', envContent);

  console.log('\n  ✅ File .env berhasil dibuat!\n');
  console.log('  Selanjutnya:\n');
  console.log('    node index.js\n');
  line('═');
  console.log('');

  rl.close();
}

main().catch((err) => {
  console.error('Error:', err.message);
  rl.close();
  process.exit(1);
});
