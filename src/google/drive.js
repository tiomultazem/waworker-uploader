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
export async function uploadImage(auth, filePath, fileName, customMimeType = null) {
  const drive = google.drive({ version: 'v3', auth });

  const ext = path.extname(fileName).toLowerCase();
  const mimeTypes = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.zip': 'application/zip',
  };
  const mimeType = customMimeType || mimeTypes[ext] || 'application/octet-stream';

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
