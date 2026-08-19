'use client';

import { useCallback, useState } from 'react';
import {
  applyReplacement,
  dismissSuggestion,
  type ApiError,
  type BankEntry,
  type ProposeResponse,
  type TransformOption,
} from '@auto-learn/shared';
import { ApiFailure, fetchCard, propose, reportEvent } from './api';
import { bankWord, recordReuse } from './bank';
import type { CardState } from '@/components/word-card';

export type ReviewState =
  | { status: 'idle' }
  | { status: 'proposing' }
  | { status: 'reviewing'; response: ProposeResponse; focused: number }
  | { status: 'error'; error: ApiError };

/** Which gate or word is open, so the card renders under the right sentence. */
type OpenTarget = {
  sentenceIndex: number;
  suggestionId: string | null;
};

const toApiError = (error: unknown): ApiError =>
  error instanceof ApiFailure
    ? error.detail
    : { code: 'upstream_failed', message: 'Something went wrong.' };

export function useReview() {
  const [state, setState] = useState<ReviewState>({ status: 'idle' });
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [card, setCard] = useState<CardState | null>(null);
  /** Bumped after every bank write so the bank view re-reads and grows. */
  const [bankVersion, setBankVersion] = useState(0);
  /** Banked words the writer just used again, unprompted. */
  const [reused, setReused] = useState<BankEntry[]>([]);

  const submit = useCallback(
    async (text: string, option: TransformOption) => {
      setOpen(null);
      setCard(null);
      setReused([]);
      setState({ status: 'proposing' });
      try {
        // Checked before the model runs: this is plain string matching against
        // the bank, and it costs nothing.
        const hits = await recordReuse(text);
        if (hits.length > 0) {
          setReused(hits);
          setBankVersion((v) => v + 1);
        }

        const response = await propose({ text, option });
        setState({ status: 'reviewing', response, focused: 0 });
      } catch (error) {
        setState({ status: 'error', error: toApiError(error) });
      }
    },
    [],
  );

  const focus = useCallback((index: number) => {
    setOpen(null);
    setCard(null);
    setState((current) =>
      current.status === 'reviewing' ? { ...current, focused: index } : current,
    );
  }, []);

  const load = useCallback(
    async (
      target: OpenTarget,
      request: Parameters<typeof fetchCard>[0],
      sentenceText: string,
    ) => {
      setOpen(target);
      setCard({ status: 'loading' });
      try {
        const response = await fetchCard(request);
        setCard({ status: 'ready', response });

        // Looking a word up is a deliberate act, so it banks on sight. A gate
        // does not — accepting it does, below. Grammar notes never bank:
        // a corrected verb is not vocabulary you learned.
        if (response.kind === 'card' && target.suggestionId === null) {
          await bankWord(response.card, sentenceText, 'tapped');
          setBankVersion((v) => v + 1);
        }
      } catch (error) {
        setCard({ status: 'error', error: toApiError(error) });
      }
    },
    [],
  );

  const openGate = useCallback(
    (sentenceIndex: number, suggestionId: string) => {
      if (state.status !== 'reviewing') return;
      void load(
        { sentenceIndex, suggestionId },
        {
          kind: 'suggestion',
          sessionId: state.response.sessionId,
          suggestionId,
        },
        state.response.sentences[sentenceIndex]?.text ?? '',
      );
    },
    [load, state],
  );

  const lookup = useCallback(
    (sentenceIndex: number, word: string) => {
      if (state.status !== 'reviewing' || !word) return;
      void load(
        { sentenceIndex, suggestionId: null },
        {
          kind: 'lookup',
          sessionId: state.response.sessionId,
          sentenceIndex,
          word,
        },
        state.response.sentences[sentenceIndex]?.text ?? '',
      );
    },
    [load, state],
  );

  const dismiss = useCallback(() => {
    setOpen(null);
    setCard(null);
  }, []);

  /** Splices the accepted wording in and drops the marker. */
  const accept = useCallback(
    (replacement: string) => {
      const target = open;
      if (!target?.suggestionId) return;

      const sentenceText =
        state.status === 'reviewing'
          ? (state.response.sentences[target.sentenceIndex]?.text ?? '')
          : '';

      reportEvent('suggestion_accepted');

      if (card?.status === 'ready' && card.response.kind === 'card') {
        void bankWord(card.response.card, sentenceText, 'accepted').then(() =>
          setBankVersion((v) => v + 1),
        );
      }

      setState((current) => {
        if (current.status !== 'reviewing') return current;
        return {
          ...current,
          response: {
            ...current.response,
            sentences: current.response.sentences.map((sentence, index) =>
              index === target.sentenceIndex
                ? applyReplacement(sentence, target.suggestionId!, replacement)
                : sentence,
            ),
          },
        };
      });

      dismiss();
    },
    [card, dismiss, open, state],
  );

  /** The user's wording stands; the marker goes away. */
  const reject = useCallback(() => {
    const target = open;
    if (!target?.suggestionId) return;

    reportEvent('suggestion_rejected');

    setState((current) => {
      if (current.status !== 'reviewing') return current;
      return {
        ...current,
        response: {
          ...current.response,
          sentences: current.response.sentences.map((sentence, index) =>
            index === target.sentenceIndex
              ? dismissSuggestion(sentence, target.suggestionId!)
              : sentence,
          ),
        },
      };
    });

    dismiss();
  }, [dismiss, open]);

  const reset = useCallback(() => {
    setOpen(null);
    setCard(null);
    setReused([]);
    setState({ status: 'idle' });
  }, []);

  return {
    state,
    open,
    card,
    bankVersion,
    reused,
    submit,
    focus,
    openGate,
    lookup,
    accept,
    reject,
    dismiss,
    reset,
  };
}
