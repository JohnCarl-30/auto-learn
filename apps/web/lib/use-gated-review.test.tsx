jest.mock('@/lib/api', () => ({
  ApiFailure: class ApiFailure extends Error {
    constructor(readonly detail: { code: string; message: string }) {
      super(detail.message);
    }
  },
  fetchCardStream: jest.fn(),
  reportEvent: jest.fn(),
}));
jest.mock('@/lib/bank', () => ({ bankWord: jest.fn() }));

import { act, renderHook } from '@testing-library/react';
import type { CardResponse, ProposeResponse, WordCard } from '@auto-learn/shared';
import { fetchCardStream } from '@/lib/api';
import { bankWord } from '@/lib/bank';
import { useGatedReview } from './use-gated-review';

const openCard = fetchCardStream as jest.Mock;
const save = bankWord as jest.Mock;

const SENTENCE = 'The essay is very big.';

const review: ProposeResponse = {
  sessionId: 'session-1',
  sentences: [
    {
      index: 0,
      original: SENTENCE,
      text: SENTENCE,
      silentFixes: [],
      gated: [
        {
          id: 'gate-1',
          type: 'word-choice',
          original: 'very big',
          start: 13,
          end: 21,
          teaser: 'stronger word available',
        },
      ],
    },
  ],
};

const substantial: WordCard = {
  word: 'substantial',
  lemma: 'substantial',
  partOfSpeech: 'adjective',
  definition: 'large in size or amount',
  senseId: '1',
  synonyms: [
    { word: 'large', nuance: 'plainer' },
    { word: 'sizeable', nuance: 'informal' },
  ],
  useCases: ['one', 'two'],
  register: 'neutral',
  whyHere: null,
  pronunciation: { ipa: null, audioUrl: null },
};

const ready: CardResponse = {
  kind: 'card',
  card: substantial,
  replacement: 'substantial',
  alternative: null,
};

beforeEach(() => {
  openCard.mockReset().mockResolvedValue(ready);
  save.mockReset().mockResolvedValue(undefined);
});

describe('useGatedReview', () => {
  it('opens a gate as a suggestion card from the review session', async () => {
    const { result } = renderHook(() => useGatedReview(review));

    await act(async () => result.current.openGate(0, 'gate-1'));

    expect(openCard).toHaveBeenCalledWith(
      { kind: 'suggestion', sessionId: 'session-1', suggestionId: 'gate-1' },
      expect.any(Function),
    );
    expect(result.current.open).toEqual({ sentenceIndex: 0, suggestionId: 'gate-1' });
    expect(result.current.card).toEqual({ status: 'ready', response: ready });
  });

  it('applies the replacement on accept and banks the word with the sentence', async () => {
    const { result } = renderHook(() => useGatedReview(review));
    await act(async () => result.current.openGate(0, 'gate-1'));

    act(() => result.current.accept('substantial'));

    // Banked with the sentence as the learner said it, which is the cue a
    // later review masks.
    expect(save).toHaveBeenCalledWith(substantial, SENTENCE, 'accepted');
    expect(result.current.review.sentences[0].text).toBe('The essay is substantial.');
    expect(result.current.review.sentences[0].gated).toEqual([]);
    expect(result.current.card).toBeNull();
  });

  it('drops the gate on reject and keeps the sentence', async () => {
    const { result } = renderHook(() => useGatedReview(review));
    await act(async () => result.current.openGate(0, 'gate-1'));

    act(() => result.current.reject());

    expect(result.current.review.sentences[0].text).toBe(SENTENCE);
    expect(result.current.review.sentences[0].gated).toEqual([]);
    expect(save).not.toHaveBeenCalled();
  });
});
