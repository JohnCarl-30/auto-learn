import { datedFilename, downloadJson } from './download';

/**
 * The anchor dance is not the interesting part; what the reader ends up with
 * is. These read the real Blob rather than mocking the constructor — a mocked
 * Blob would pass while proving nothing about what was written.
 */
/** jsdom's Blob has no `text()`, but it does implement FileReader. */
const readBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe('downloadJson', () => {
  let captured: Blob | null = null;
  const revoked: string[] = [];

  beforeEach(() => {
    captured = null;
    revoked.length = 0;

    global.URL.createObjectURL = jest.fn((object: Blob | MediaSource) => {
      captured = object as Blob;
      return 'blob:url';
    });
    global.URL.revokeObjectURL = jest.fn((url: string) => {
      revoked.push(url);
    });
  });

  afterEach(() => jest.restoreAllMocks());

  it('writes the data as JSON, unabridged', async () => {
    downloadJson('bank.json', {
      version: 1,
      entries: [{ word: 'substantial', timesReused: 3 }],
    });

    expect(captured).not.toBeNull();
    const text = await readBlob(captured as unknown as Blob);

    expect(JSON.parse(text)).toEqual({
      version: 1,
      entries: [{ word: 'substantial', timesReused: 3 }],
    });
  });

  it('labels it as JSON, so the file opens as one', () => {
    downloadJson('bank.json', {});

    expect((captured as unknown as Blob).type).toBe('application/json');
  });

  /** The blob is held alive by its URL; a few hundred entries per click adds up. */
  it('releases the object URL it created', () => {
    downloadJson('bank.json', {});

    expect(revoked).toEqual(['blob:url']);
  });

  it('leaves no anchor behind in the document', () => {
    downloadJson('bank.json', {});

    expect(document.querySelectorAll('a')).toHaveLength(0);
  });
});

describe('datedFilename', () => {
  it('dates the file so a downloads folder sorts chronologically', () => {
    expect(
      datedFilename('auto-learn-bank', new Date('2026-08-28T09:00:00Z')),
    ).toBe('auto-learn-bank-2026-08-28.json');
  });
});
