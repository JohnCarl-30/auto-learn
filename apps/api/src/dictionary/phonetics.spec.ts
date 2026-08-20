import { pickPronunciation } from './phonetics';

/**
 * The fixtures below are trimmed from real api.dictionaryapi.dev responses,
 * not invented. Every case here is a shape that broke a reasonable first
 * attempt at reading this data, which is why they are worth pinning.
 */

// No top-level `phonetic` at all — the IPA exists only inside `phonetics[]`.
const UBIQUITOUS = [
  {
    phonetics: [
      {
        audio:
          'https://api.dictionaryapi.dev/media/pronunciations/en/ubiquitous-au.mp3',
      },
      {
        text: '/juːˈbɪk.wə.təs/',
        audio:
          'https://api.dictionaryapi.dev/media/pronunciations/en/ubiquitous-uk.mp3',
      },
    ],
  },
];

// First variant carries an empty-string `audio`, not a missing key.
const OBFUSCATE = [
  {
    phonetic: '/ˈɒbfəskeɪt/',
    phonetics: [
      { text: '/ˈɒbfəskeɪt/', audio: '' },
      {
        text: '/ˈɑːbfəskeɪt/',
        audio:
          'https://api.dictionaryapi.dev/media/pronunciations/en/obfuscate-us.mp3',
      },
    ],
  },
];

describe('pickPronunciation', () => {
  it('finds IPA that exists only inside the variants', () => {
    // Reading `phonetic` alone returns nothing here, which would silently drop
    // pronunciation for exactly the uncommon words this product teaches.
    expect(pickPronunciation(UBIQUITOUS).ipa).toBe('/juːˈbɪk.wə.təs/');
  });

  it('skips a variant whose audio is an empty string', () => {
    // Truthiness, not presence: `'audio' in variant` is true for the first one
    // and would ship a play button that plays nothing.
    expect(pickPronunciation(OBFUSCATE).audioUrl).toBe(
      'https://api.dictionaryapi.dev/media/pronunciations/en/obfuscate-us.mp3',
    );
  });

  it('reports the IPA of the recording it actually chose', () => {
    // Not '/ˈɒbfəskeɪt/', the top-level British one — that would print one
    // accent next to a clip of another.
    expect(pickPronunciation(OBFUSCATE).ipa).toBe('/ˈɑːbfəskeɪt/');
  });

  it('prefers one accent rather than taking whichever came first', () => {
    expect(pickPronunciation(UBIQUITOUS).audioUrl).toContain('-uk.');
  });

  it('makes a protocol-relative URL absolute', () => {
    // Works on localhost and is blocked as mixed content once deployed, which
    // is the worst kind of bug: invisible until production.
    const result = pickPronunciation([
      { phonetics: [{ audio: '//ssl.gstatic.com/dictionary/lead.mp3' }] },
    ]);

    expect(result.audioUrl).toBe('https://ssl.gstatic.com/dictionary/lead.mp3');
  });

  it('upgrades plain http rather than serving a blocked URL', () => {
    const result = pickPronunciation([
      { phonetics: [{ audio: 'http://ssl.gstatic.com/dictionary/lead.mp3' }] },
    ]);

    expect(result.audioUrl).toBe('https://ssl.gstatic.com/dictionary/lead.mp3');
  });

  it('drops anything that is not fetchable over https', () => {
    expect(
      pickPronunciation([{ phonetics: [{ audio: 'ftp://example.com/x.mp3' }] }])
        .audioUrl,
    ).toBeNull();
  });

  it('falls back to the top-level IPA when nothing was recorded', () => {
    const result = pickPronunciation([
      { phonetic: '/ˈɒbfəskeɪt/', phonetics: [{ audio: '' }] },
    ]);

    expect(result).toEqual({ ipa: '/ˈɒbfəskeɪt/', audioUrl: null });
  });

  it('says so plainly when there is nothing at all', () => {
    expect(pickPronunciation([])).toEqual({ ipa: null, audioUrl: null });
    expect(pickPronunciation([{ meanings: [] } as never])).toEqual({
      ipa: null,
      audioUrl: null,
    });
  });
});
