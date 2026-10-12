import type { DocumentPayload } from '@pe/shared/api';

// Préparation d'un document avant l'analyse par Gemini : PDF et photos partent tels quels
// (photos allégées), Word et Excel sont convertis en texte dans le navigateur.

const MAX_BYTES = 11 * 1024 * 1024;

export const ACCEPTED = '.pdf,.docx,.xlsx,.csv,.txt,image/png,image/jpeg,image/webp,image/heic,image/heif';

export interface PreparedDocument extends DocumentPayload {
  name: string;
  /** « PDF · 2 pages », « Photo », « Excel · 34 lignes »… */
  label: string;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Réduit une grande photo (2000 px au plus, JPEG) : plus rapide à envoyer sur un réseau lent. */
async function shrinkImage(file: File): Promise<{ mimeType: string; data: string }> {
  if (file.size < 1_500_000 || /heic|heif/i.test(file.type)) return { mimeType: file.type, data: toBase64(await file.arrayBuffer()) };
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Cette photo n'a pas pu être lue."));
      i.src = url;
    });
    const scale = Math.min(1, 2000 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { mimeType: 'image/jpeg', data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1] };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function prepareDocument(file: File): Promise<PreparedDocument> {
  const name = file.name;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (file.size > MAX_BYTES) throw new Error('Fichier trop lourd (11 Mo au plus). Envoyez-le en plusieurs parties ou en PDF.');

  if (file.type === 'application/pdf' || ext === 'pdf') {
    return { name, label: 'PDF', file: { mimeType: 'application/pdf', data: toBase64(await file.arrayBuffer()) } };
  }
  if (file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext)) {
    const img = await shrinkImage(file.type ? file : new File([file], name, { type: ext === 'png' ? 'image/png' : 'image/jpeg' }));
    return { name, label: 'Photo', file: img };
  }
  if (ext === 'docx') {
    const mod = await import('mammoth/mammoth.browser.js');
    const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod;
    const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
    if (!value.trim()) throw new Error('Ce document Word ne contient pas de texte lisible.');
    return { name, label: 'Word', text: value };
  }
  if (ext === 'xlsx') {
    const { default: readXlsxFile, readSheetNames } = await import('read-excel-file');
    const sheets = await readSheetNames(file);
    const parts: string[] = [];
    let rows = 0;
    for (const sheet of sheets.slice(0, 5)) {
      const data = await readXlsxFile(file, { sheet });
      rows += data.length;
      parts.push(`Feuille « ${sheet} »`, ...data.map((r) => r.map((c) => (c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ''))).join(' ; ')));
    }
    return { name, label: `Excel · ${rows} lignes`, text: parts.join('\n') };
  }
  if (ext === 'csv' || ext === 'txt' || file.type.startsWith('text/')) {
    return { name, label: 'Texte', text: await file.text() };
  }
  if (ext === 'doc' || ext === 'xls') throw new Error('Ancien format Office : enregistrez le fichier en .docx, .xlsx ou PDF.');
  throw new Error('Format non pris en charge : PDF, Word (.docx), Excel (.xlsx), CSV ou photo.');
}
