import fs from 'fs';
import path from 'path';
import { downloadMediaMessage } from '@whiskeysockets/baileys';
import { uploadImage } from '../google/drive.js';
import { appendRow } from '../google/sheets.js';
import { sendSSE, readAppConfig } from '../webServer.js';
import { parseCaption } from '../parser.js';

const PROCESSED_PATH = './data/processed.json';
const TMP_DIR = './tmp';

function loadProcessed() {
  try {
    return JSON.parse(fs.readFileSync(PROCESSED_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function saveProcessed(ids) {
  fs.mkdirSync(path.dirname(PROCESSED_PATH), { recursive: true });
  fs.writeFileSync(PROCESSED_PATH, JSON.stringify(ids, null, 2));
}

function markProcessing(messageId) {
  const ids = loadProcessed();
  if (!ids.includes(messageId)) {
    ids.push(messageId);
    saveProcessed(ids);
  }
}

function clearProcessed(messageId) {
  const ids = loadProcessed().filter((id) => id !== messageId);
  saveProcessed(ids);
}

const groupMetadataCache = new Map();

async function resolveSenderPhone(sock, groupJid, msg) {
  const msgKey = msg.key;
  const pushName = msg.pushName?.trim() || '';

  const candidates = [
    msgKey.participantAlt,
    msgKey.participant,
    msgKey.remoteJidAlt,
    msgKey.remoteJid,
  ].filter(Boolean);

  // 1. Jika ada JID yang langsung berakhiran @s.whatsapp.net
  const phoneJid = candidates.find((jid) => jid.includes('@s.whatsapp.net'));
  if (phoneJid) {
    return phoneJid.split('@')[0].split(':')[0];
  }

  const rawLid = (candidates[0] || '').split(':')[0].split('@')[0];

  // 2. Ambil metadata grup dari WhatsApp (dengan cache 2 menit untuk cegah rate limit)
  try {
    const now = Date.now();
    let participants = groupMetadataCache.get(groupJid)?.participants;
    const lastFetch = groupMetadataCache.get(groupJid)?.time || 0;

    if (!participants || now - lastFetch > 120_000) {
      const meta = await sock.groupMetadata(groupJid);
      participants = meta?.participants || [];
      groupMetadataCache.set(groupJid, { time: now, participants });
    }

    const matched = participants.find((p) => {
      const pLid = (p.lid || p.id || '').split('@')[0].split(':')[0];
      const pId = (p.id || '').split('@')[0].split(':')[0];
      const pPn = (p.phoneNumber || p.pn || '').split('@')[0].split(':')[0];
      return pLid === rawLid || pId === rawLid || pPn === rawLid;
    });

    if (matched) {
      const phoneProp = [matched.jid, matched.id, matched.phoneNumber, matched.pn]
        .filter(Boolean)
        .find(val => val.includes('@s.whatsapp.net') || /^\d{8,15}$/.test(val));

      if (phoneProp) {
        return phoneProp.split('@')[0].split(':')[0];
      }
    }
  } catch (err) {
    // Abaikan error metadata
  }

  // 3. Fallback jika nomor disembunyikan WhatsApp: gunakan Nama WhatsApp (pushName)
  if (pushName) {
    return `${pushName} (${rawLid})`;
  }

  return rawLid;
}

async function handleProcessMessage(auth, { sock, msg }) {
  const messageId = msg.key.id;

  if (loadProcessed().includes(messageId)) {
    return;
  }

  let content = msg.message;
  if (!content) return;

  if (content.ephemeralMessage) content = content.ephemeralMessage.message;
  if (content.viewOnceMessage) content = content.viewOnceMessage.message;
  if (content.viewOnceMessageV2) content = content.viewOnceMessageV2.message;

  // Ekstraksi pesan teks, gambar, dan dokumen
  const directImageMessage = content?.imageMessage;
  const directDocumentMessage = content?.documentMessage;
  const extendedTextMessage = content?.extendedTextMessage;
  const conversationText = content?.conversation;
  const contextInfo = extendedTextMessage?.contextInfo;
  const quotedMessage = contextInfo?.quotedMessage;

  // Cek apakah balasan (reply) menyertakan pesan gambar atau dokumen
  let quotedContent = quotedMessage;
  if (quotedContent?.ephemeralMessage) quotedContent = quotedContent.ephemeralMessage.message;
  if (quotedContent?.viewOnceMessage) quotedContent = quotedContent.viewOnceMessage.message;
  if (quotedContent?.viewOnceMessageV2) quotedContent = quotedContent.viewOnceMessageV2.message;
  const quotedImageMessage = quotedContent?.imageMessage;
  const quotedDocumentMessage = quotedContent?.documentMessage;

  const directMedia = directImageMessage || directDocumentMessage;
  const quotedMedia = quotedImageMessage || quotedDocumentMessage;
  const targetMedia = directMedia || quotedMedia;

  const isDoc = !!directDocumentMessage || !!quotedDocumentMessage;

  let textContent = (
    conversationText ||
    extendedTextMessage?.text ||
    directImageMessage?.caption ||
    directDocumentMessage?.caption ||
    ''
  ).trim();

  // Jika dokumen dikirim tanpa teks, gunakan nama file dokumen sebagai teks
  if (!textContent && isDoc && targetMedia?.fileName) {
    textContent = targetMedia.fileName;
  } else if (!textContent && isDoc) {
    textContent = 'Dokumen';
  }

  // Aturan 1: Kirim foto doang (tanpa teks) → Silent (Abaikan)
  if (directImageMessage && !textContent) {
    sendSSE('log', { message: `ℹ️ Foto tanpa teks terdeteksi [${messageId}]. Mode silent/skipped.` });
    return;
  }

  // Aturan 2: Kirim teks doang (tanpa media langsung dan tidak reply media) → Balas Peringatan
  if (!targetMedia && textContent) {
    markProcessing(messageId);
    sendSSE('log', { message: `⚠️ Teks tanpa foto/dokumen terdeteksi [${messageId}]. Mengirim pesan peringatan.` });
    try {
      await sock.sendMessage(msg.key.remoteJid, {
        text: 'harap kirim pesan beserta foto/dokumen',
      }, { quoted: msg });
    } catch (e) {
      console.error('Error sending warning message:', e.message);
    }
    clearProcessed(messageId);
    return;
  }

  // Jika tidak ada media dan tidak ada teks, abaikan
  if (!targetMedia || !textContent) {
    return;
  }

  // Aturan 3: Media dengan teks OR Reply teks ke pesan media → Proses & Upload
  const sender = await resolveSenderPhone(sock, msg.key.remoteJid, msg);

  markProcessing(messageId);
  sendSSE('log', { message: `📩 Memproses pesan dari ${sender}: "${textContent}" [${messageId}]` });

  let tmpPath = null;

  try {
    fs.mkdirSync(TMP_DIR, { recursive: true });
    const appConfig = readAppConfig();
    const timestamp = Date.now();

    // Tentukan ekstensi file dari nama file dokumen atau mimetype
    let ext = '.jpg';
    if (targetMedia.fileName && path.extname(targetMedia.fileName)) {
      ext = path.extname(targetMedia.fileName).toLowerCase();
    } else if (targetMedia.mimetype) {
      const mimeMap = {
        'application/pdf': '.pdf',
        'application/msword': '.doc',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
        'application/vnd.ms-excel': '.xls',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
        'image/png': '.png',
        'image/webp': '.webp',
        'image/jpeg': '.jpg',
      };
      if (mimeMap[targetMedia.mimetype]) {
        ext = mimeMap[targetMedia.mimetype];
      }
    }

    let fileName = targetMedia.fileName || `file_${timestamp}${ext}`;
    if (appConfig.useTextAsFileName) {
      const safeName = textContent
        .replace(/[\\/:*?"<>|]/g, '')
        .slice(0, 100)
        .trim();
      fileName = `${safeName || 'file'}${ext}`;
    }

    tmpPath = path.join(TMP_DIR, fileName);

    sendSSE('log', { message: `📥 Mengunduh media dari WhatsApp...` });

    // Konstruksi objek media yang akan diunduh (langsung atau dari reply)
    const msgToDownload = directMedia
      ? msg
      : {
          key: {
            remoteJid: msg.key.remoteJid,
            id: contextInfo.stanzaId,
            participant: contextInfo.participant,
          },
          message: quotedContent,
        };

    const buffer = await downloadMediaMessage(
      msgToDownload,
      'buffer',
      {},
      {
        logger: {
          info: () => {},
          error: (m) => console.error('Baileys media error:', m),
          warn: () => {},
          debug: () => {},
          trace: () => {},
          child: () => ({ info: () => {}, error: () => {}, warn: () => {}, debug: () => {}, trace: () => {} }),
        },
        reuploadRequest: sock.updateMediaMessage,
      }
    );

    fs.writeFileSync(tmpPath, buffer);

    sendSSE('log', { message: `☁️ Mengupload file ke Google Drive...` });
    const driveFile = await uploadImage(auth, tmpPath, fileName, targetMedia.mimetype);
    sendSSE('log', { message: `✅ Upload Drive berhasil: <b><a href="${driveFile.webViewLink}" target="_blank">${driveFile.name}</a></b>` });

    const formattedTime = new Date().toLocaleString('id-ID');
    const metadata = {
      sender,
      pushName: msg.pushName?.trim() || '',
      text: textContent,
      fileUrl: driveFile.webViewLink,
      fileName,
      fileId: driveFile.id || '',
      timestamp: formattedTime,
      groupId: msg.key.remoteJid || '',
      mediaType: targetMedia.mimetype || 'application/octet-stream',
    };

    sendSSE('log', { message: `📊 Memperbarui Google Sheets...` });
    await appendRow(auth, metadata);
    sendSSE('log', { message: `✅ Sheets diperbarui!` });

    // React 👍 ke pesan sebagai tanda selesai diproses
    await sock.sendMessage(msg.key.remoteJid, {
      react: { text: '👍', key: msg.key },
    });
    sendSSE('log', { message: `👍 Reaksi dikirim ke pesan.` });

    fs.unlinkSync(tmpPath);
    clearProcessed(messageId);
    sendSSE('log', { message: `🗑️ File temporary dihapus.\n` });
  } catch (err) {
    sendSSE('log', { message: `❌ Error memproses ${messageId}: ${err.message}` });
    if (tmpPath && fs.existsSync(tmpPath)) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }
}

// Antrean sekuensial untuk mencegah rate-overlimit saat banyak gambar masuk bersamaan
let messageQueue = Promise.resolve();

export function processMessage(auth, payload) {
  messageQueue = messageQueue
    .then(() => handleProcessMessage(auth, payload))
    .catch((err) => console.error('Queue execution error:', err));
  return messageQueue;
}
