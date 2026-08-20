import { describe, expect, it } from 'vitest';
import { joinDictation } from './dictate';

describe('joinDictation', () => {
  it('uses the transcript alone when nothing was typed', () => {
    expect(joinDictation('', 'The evidence was substantial.')).toBe(
      'The evidence was substantial.',
    );
  });

  /**
   * The bug this exists to prevent: replacing rather than appending destroys
   * typed work, and a programmatic value change on a controlled textarea does
   * not push a browser undo entry, so there is no way to get it back.
   */
  it('keeps what was already typed', () => {
    expect(joinDictation('I wrote this myself.', 'And I said this.')).toBe(
      'I wrote this myself. And I said this.',
    );
  });

  it('does not double the space when the draft already ends in one', () => {
    expect(joinDictation('I wrote this. ', 'And this.')).toBe(
      'I wrote this. And this.',
    );
  });

  it('trims the transcript rather than trusting it', () => {
    expect(joinDictation('First.', '  Second.  ')).toBe('First. Second.');
  });

  /**
   * Deliberately not "First. Second." — a full stop we added is a word the
   * speaker did not say, and this product's whole job is being right about
   * what someone wrote.
   */
  it('does not invent punctuation between a fragment and the transcript', () => {
    expect(joinDictation('First', 'second')).toBe('First second');
  });

  it('leaves the draft untouched when nothing was heard', () => {
    expect(joinDictation('I wrote this.', '   ')).toBe('I wrote this.');
  });
});
