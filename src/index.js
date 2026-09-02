import 'dotenv/config';
import { startWebServer, sendSSE } from './webServer.js';
import { getAuthenticatedClient } from './google/auth.js';
import { startWhatsAppClient, closeWhatsAppClient } from './whatsapp/client.js';
import { processMessage } from './processor/message.js';
import { killOldInstance, registerPid } from './pid.js';
import { startSystray } from './tray.js';
import { setupGracefulShutdown } from './shutdown.js';

function isConfigured() {
  return !!(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
    process.env.GOOGLE_CLIENT_SECRET?.trim() &&
    process.env.DRIVE_FOLDER_ID?.trim() &&
    process.env.SPREADSHEET_ID?.trim()
  );
}

async function main() {
  killOldInstance();
  registerPid();

  const server = startWebServer(3000);
  setupGracefulShutdown(server, closeWhatsAppClient);
  startSystray();

  if (!isConfigured()) {
    sendSSE('needs_setup', {});
    sendSSE('status', { status: 'Belum Dikonfigurasi', connected: false });
    sendSSE('log', { message: '⚠️ Konfigurasi belum lengkap. Isi pengaturan lewat wizard, lalu Restart.' });
    return; // tunggu user isi config via GUI, lalu restart
  }

  const auth = await getAuthenticatedClient(server);
  await startWhatsAppClient((payload) => processMessage(auth, payload));
}

main().catch((err) => {
  console.error('Fatal startup error:', err.message);
  sendSSE('log', { message: `❌ Fatal error: ${err.message}` });
});
