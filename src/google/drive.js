import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

/**
 * Upload image ke Google Drive.
 * @param {object} auth - OAuth2 client
 * @param {string} filePath - Path file sementara lokal
 * @param {string} fileName - Nama file di Drive
 * @returns {{ id: string, name: string, webViewLink: string }}
 */
export async function uploadImage(auth, filePath, fileName) {
  const drive = google.drive({ version: 'v3', auth });

  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };
  const mimeType = mimeTypes[ext] ?? 'image/jpeg';

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [process.env.DRIVE_FOLDER_ID],
    },
    media: {
      mimeType,
      body: fs.createReadStream(filePath),
    },
    fields: 'id, name, webViewLink',
  });

  return response.data;
}
