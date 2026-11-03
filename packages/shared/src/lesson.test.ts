import { describe, expect, it } from 'vitest';
import {
  countFillers,
  isRecallCorrect,
  LessonCompleteRequest,
  LessonFeedbackRequest,
  LessonProgress,
  MAX_ANSWER_CHARS,
  ReviewAnswerRequest,
} from './lesson';

describe('countFillers', () => {
  it('counts spoken fillers, multi-word ones included', () => {
    expect(countFillers('Um, so, you know, I think uh it works')).toEqual({
      total: 3,
      byWord: { um: 1, 'you know': 1, uh: 1 },
    });
  });

  it('counts Taglish fillers', () => {
    expect(countFillers('Parang, ano, the build failed').total).toBe(2);
  });

  it('does not count "like" as a verb or preposition', () => {
    expect(countFillers('I like coffee, and it looks like rain').total).toBe(0);
  });

  it('counts comma-set "like"', () => {
    expect(countFillers('It was, like, huge. Like, really huge').byWord.like).toBe(2);
  });

  it('counts "like" with a comma after it and none before', () => {
    expect(countFillers('It was like, huge').byWord.like).toBe(1);
  });

  it('does not count a comma-led "like" that introduces an example', () => {
    expect(countFillers('I enjoy things, like coffee and tea').total).toBe(0);
  });

  it('counts "like," at the very start, and not the end of a hyphenated word', () => {
    expect(countFillers('Like, it was child-like, honestly').byWord).toEqual({ like: 1 });
  });

  it('does not count a filler inside a longer word', () => {
    expect(countFillers('The anomaly was humming, and her errand was ahead').total).toBe(0);
  });

  it('counts a multi-word filler split across lines once, under its canonical name', () => {
    expect(countFillers('You\nknow, it works').byWord).toEqual({ 'you know': 1 });
  });

  it('is zero for an empty transcript', () => {
    expect(countFillers('')).toEqual({ total: 0, byWord: {} });
  });
});

describe('isRecallCorrect', () => {
  it('accepts the lemma and its inflections, any case, trimmed', () => {
    expect(isRecallCorrect(' Argue ', 'argue')).toBe(true);
    expect(isRecallCorrect('argued', 'argue')).toBe(true);
  });

  it('rejects other words and empty answers', () => {
    expect(isRecallCorrect('agree', 'argue')).toBe(false);
    expect(isRecallCorrect('', 'argue')).toBe(false);
  });
});

describe('LessonFeedbackRequest', () => {
  it('rejects an answer over MAX_ANSWER_CHARS and a unit outside 1–7', () => {
    const base = { unit: 1, promptId: 'u1-01', answer: 'Hi.', word: null };
    expect(LessonFeedbackRequest.safeParse(base).success).toBe(true);
    expect(
      LessonFeedbackRequest.safeParse({ ...base, answer: 'a'.repeat(MAX_ANSWER_CHARS + 1) })
        .success,
    ).toBe(false);
    expect(LessonFeedbackRequest.safeParse({ ...base, unit: 8 }).success).toBe(false);
  });
});

describe('LessonCompleteRequest', () => {
  it('rejects a unit outside 1–7 and an empty prompt id', () => {
    const base = { unit: 1, promptId: 'u1-01', wordCorrect: true, retried: false };
    expect(LessonCompleteRequest.safeParse(base).success).toBe(true);
    expect(LessonCompleteRequest.safeParse({ ...base, unit: 0 }).success).toBe(false);
    expect(LessonCompleteRequest.safeParse({ ...base, promptId: '' }).success).toBe(false);
  });
});

describe('ReviewAnswerRequest', () => {
  it('rejects an empty entry id', () => {
    expect(ReviewAnswerRequest.safeParse({ entryId: 'argue:1', right: true }).success).toBe(true);
    expect(ReviewAnswerRequest.safeParse({ entryId: '', right: true }).success).toBe(false);
  });
});

describe('LessonProgress', () => {
  const sample = {
    xp: 40,
    streak: 3,
    doneToday: 2,
    counts: { '1': 5, '2': 1 },
    highestUnlocked: 2,
    pathFinished: false,
    recentPromptIds: ['u2-01', 'u1-05'],
    dueEntryIds: ['argue:1', 'cite:1', 'weigh:1'],
  };

  it('parses a full sample', () => {
    expect(LessonProgress.safeParse(sample).success).toBe(true);
  });

  it('rejects more than three due entries, and more than twenty recent prompts', () => {
    expect(
      LessonProgress.safeParse({ ...sample, dueEntryIds: [...sample.dueEntryIds, 'x:1'] }).success,
    ).toBe(false);
    expect(
      LessonProgress.safeParse({
        ...sample,
        recentPromptIds: Array.from({ length: 21 }, (_, i) => `u1-${i}`),
      }).success,
    ).toBe(false);
  });
});
