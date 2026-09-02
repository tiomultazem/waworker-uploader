import fs from 'fs';
import path from 'path';
import { clearPid } from './pid.js';
import { sendSSE } from './webServer.js';
import { cleanupTray } from './tray.js';

let isShuttingDown = false;

function cleanupTmpDir() {
  const tmpDir = './tmp';
  try {
    if (fs.existsSync(tmpDir)) {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tmpDir, file));
      }
    }
  } catch {}
}

export function setupGracefulShutdown(server, closeSocketFn) {
  const shutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n🛑 Signal received: ${signal}. Initiating safe shutdown...`);
    sendSSE('status', { status: 'Shutting Down Safely...', connected: false });
    sendSSE('log', { message: `🛑 Sinyal shutdown terdeteksi (${signal}). Membersihkan sesi & file sementara...` });

    cleanupTmpDir();

    if (typeof closeSocketFn === 'function') {
      try { await closeSocketFn(); } catch {}
    }

    cleanupTray();
    clearPid();

    if (server && server.close) {
      server.close(() => {
        process.exit(0);
      });
      setTimeout(() => process.exit(0), 1000);
    } else {
      process.exit(0);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT (Ctrl+C)'));
  process.on('SIGTERM', () => shutdown('SIGTERM (Kill/Shutdown)'));
  process.on('SIGHUP', () => shutdown('SIGHUP (Terminal Closed)'));
  process.on('SIGBREAK', () => shutdown('SIGBREAK'));

  process.on('uncaughtException', (err) => {
    console.error('🔥 Uncaught Exception caught (Anti-Crash):', err.message);
    sendSSE('log', { message: `⚠️ Anti-Crash: Uncaught Error terdeteksi: ${err.message}` });
  });

  process.on('unhandledRejection', (reason) => {
    const msg = reason?.message || String(reason);
    console.error('🔥 Unhandled Rejection caught (Anti-Crash):', msg);
    sendSSE('log', { message: `⚠️ Anti-Crash: Unhandled Promise Rejection: ${msg}` });
  });

  process.on('exit', () => {
    cleanupTmpDir();
    clearPid();
  });
}
