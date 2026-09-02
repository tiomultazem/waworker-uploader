import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import { sendSSE } from '../webServer.js';

let currentSock = null;
let reconnectTimer = null;
let retryCount = 0;

export function closeWhatsAppClient() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (currentSock) {
    try {
      currentSock.ev.removeAllListeners();
      currentSock.ws.close();
    } catch { }
    currentSock = null;
  }
}

export async function startWhatsAppClient(onMessage) {
  closeWhatsAppClient();

  const { state, saveCreds } = await useMultiFileAuthState('./auth/baileys');
  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['WAWorker - Uploader', 'Desktop', '1.0.0'],
    syncFullHistory: false,
    markOnlineOnConnect: true,
    connectTimeoutMs: 60_000,
    keepAliveIntervalMs: 25_000,
  });

  currentSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      try {
        const qrDataUrl = await QRCode.toDataURL(qr, { margin: 1, width: 250 });
        sendSSE('qr', { qrDataUrl });
        sendSSE('status', { status: 'Menunggu Scan QR WhatsApp...', connected: false });
        sendSSE('log', { message: '📱 QR Code baru siap discan.' });
      } catch (err) {
        console.error('Error generate QR Data URL:', err);
      }
    }

    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;

      if (isLoggedOut) {
        retryCount = 0;
        sendSSE('status', { status: 'WhatsApp Logged Out', connected: false });
        sendSSE('log', { message: '🔒 Sesi WhatsApp di-logout. Menghapus auth dan membuat QR baru...' });
        try {
          fs.rmSync('./auth/baileys', { recursive: true, force: true });
        } catch { }
        reconnectTimer = setTimeout(() => startWhatsAppClient(onMessage), 1000);
      } else {
        // Safe Idle & Anti-Crash Auto Reconnect
        retryCount++;
        const backoffMs = Math.min(retryCount * 3000, 30000); // 3s, 6s, 9s, max 30s

        sendSSE('status', { status: `Safe Idle (Offline / Retrying ${retryCount}x...)`, connected: false });
        sendSSE('log', {
          message: `⚠️ Hilang sinyal / koneksi terputus (${statusCode ?? 'Network Error'}). Safe Idle aktif. Mencoba terhubung kembali dalam ${backoffMs / 1000}s...`
        });

        reconnectTimer = setTimeout(() => {
          startWhatsAppClient(onMessage);
        }, backoffMs);
      }
    }

    if (connection === 'open') {
      retryCount = 0;
      sendSSE('qr_clear');
      sendSSE('status', { status: 'WhatsApp Terhubung (Aktif)', connected: true });
      sendSSE('log', { message: `✅ WhatsApp terhubung! Memantau grup: <b>${process.env.TARGET_GROUP_ID || 'Belum di-set'}</b>` });
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      const jid = msg.key.remoteJid;

      if (!jid?.endsWith('@g.us')) continue;

      if (!process.env.TARGET_GROUP_ID) {
        sendSSE('log', { message: `ℹ️ Group terdeteksi! Group ID: <b>${jid}</b>` });
        continue;
      }

      if (jid !== process.env.TARGET_GROUP_ID) continue;

      await onMessage({ sock, msg });
    }
  });
}
