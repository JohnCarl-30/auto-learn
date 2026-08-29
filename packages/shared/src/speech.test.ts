import { describe, expect, it } from 'vitest';
import { isAudioMediaType, Pronunciation, SpeakWord } from './speech';

describe('SpeakWord', () => {
  it('accepts a single word', () => {
    expect(SpeakWord.safeParse('ubiquitous').success).toBe(true);
  });

  it('accepts the punctuation that lives inside words', () => {
    expect(SpeakWord.safeParse('self-evident').success).toBe(true);
    expect(SpeakWord.safeParse("o'clock").success).toBe(true);
  });

  it('accepts letters outside ASCII', () => {
    expect(SpeakWord.safeParse('naïve').success).toBe(true);
  });

  /**
   * The point of the schema. /speak is unauthenticated and spends the provider
   * key, so anything that lets a sentence through turns it into a free
   * text-to-speech proxy for whoever finds the URL.
   */
  it('refuses a sentence', () => {
    expect(SpeakWord.safeParse('read this whole thing aloud').success).toBe(
      false,
    );
  });

  it('refuses padding that would smuggle in more than a word', () => {
    expect(SpeakWord.safeParse('a'.repeat(49)).success).toBe(false);
    expect(SpeakWord.safeParse('').success).toBe(false);
    expect(SpeakWord.safeParse('two words').success).toBe(false);
  });
});

describe('isAudioMediaType', () => {
  it('accepts what a browser actually reports', () => {
    // MediaRecorder says `audio/webm;codecs=opus`, never a bare `audio/webm`.
    // Comparing the raw string against the list rejects every real recording.
    expect(isAudioMediaType('audio/webm;codecs=opus')).toBe(true);
    expect(isAudioMediaType('audio/webm')).toBe(true);
    expect(isAudioMediaType('AUDIO/WEBM')).toBe(true);
  });

  it('refuses anything that is not audio', () => {
    expect(isAudioMediaType('video/mp4')).toBe(false);
    expect(isAudioMediaType('application/json')).toBe(false);
    expect(isAudioMediaType(undefined)).toBe(false);
    expect(isAudioMediaType('')).toBe(false);
  });
});

describe('Pronunciation', () => {
  /**
   * Both fields nullable, the object itself required. A word nobody recorded
   * still has IPA; a word with neither is still synthesisable through /speak,
   * so absence here is never a dead end.
   */
  it('allows a word nobody recorded', () => {
    expect(
      Pronunciation.safeParse({ ipa: '/ˈɒbfəskeɪt/', audioUrl: null }).success,
    ).toBe(true);
    expect(Pronunciation.safeParse({ ipa: null, audioUrl: null }).success).toBe(
      true,
    );
  });

  it('will not accept a missing field as null', () => {
    expect(Pronunciation.safeParse({ ipa: '/x/' }).success).toBe(false);
  });
});
