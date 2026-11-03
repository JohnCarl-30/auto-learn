jest.mock('@/lib/api', () => ({
  // A real class, so the hook's `instanceof` check behaves as in the app.
  ApiFailure: class ApiFailure extends Error {
    constructor(readonly detail: { code: string; message: string }) {
      super(detail.message);
    }
  },
  lessonWord: jest.fn(),
  lessonFeedback: jest.fn(),
  fetchCard: jest.fn(),
}));
jest.mock('@/lib/lesson-client', () => ({
  LessonRequestFailed: class LessonRequestFailed extends Error {
    constructor(readonly status: number) {
      super(`refused with ${status}`);
    }
  },
  fetchProgress: jest.fn(),
  completeLesson: jest.fn(),
  answerReview: jest.fn(),
}));
jest.mock('@/lib/bank', () => ({
  listBank: jest.fn(),
  knownWords: jest.fn(),
  bankWord: jest.fn(),
}));
jest.mock('@/lib/sync', () => ({ syncBank: jest.fn() }));

import { act, renderHook, waitFor } from '@testing-library/react';
import type {
  BankEntry,
  LessonFeedbackResponse,
  LessonProgress,
} from '@auto-learn/shared';
import { fetchCard, lessonFeedback, lessonWord } from '@/lib/api';
import {
  LessonRequestFailed,
  answerReview,
  completeLesson,
  fetchProgress,
} from '@/lib/lesson-client';
import { bankWord, knownWords, listBank } from '@/lib/bank';
import { syncBank } from '@/lib/sync';
import { useLesson } from './use-lesson';

const progress = (over: Partial<LessonProgress> = {}): LessonProgress => ({
  xp: 0,
  streak: 0,
  doneToday: 0,
  counts: {},
  highestUnlocked: 1,
  pathFinished: false,
  recentPromptIds: [],
  dueEntryIds: [],
  ...over,
});

// Only the fields the hook reads; the rest of a bank entry is irrelevant here.
const entry = (over: Partial<BankEntry>) =>
  ({ id: 'argue:1', lemma: 'argue', definition: 'to give reasons', sourceSentence: '', ...over }) as BankEntry;

const feedback = (over: Partial<LessonFeedbackResponse> = {}): LessonFeedbackResponse => ({
  firstSentence: 'We should argue less.',
  pointFirst: true,
  pointFirstNote: '',
  parts: [],
  structureNote: '',
  wordUse: null,
  reviewedText: null,
  review: null,
  ...over,
});

const mocked = <T extends (...args: never[]) => unknown>(fn: T) => fn as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mocked(syncBank).mockResolvedValue({ total: 0, syncedAt: '' });
  mocked(fetchProgress).mockResolvedValue(progress());
  mocked(listBank).mockResolvedValue([]);
  mocked(knownWords).mockResolvedValue([]);
  mocked(lessonWord).mockResolvedValue({ word: null });
  mocked(answerReview).mockResolvedValue(undefined);
});

