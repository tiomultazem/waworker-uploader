import { google } from 'googleapis';
import fs from 'fs';
import { URL } from 'url';
import path from 'path';
import { sendSSE } from '../webServer.js';

const TOKEN_PATH = './auth/token.json';
const REDIRECT_URI = 'http://localhost:3000/oauth2callback';
const SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/spreadsheets',
];

function createOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    REDIRECT_URI
  );
}

function loadToken() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
  } catch {
    return null;
  }
}

function saveToken(token) {
  fs.mkdirSync(path.dirname(TOKEN_PATH), { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
}

export function handleOAuthCallback(req, res, oAuth2Client) {
  const url = new URL(req.url, 'http://localhost:3000');
  const code = url.searchParams.get('code');

  if (!code) {
    res.writeHead(400);
    res.end('Error: authorization code tidak ditemukan.');
    return null;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`
    <html><body style="font-family:sans-serif;text-align:center;padding:40px;background:#090d16;color:#fff">
      <h2>✅ Login berhasil!</h2>
      <p>Kembali ke Web Dashboard. Aplikasi siap digunakan.</p>
      <script>setTimeout(() => window.location.href = '/', 1500);</script>
    </body></html>
  `);

  return code;
}

export async function getAuthenticatedClient(server) {
  const oAuth2Client = createOAuth2Client();
  const token = loadToken();

  if (token) {
    oAuth2Client.setCredentials(token);
    oAuth2Client.on('tokens', (newTokens) => {
      saveToken({ ...token, ...newTokens });
    });
    sendSSE('google_authenticated');
    return oAuth2Client;
  }

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  sendSSE('google_auth_url', { url: authUrl });

  return new Promise((resolve, reject) => {
    const requestHandler = async (req, res) => {
      if (req.url.startsWith('/oauth2callback')) {
        try {
          const code = handleOAuthCallback(req, res, oAuth2Client);
          if (code) {
            const { tokens } = await oAuth2Client.getToken(code);
            oAuth2Client.setCredentials(tokens);
            saveToken(tokens);
            sendSSE('google_authenticated');
            server.removeListener('request', requestHandler);
            resolve(oAuth2Client);
          }
        } catch (err) {
          reject(err);
        }
      }
    };

    server.on('request', requestHandler);
  });
}
