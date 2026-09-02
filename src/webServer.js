import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.resolve('./. env').replace(' ', '');   // './. env' workaround resolves to '.env'
const ENV_REAL = './.env';

const LOGS_PATH = './data/logs.json';

function loadPersistedLogs() {
  try {
    return JSON.parse(fs.readFileSync(LOGS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function savePersistedLogs(logs) {
  try {
    fs.mkdirSync(path.dirname(LOGS_PATH), { recursive: true });
    fs.writeFileSync(LOGS_PATH, JSON.stringify(logs, null, 2));
  } catch {}
}

const clients = new Set();

const currentState = {
  status: 'Menghubungkan...',
  connected: false,
  googleAuthenticated: false,
  googleAuthUrl: null,
  qrDataUrl: null,
  logs: loadPersistedLogs(),
};

export function sendSSE(type, data = {}) {
  if (type === 'google_authenticated') currentState.googleAuthenticated = true;
  if (type === 'google_auth_url') currentState.googleAuthUrl = data.url;
  if (type === 'status') {
    currentState.status = data.status;
    currentState.connected = data.connected;
  }
  if (type === 'qr') currentState.qrDataUrl = data.qrDataUrl;
  if (type === 'qr_clear') currentState.qrDataUrl = null;
  if (type === 'log') {
    const time = new Date().toLocaleTimeString('id-ID');
    const logObj = { time, message: data.message };
    currentState.logs.push(logObj);
    if (currentState.logs.length > 100) currentState.logs.shift();
    savePersistedLogs(currentState.logs);
    data.time = time;
  }

  const payload = `data: ${JSON.stringify({ type, ...data })}\n\n`;
  for (const client of clients) {
    client.write(payload);
  }
}

function readEnvFile() {
  try {
    const content = fs.readFileSync(ENV_REAL, 'utf8');
    const config = {};
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim();
      config[key] = val;
    }
    return config;
  } catch {
    return {};
  }
}

function writeEnvFile(config) {
  const lines = [
    '# Google OAuth Credentials',
    `GOOGLE_CLIENT_ID=${config.GOOGLE_CLIENT_ID || ''}`,
    `GOOGLE_CLIENT_SECRET=${config.GOOGLE_CLIENT_SECRET || ''}`,
    '',
    '# Google Drive',
    `DRIVE_FOLDER_ID=${config.DRIVE_FOLDER_ID || ''}`,
    '',
    '# Google Sheets',
    `SPREADSHEET_ID=${config.SPREADSHEET_ID || ''}`,
    `SHEET_NAME=${config.SHEET_NAME || 'Data'}`,
    '',
    '# WhatsApp',
    `TARGET_GROUP_ID=${config.TARGET_GROUP_ID || ''}`,
  ];
  fs.writeFileSync(ENV_REAL, lines.join('\n') + '\n');
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => (body += chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on('error', reject);
  });
}

const APP_CONFIG_PATH = './data/app_config.json';

const DEFAULT_APP_CONFIG = {
  useTextAsFileName: true,
  columnMapping: [
    'sender',   // Kolom A
    'text',     // Kolom B
    'fileUrl',  // Kolom C
    'none',     // Kolom D
    'none',     // Kolom E
    'none',     // Kolom F
    'none',     // Kolom G
    'none',     // Kolom H
    'none',     // Kolom I
    'none',     // Kolom J
  ],
};

export function readAppConfig() {
  try {
    const data = JSON.parse(fs.readFileSync(APP_CONFIG_PATH, 'utf8'));
    return { ...DEFAULT_APP_CONFIG, ...data };
  } catch {
    return DEFAULT_APP_CONFIG;
  }
}

export function writeAppConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(APP_CONFIG_PATH), { recursive: true });
    const current = readAppConfig();
    const updated = {
      ...current,
      useTextAsFileName: cfg.useTextAsFileName !== undefined ? Boolean(cfg.useTextAsFileName) : current.useTextAsFileName,
      columnMapping: Array.isArray(cfg.columnMapping) ? cfg.columnMapping.slice(0, 10) : current.columnMapping,
    };
    fs.writeFileSync(APP_CONFIG_PATH, JSON.stringify(updated, null, 2));
  } catch (err) {
    console.error('Error writing app_config.json:', err.message);
  }
}

export function clearLogs() {
  currentState.logs = [];
  try {
    fs.mkdirSync(path.dirname(LOGS_PATH), { recursive: true });
    fs.writeFileSync(LOGS_PATH, JSON.stringify([], null, 2));
  } catch {}
  sendSSE('logs_cleared');
}

export function startWebServer(port = 3000) {
  // Fresh start log reset
  clearLogs();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // Skip OAuth callback (handled by auth.js listener)
    if (url.pathname === '/oauth2callback') {
      return;
    }

    // SSE
    if (url.pathname === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      clients.add(res);
      res.write(`data: ${JSON.stringify({ type: 'init', state: currentState })}\n\n`);
      req.on('close', () => clients.delete(res));
      return;
    }

    // API: Clear Logs
    if (url.pathname === '/api/logs/clear' && req.method === 'POST') {
      clearLogs();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // API: GET settings
    if (url.pathname === '/api/settings' && req.method === 'GET') {
      const config = { ...readEnvFile(), ...readAppConfig() };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(config));
      return;
    }

    // API: POST settings (save .env & app_config.json)
    if (url.pathname === '/api/settings' && req.method === 'POST') {
      const body = await parseBody(req);
      writeEnvFile(body);
      writeAppConfig(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    // API: Restart
    if (url.pathname === '/api/restart' && req.method === 'POST') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      setTimeout(() => process.exit(0), 300);
      return;
    }

    // Serve static
    let filePath;
    if (url.pathname === '/') {
      filePath = './public/index.html';
    } else if (url.pathname === '/favicon.ico') {
      filePath = './assets/logo.ico';
    } else if (url.pathname.startsWith('/assets/')) {
      filePath = `.${url.pathname}`;
    } else {
      filePath = `./public${url.pathname}`;
    }

    const ext = path.extname(filePath);
    const contentTypes = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    };

    fs.readFile(filePath, (err, content) => {
      if (err) {
        res.writeHead(404);
        res.end('Not Found');
      } else {
        res.writeHead(200, { 'Content-Type': contentTypes[ext] || 'text/plain' });
        res.end(content, 'utf-8');
      }
    });
  });

  server.listen(port, () => {
    console.log(`\n🌐 Web Dashboard berjalan di: http://localhost:${port}\n`);
    import('child_process').then(({ exec }) => {
      exec(`start http://localhost:${port}`);
    });
  });

  return server;
}
