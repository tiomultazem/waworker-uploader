import { spawn, spawnSync } from 'child_process';
import SysTrayPkg from 'systray2';
import fs from 'fs';
import path from 'path';

const SysTray = SysTrayPkg.default || SysTrayPkg;

let systray = null;
let monitorProcess = null;
let consoleVisible = true;

// ── PowerShell helper ────────────────────────────────────────────────
const runPowerShell = (command) => {
    try {
        spawnSync('powershell', ['-NoProfile', '-Command', command]);
    } catch (e) {
        console.error('[SYSTEM] Gagal menjalankan perintah PowerShell:', e.message);
    }
};

const hideConsole = () => {
    runPowerShell(`
        Add-Type -Name Win -Namespace Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();';
        [Win32.Win]::ShowWindow([Win32.Win]::GetConsoleWindow(), 0)
    `);
};

const showConsole = () => {
    runPowerShell(`
        Add-Type -Name Win -Namespace Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();';
        $hwnd = [Win32.Win]::GetConsoleWindow();
        [Win32.Win]::ShowWindow($hwnd, 5);
        [Win32.Win]::SetForegroundWindow($hwnd)
    `);
};

const disableCloseButton = () => {
    runPowerShell(`
        Add-Type -Name Win -Namespace Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool EnableMenuItem(IntPtr hMenu, uint uIDEnableItem, uint uEnable); [DllImport("user32.dll")] public static extern IntPtr GetSystemMenu(IntPtr hWnd, bool bRevert); [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();';
        [Win32.Win]::EnableMenuItem([Win32.Win]::GetSystemMenu([Win32.Win]::GetConsoleWindow(), $false), 0xF060, 1)
    `);
};

const enableCloseButton = () => {
    runPowerShell(`
        Add-Type -Name Win -Namespace Win32 -MemberDefinition '[DllImport("user32.dll")] public static extern bool EnableMenuItem(IntPtr hMenu, uint uIDEnableItem, uint uEnable); [DllImport("user32.dll")] public static extern IntPtr GetSystemMenu(IntPtr hWnd, bool bRevert); [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();';
        [Win32.Win]::EnableMenuItem([Win32.Win]::GetSystemMenu([Win32.Win]::GetConsoleWindow(), $false), 0xF060, 0)
    `);
};

// ── Menu items ───────────────────────────────────────────────────────
const menuService = {
    title: 'waworker-uploader online on 3000',
    tooltip: 'WAWorker Uploader Service (Node.js)',
    checked: false,
    enabled: false
};

const menuShowHide = {
    title: 'Hide Terminal',
    tooltip: 'Tampilkan/Sembunyikan jendela console',
    checked: false,
    enabled: true,
    click: () => {
        if (consoleVisible) {
            hideConsole();
            consoleVisible = false;
            menuShowHide.title = 'Show Terminal';
        } else {
            showConsole();
            consoleVisible = true;
            menuShowHide.title = 'Hide Terminal';
        }
        systray.sendAction({
            type: 'update-item',
            item: menuShowHide
        });
    }
};

const menuQuit = {
    title: 'Quit',
    tooltip: 'Keluar dan hentikan seluruh layanan',
    checked: false,
    enabled: true,
    click: () => {
        cleanupTray();
        process.exit(0);
    }
};

// ── Minimize monitor ─────────────────────────────────────────────────
function startMinimizeMonitor() {
    const monitorScript = `
        Add-Type -Name Win -Namespace Win32 -MemberDefinition '
            [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr hWnd);
            [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
            [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow();
        ';
        $hwnd = [Win32.Win]::GetConsoleWindow();
        $lastVisible = -1;
        while ($true) {
            if ([Win32.Win]::IsIconic($hwnd)) {
                [Win32.Win]::ShowWindow($hwnd, 0);
            }
            $visible = [Win32.Win]::IsWindowVisible($hwnd);
            if ($visible -ne $lastVisible) {
                $lastVisible = $visible;
                if ($visible) {
                    [System.Console]::WriteLine("VISIBLE");
                } else {
                    [System.Console]::WriteLine("HIDDEN");
                }
            }
            Start-Sleep -Milliseconds 250;
        }
    `;
    monitorProcess = spawn('powershell', ['-NoProfile', '-Command', monitorScript]);

    monitorProcess.stdout.on('data', (data) => {
        const output = data.toString().trim();
        if (output.includes('VISIBLE')) {
            consoleVisible = true;
            if (menuShowHide.title !== 'Hide Terminal') {
                menuShowHide.title = 'Hide Terminal';
                systray.sendAction({ type: 'update-item', item: menuShowHide });
            }
        } else if (output.includes('HIDDEN')) {
            consoleVisible = false;
            if (menuShowHide.title !== 'Show Terminal') {
                menuShowHide.title = 'Show Terminal';
                systray.sendAction({ type: 'update-item', item: menuShowHide });
            }
        }
    });
}

