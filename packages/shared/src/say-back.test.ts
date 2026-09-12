import { describe, expect, it } from 'vitest';
import { judgeSaidBack } from './say-back';

describe('judgeSaidBack', () => {
  it('matches the word said on its own', () => {
    expect(judgeSaidBack('substantial', 'substantial')).toEqual({
      verdict: 'matched',
      heard: 'substantial',
    });
  });

  /**
   * People do not answer in single words. Failing someone for saying a
   * sentence around the word would be failing them for being ordinary.
   */
  it('finds the word inside a whole phrase', () => {
    expect(judgeSaidBack('substantial', "I think it's substantial.").verdict).toBe(
      'matched',
    );
  });

  it('ignores case and punctuation', () => {
    expect(judgeSaidBack('elucidate', '  Elucidate!  ').verdict).toBe('matched');
  });

  /**
   * The verdict the whole feature turns on. Transcription of accented English
   * is good rather than perfect, so a near miss has to read as encouragement —
   * the alternative is blaming a learner for the transcriber.
   */
  it('treats a letter or two out as close, not wrong', () => {
    expect(judgeSaidBack('substantial', 'substancial').verdict).toBe('close');
    expect(judgeSaidBack('corroborate', 'corroberate').verdict).toBe('close');
  });

  it('scales that forgiveness with the length of the word', () => {
    // One letter out of four is most of the word; one out of eleven is a lisp.
    expect(judgeSaidBack('vast', 'fast').verdict).toBe('close');
    expect(judgeSaidBack('vast', 'mist').verdict).toBe('different');
  });

  it('says plainly when it heard something else', () => {
    expect(judgeSaidBack('substantial', 'banana')).toEqual({
      verdict: 'different',
      heard: 'banana',
    });
  });

  it('reports silence as silence rather than as a wrong answer', () => {
    expect(judgeSaidBack('substantial', '   ')).toEqual({ verdict: 'nothing' });
    expect(judgeSaidBack('substantial', '...')).toEqual({ verdict: 'nothing' });
  });

  it('keeps what was heard verbatim, for the reader to judge', () => {
    // The point of showing it: the transcriber is fallible and the learner can
    // see that for themselves rather than being told they failed.
    const result = judgeSaidBack('salient', 'Sally int');
    expect(result.verdict).toBe('different');
    expect(result).toMatchObject({ heard: 'Sally int' });
  });
});