describe('useLesson', () => {
  it('syncs before reading progress', async () => {
    const order: string[] = [];
    mocked(syncBank).mockImplementation(async () => {
      order.push('sync');
      return { total: 0, syncedAt: '' };
    });
    mocked(fetchProgress).mockImplementation(async () => {
      order.push('progress');
      return progress();
    });

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('speak'));
    expect(order).toEqual(['sync', 'progress']);
  });

  it('starts at review when words are due, with the masked sentence as cue', async () => {
    mocked(listBank).mockResolvedValue([entry({ sourceSentence: 'We argue a lot.' })]);
    mocked(fetchProgress).mockResolvedValue(progress({ dueEntryIds: ['argue:1', 'gone:1'] }));

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('review'));

    // `gone:1` has no local entry, so it is dropped rather than shown blank.
    expect(result.current.reviews).toEqual([
      { entryId: 'argue:1', lemma: 'argue', cue: 'We _____ a lot.', cueIsDefinition: false },
    ]);
  });

  it('falls back to the definition when the sentence is empty', async () => {
    mocked(listBank).mockResolvedValue([entry({ sourceSentence: '' })]);
    mocked(fetchProgress).mockResolvedValue(progress({ dueEntryIds: ['argue:1'] }));

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('review'));

    expect(result.current.reviews[0]).toMatchObject({
      cue: 'to give reasons',
      cueIsDefinition: true,
    });
  });

  it('skips review when nothing is due and word when none is suggested', async () => {
    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('speak'));

    expect(result.current.word).toBeNull();
    expect(result.current.unit?.id).toBe(1);
    expect(result.current.prompt?.id).toBe('u1-01');
  });

  it('checks a review answer locally, records it, and moves on to the word', async () => {
    mocked(listBank).mockResolvedValue([entry({ sourceSentence: 'We argue a lot.' })]);
    mocked(fetchProgress).mockResolvedValue(progress({ dueEntryIds: ['argue:1'] }));
    mocked(lessonWord).mockResolvedValue({ word: { word: 'concise', definition: 'short' } });

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('review'));

    let right = false;
    await act(async () => {
      right = await result.current.answerReview('argued');
    });
    expect(right).toBe(true);
    expect(answerReview).toHaveBeenCalledWith({ entryId: 'argue:1', right: true });

    act(() => result.current.advanceReview());
    expect(result.current.step).toBe('word');
    act(() => result.current.continueToSpeak());
    expect(result.current.step).toBe('speak');
  });

  it('uses a random unit after the path is finished', async () => {
    mocked(fetchProgress).mockResolvedValue(
      progress({ highestUnlocked: 7, pathFinished: true }),
    );
    // 0.45 * 7 units = index 3, so unit 4.
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.45);

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('speak'));
    random.mockRestore();

    expect(result.current.unit?.id).toBe(4);
  });

  it('honours a chosen unit only when it is unlocked', async () => {
    mocked(fetchProgress).mockResolvedValue(progress({ highestUnlocked: 2 }));

    const { result } = renderHook(() => useLesson(5));
    await waitFor(() => expect(result.current.step).toBe('speak'));

    expect(result.current.unit?.id).toBe(2);
  });

  it('asks the learner to sign in when progress is refused', async () => {
    mocked(fetchProgress).mockRejectedValue(new LessonRequestFailed(401));

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('error'));

    expect(result.current.error).toMatch(/sign in/i);
  });

  it('banks the word after a correct use', async () => {
    mocked(lessonWord).mockResolvedValue({ word: { word: 'argue', definition: 'x' } });
    mocked(lessonFeedback).mockResolvedValue(
      feedback({
        wordUse: 'correct',
        reviewedText: 'We should argue less.',
        review: { sessionId: 's1', sentences: [] },
      }),
    );
    const card = { word: 'argue', lemma: 'argue' };
    mocked(fetchCard).mockResolvedValue({ kind: 'card', card, replacement: null, alternative: null });
    mocked(bankWord).mockResolvedValue(entry({}));

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('word'));
    act(() => result.current.continueToSpeak());

    await act(async () => {
      await result.current.submitAnswer('Um, we should argue less.', 12);
    });

    expect(result.current.step).toBe('feedback');
    expect(result.current.attempts[0]).toMatchObject({ seconds: 12, fillers: { total: 1 } });
    expect(fetchCard).toHaveBeenCalledWith({
      kind: 'lookup',
      sessionId: 's1',
      sentenceIndex: 0,
      word: 'argue',
    });
    await waitFor(() => expect(result.current.bankedWord).toBe(true));
    expect(bankWord).toHaveBeenCalledWith(card, 'Um, we should argue less.', 'accepted');
  });

  it('keeps the learner on speak with an error when feedback fails', async () => {
    const { ApiFailure } = jest.requireMock('@/lib/api');
    mocked(lessonFeedback).mockRejectedValue(
      new ApiFailure({ code: 'upstream_failed', message: 'The model is down.' }),
    );

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('speak'));
    await act(async () => {
      await result.current.submitAnswer('An answer.', 5);
    });

    expect(result.current.step).toBe('speak');
    expect(result.current.error).toBe('The model is down.');
    expect(result.current.attempts).toHaveLength(0);
  });

  it('finish reports retried and wordCorrect', async () => {
    mocked(lessonWord).mockResolvedValue({ word: { word: 'argue', definition: 'x' } });
    mocked(lessonFeedback)
      .mockResolvedValueOnce(feedback({ wordUse: 'unused' }))
      .mockResolvedValueOnce(feedback({ wordUse: 'correct' }));
    const after = progress({ xp: 20, doneToday: 1 });
    mocked(completeLesson).mockResolvedValue(after);

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('word'));
    act(() => result.current.continueToSpeak());

    await act(async () => {
      await result.current.submitAnswer('First go.', 10);
    });
    expect(result.current.canRetry).toBe(true);
    act(() => result.current.retry());
    await act(async () => {
      await result.current.submitAnswer('Second go, argue.', 8);
    });
    expect(result.current.attempts).toHaveLength(2);
    expect(result.current.canRetry).toBe(false);

    await act(async () => {
      await result.current.finish();
    });

    expect(completeLesson).toHaveBeenCalledWith({
      unit: 1,
      promptId: 'u1-01',
      wordCorrect: true,
      retried: true,
    });
    expect(result.current.step).toBe('done');
    expect(result.current.progress).toEqual(after);
  });

  it('treats a failed finish as done when progress shows it counted', async () => {
    mocked(lessonFeedback).mockResolvedValue(feedback());
    mocked(completeLesson).mockRejectedValue(new LessonRequestFailed(503));
    // The hook logs the refusal; expected here, so kept out of the output.
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('speak'));
    await act(async () => {
      await result.current.submitAnswer('An answer.', 5);
    });

    // The insert landed and only the read after it failed: xp has moved.
    mocked(fetchProgress).mockResolvedValue(progress({ xp: 10, doneToday: 1 }));
    await act(async () => {
      await result.current.finish();
    });

    expect(completeLesson).toHaveBeenCalledTimes(1);
    expect(result.current.step).toBe('done');
    expect(result.current.progress?.xp).toBe(10);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('surfaces a failed finish that did not count, without retrying it', async () => {
    mocked(lessonFeedback).mockResolvedValue(feedback());
    mocked(completeLesson).mockRejectedValue(new LessonRequestFailed(503));
    // The hook logs the refusal; expected here, so kept out of the output.
    const logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const { result } = renderHook(() => useLesson());
    await waitFor(() => expect(result.current.step).toBe('speak'));
    await act(async () => {
      await result.current.submitAnswer('An answer.', 5);
    });
    await act(async () => {
      await result.current.finish();
    });

    expect(completeLesson).toHaveBeenCalledTimes(1);
    expect(result.current.step).toBe('feedback');
    expect(result.current.error).not.toBeNull();
    logged.mockRestore();
  });
});