// ── OAuth Help ───────────────────────────────────────────────────────
const menuHelp = {
    title: 'Bantuan OAuth',
    tooltip: 'Panduan step‑by‑step Google OAuth',
    checked: false,
    enabled: true,
    click: () => {
        showOAuthHelp();
    }
};

function showOAuthHelp() {
    const msg = `=== Panduan Lengkap Google OAuth ===

1. Buka Google Cloud Console, buat atau pilih project.
2. Buka “APIs & Services → OAuth consent screen”.
   - Pilih External atau Internal.
   - Isi App name, email support, email developer.
   - Tambahkan scope:
     https://www.googleapis.com/auth/drive.file
     https://www.googleapis.com/auth/spreadsheets
   - Simpan dan verifikasi bila diperlukan.
3. Buka “APIs & Services → Library”.
   - Aktifkan Google Drive API dan Google Sheets API.
4. Buka “APIs & Services → Credentials”.
   - Klik “Create Credentials → OAuth client ID”.
   - Pilih Application type: Web application.
   - Tambahkan Authorized redirect URI: http://localhost:3000/oauth2callback
   - Simpan, salin Client ID dan Client Secret.

Salin nilai‑nilai tersebut ke .env atau ikuti wizard setup.
=== End of Help ===`;
    // Use PowerShell to show a message box
    const ps = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show(@"
${msg}
"@, 'Bantuan OAuth', 'OK', 'Information')`;
    runPowerShell(ps);
}

// ── Public API ────────────────────────────────────────────────────────
export async function startSystray() {
    if (process.platform !== 'win32') return;

    // 0. Jika .env tidak ada, buat via prompt sederhana
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
        console.log('[SYSTEM] .env tidak ditemukan, memulai wizard konfigurasi cepat.');
        const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
        const ask = (q, d = '') => new Promise(res => rl.question(`${q}${d ? ` [${d}]` : ''}: `, a => res(a.trim() || d)));
        const clientId = await ask('Google Client ID');
        const clientSecret = await ask('Google Client Secret');
        const driveFolderId = await ask('Drive Folder ID');
        const spreadsheetId = await ask('Spreadsheet ID');
        const sheetName = await ask('Sheet Name', 'Data');
        const targetGroupId = await ask('WhatsApp Target Group ID (opsional)', '');
        const envContent = `# Google OAuth Credentials
GOOGLE_CLIENT_ID=${clientId}
GOOGLE_CLIENT_SECRET=${clientSecret}

# Google Drive
DRIVE_FOLDER_ID=${driveFolderId}

# Google Sheets
SPREADSHEET_ID=${spreadsheetId}
SHEET_NAME=${sheetName}

# WhatsApp
TARGET_GROUP_ID=${targetGroupId}`;
        fs.writeFileSync(envPath, envContent);
        console.log('[SYSTEM] .env berhasil dibuat, melanjutkan startup.');
        rl.close();
    }

    // 1. Disable tombol close (X)
    disableCloseButton();

    // 2. Buat system tray
    systray = new SysTray({
        menu: {
            icon: '',
            title: 'waworker-uploader',
            tooltip: 'WAWorker - Uploader',
            items: [
                menuService,
                SysTray.separator,
                menuShowHide,
                menuHelp,
                SysTray.separator,
                menuQuit
            ]
        },
        debug: false,
        copyDir: true
    });

    systray.onClick(action => {
        if (action.item.click != null) {
            action.item.click();
        }
    });

    // 3. Auto-hide setelah 1 detik (kedip sekilas)
    setTimeout(() => {
        hideConsole();
    }, 1000);

    // 4. Monitor minimize → hide to tray
    startMinimizeMonitor();
}

export function cleanupTray() {
    if (monitorProcess) {
        try { monitorProcess.kill(); } catch {}
    }
    enableCloseButton();
    showConsole();
    if (systray) {
        try { systray.kill(false); } catch {}
    }
}
