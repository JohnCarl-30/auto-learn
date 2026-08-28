'use client';

/**
 * Hands the browser a file to save.
 *
 * Split out from the bank so the export can be tested as data — what goes in
 * the file is the part worth pinning, and anchor clicks and object URLs are
 * not. Revoking matters: the blob is held alive by the URL, and a bank of a
 * few hundred entries leaked on every click adds up over a session.
 */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(url);
}

/** `auto-learn-bank-2026-08-28.json` — sorts chronologically in a downloads folder. */
export function datedFilename(prefix: string, at: Date): string {
  return `${prefix}-${at.toISOString().slice(0, 10)}.json`;
}
