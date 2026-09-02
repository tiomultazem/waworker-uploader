import { google } from 'googleapis';
import { readAppConfig } from '../webServer.js';

/**
 * Append baris ke Google Sheets secara dinamis berdasarkan pemetaan kolom A-J
 */
export async function appendRow(auth, metadata) {
  const sheets = google.sheets({ version: 'v4', auth });
  const appConfig = readAppConfig();
  const columnMapping = appConfig.columnMapping || ['sender', 'text', 'fileUrl'];

  // Susun nilai baris berdasarkan pemetaan kolom pengguna
  const row = columnMapping.map((key) => {
    if (!key || key === 'none') return '';
    return metadata[key] ?? '';
  });

  const endColChar = String.fromCharCode(65 + Math.max(0, row.length - 1));
  const range = `${process.env.SHEET_NAME || 'Data'}!A:${endColChar}`;

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SPREADSHEET_ID,
    range,
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [row],
    },
  });
}
