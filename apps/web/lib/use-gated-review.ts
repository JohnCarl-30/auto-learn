'use client';

import { useCallback, useState } from 'react';
import {
  applyReplacement,
  dismissSuggestion,
  type ApiError,
  type ProposeResponse,
} from '@auto-learn/shared';
import { toast } from 'sonner';
import { ApiFailure, fetchCardStream, reportEvent } from './api';
import { bankWord } from './bank';
import type { CardState } from '@/components/word-card';

/** Which gate or word is open, so the card renders under its sentence. */
type OpenTarget = { sentenceIndex: number; suggestionId: string | null };

type Sentence = ProposeResponse['sentences'][number];

const toApiError = (error: unknown): ApiError =>
  error instanceof ApiFailure
    ? error.detail
    : { code: 'upstream_failed', message: 'Something went wrong.' };

/**
 * One reviewed answer with its gates working: the card behind a gate, the
 * rewrite on accept, the bank. It is `useConversation`'s card half for a single
 * review (a lesson's feedback has one, not a turn list), using the same shared
 * helpers, so the gate behaves here exactly as it does on /talk: nothing better
 * is shown until the card is open.
 *
 * The review is held in state because accepting and rejecting rewrite it. The
 * initial value is read once, so a new review means a new mount (the caller
 * keys on the attempt).
 */
export function useGatedReview(initial: ProposeResponse) {
  const [review, setReview] = useState(initial);
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [card, setCard] = useState<CardState | null>(null);
  const [saved, setSaved] = useState(false);

  const dismiss = useCallback(() => {
    setOpen(null);
    setCard(null);
    setSaved(false);
  }, []);

  const load = useCallback(
    async (target: OpenTarget, request: Parameters<typeof fetchCardStream>[0]) => {
      setOpen(target);
      setSaved(false);
      setCard({ status: 'loading' });
      try {
        const response = await fetchCardStream(request, (partial) =>
          setCard({ status: 'streaming', partial }),
        );
        setCard({ status: 'ready', response });
      } catch (failure) {
        setCard({ status: 'error', error: toApiError(failure) });
      }
    },
    [],
  );

  const openGate = useCallback(
    (sentenceIndex: number, suggestionId: string) =>
      load(
        { sentenceIndex, suggestionId },
        { kind: 'suggestion', sessionId: review.sessionId, suggestionId },
      ),
    [load, review.sessionId],
  );

  const lookup = useCallback(
    (sentenceIndex: number, word: string) => {
      if (!word) return;
      void load(
        { sentenceIndex, suggestionId: null },
        { kind: 'lookup', sessionId: review.sessionId, sentenceIndex, word },
      );
    },
    [load, review.sessionId],
  );

  /** Rewrites the open sentence and nothing else. */
  const rewrite = useCallback(
    (sentenceIndex: number, change: (sentence: Sentence) => Sentence) =>
      setReview((current) => ({
        ...current,
        sentences: current.sentences.map((sentence, index) =>
          index === sentenceIndex ? change(sentence) : sentence,
        ),
      })),
    [],
  );

  const sentenceText = (target: OpenTarget) => review.sentences[target.sentenceIndex]?.text ?? '';

  /** As on /talk: show the sentence as it would have been said, and bank the word. */
  const accept = (replacement: string) => {
    const target = open;
    if (!target?.suggestionId) return;
    reportEvent('suggestion_accepted');

    if (card?.status === 'ready' && card.response.kind === 'card') {
      const { word } = card.response.card;
      void bankWord(card.response.card, sentenceText(target), 'accepted').then(() =>
        toast.success(`Saved ${word} to your bank`),
      );
    }

    rewrite(target.sentenceIndex, (sentence) =>
      applyReplacement(sentence, target.suggestionId!, replacement),
    );
    dismiss();
  };

  const reject = () => {
    const target = open;
    if (!target?.suggestionId) return;
    reportEvent('suggestion_rejected');
    rewrite(target.sentenceIndex, (sentence) =>
      dismissSuggestion(sentence, target.suggestionId!),
    );
    dismiss();
  };

  const saveLookup = async () => {
    if (card?.status !== 'ready' || card.response.kind !== 'card' || !open) return;
    await bankWord(card.response.card, sentenceText(open), 'tapped');
    setSaved(true);
    toast.success(`Saved ${card.response.card.word} to your bank`);
  };

  return { review, open, card, saved, openGate, lookup, accept, reject, saveLookup, dismiss };
}
