import { describe, expect, it } from 'vitest';
import { findReused, maskLemma } from './reuse';

describe('findReused', () => {
  it('finds an exact reuse', () => {
    expect(
      findReused('The evidence was substantial this time.', ['substantial']),
    ).toEqual(['substantial']);
  });

  it('is case insensitive and ignores punctuation', () => {
    expect(findReused('Substantial, indeed.', ['substantial'])).toEqual([
      'substantial',
    ]);
  });

  it('matches regular plurals and past tense', () => {
    expect(findReused('It demonstrates the point.', ['demonstrate'])).toEqual([
      'demonstrate',
    ]);
    expect(findReused('She demonstrated it.', ['demonstrate'])).toEqual([
      'demonstrate',
    ]);
  });

  it('matches consonant-y inflections', () => {
    expect(findReused('Two studies agreed.', ['study'])).toEqual(['study']);
    expect(findReused('They studied it.', ['study'])).toEqual(['study']);
  });

  it('matches silent-e inflections', () => {
    expect(findReused('They argued the point.', ['argue'])).toEqual(['argue']);
    expect(findReused('He is arguing again.', ['argue'])).toEqual(['argue']);
  });

  it('returns every banked word that appears', () => {
    const found = findReused('Substantial studies demonstrate this.', [
      'substantial',
      'study',
      'demonstrate',
      'nonetheless',
    ]);
    expect(found.sort()).toEqual(['demonstrate', 'study', 'substantial']);
  });

  it('stays quiet when nothing matches', () => {
    expect(findReused('Nothing relevant here.', ['substantial'])).toEqual([]);
  });

  it('does not claim a reuse for a merely similar word', () => {
    // The failure mode that matters: congratulating someone for a word they
    // never used is worse than saying nothing.
    expect(findReused('The substance was odd.', ['substantial'])).toEqual([]);
    expect(findReused('He is a considerate man.', ['considerable'])).toEqual(
      [],
    );
  });

  it('does not match a word merely contained in another', () => {
    expect(findReused('We restarted the run.', ['art'])).toEqual([]);
  });

  it('handles an empty bank and empty text', () => {
    expect(findReused('Anything at all.', [])).toEqual([]);
    expect(findReused('   ', ['substantial'])).toEqual([]);
  });
});

describe('maskLemma', () => {
  it('hides the word the drill is asking for', () => {
    expect(maskLemma('The results were substantial.', 'substantial')).toBe(
      'The results were _____.',
    );
  });

  it('hides it in the form the sentence actually used', () => {
    expect(maskLemma('She studied it for years.', 'study')).toBe(
      'She _____ it for years.',
    );
  });

  it('keeps the punctuation the sentence needs to parse', () => {
    expect(maskLemma('Substantial, yes, but untested.', 'substantial')).toBe(
      '_____, yes, but untested.',
    );
  });

  it('leaves every other word alone', () => {
    expect(maskLemma('The substance was substantial.', 'substantial')).toBe(
      'The substance was _____.',
    );
  });

  it('preserves the spacing it was given', () => {
    expect(maskLemma('a  big   gap', 'big')).toBe('a  _____   gap');
  });

  it('returns the sentence untouched when the word is not in it', () => {
    expect(maskLemma('Nothing to see.', 'substantial')).toBe('Nothing to see.');
  });
});
