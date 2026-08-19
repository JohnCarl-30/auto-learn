import { describe, expect, it } from 'vitest';
import { curlyQuotes } from './text';

describe('curlyQuotes', () => {
  it('pairs quotes nested inside a sentence', () => {
    expect(curlyQuotes('Precise where "very big" only sounds emphatic.')).toBe(
      'Precise where “very big” only sounds emphatic.',
    );
  });

  it('handles a quote at the start of the line', () => {
    expect(curlyQuotes('"results" is plural.')).toBe('“results” is plural.');
  });

  it('keeps an apostrophe inside a word as an apostrophe', () => {
    expect(curlyQuotes("the writer's own words")).toBe('the writer’s own words');
    expect(curlyQuotes("isn't")).toBe('isn’t');
  });

  it('leaves prose without quotes untouched', () => {
    expect(curlyQuotes('Large in amount, size or importance.')).toBe(
      'Large in amount, size or importance.',
    );
  });

  it('handles multiple quoted spans', () => {
    expect(curlyQuotes('Use "this" not "that".')).toBe(
      'Use “this” not “that”.',
    );
  });
});
