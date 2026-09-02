/**
 * Parser caption WhatsApp → { startDate, endDate, description }
 *
 * Format yang didukung:
 *   14 agu - something
 *   14 agu something
 *   14 agu-something
 *   14 agu- something
 *   14agu -something
 *   14 agustus 2026 - something
 *
 *   14 agu sd 21 agu something      (range)
 *   14 agu sd 21 agu - something    (range with dash)
 */

const MONTHS = {
  jan: 1, januar: 1, januari: 1,
  feb: 2, februari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  agu: 8, agus: 8, agust: 8, agustus: 8, aug: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12,
};

/**
 * Parse satu token tanggal dari string.
 * @returns {{ date: string, rest: string } | null}
 */
function extractDate(str) {
  // Match: angka + nama bulan + opsional tahun
  const match = str.match(/^(\d{1,2})\s*([a-zA-Z]+)(?:\s+(\d{4}))?/i);
  if (!match) return null;

  const day   = parseInt(match[1], 10);
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;

  const year = match[3] ? parseInt(match[3], 10) : new Date().getFullYear();
  const date = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
  const rest = str.slice(match[0].length);

  return { date, rest };
}

/**
 * Hapus separator ( - , -  ,  - , spasi) dari awal string.
 * @returns {string}
 */
function stripSeparator(str) {
  return str.replace(/^\s*-?\s*/, '').trim();
}

/**
 * Parse caption menjadi komponen terstruktur.
 * @param {string} raw
 * @returns {{ startDate: string|null, endDate: string|null, description: string }}
 */
export function parseCaption(raw) {
  const text = raw.trim();

  // ── Coba range: "<date> sd <date> <rest>" ──────────────────────
  const rangeMatch = text.match(
    /^(\d{1,2})\s*([a-zA-Z]+)(?:\s+(\d{4}))?\s+sd\s+(.*)/i
  );
  if (rangeMatch) {
    const startParsed = extractDate(rangeMatch[1] + rangeMatch[2] + (rangeMatch[3] ? ' ' + rangeMatch[3] : ''));
    const remainder   = rangeMatch[4].trim();
    const endParsed   = extractDate(remainder);

    if (startParsed && endParsed) {
      const description = stripSeparator(endParsed.rest);
      return {
        startDate:   startParsed.date,
        endDate:     endParsed.date,
        description: description || '(Tanpa Keterangan)',
      };
    }
  }

  // ── Coba single date ────────────────────────────────────────────
  const singleParsed = extractDate(text);
  if (singleParsed) {
    const description = stripSeparator(singleParsed.rest);
    return {
      startDate:   singleParsed.date,
      endDate:     null,
      description: description || '(Tanpa Keterangan)',
    };
  }

  // ── Tidak ada tanggal terdeteksi ────────────────────────────────
  return { startDate: null, endDate: null, description: text };
}
