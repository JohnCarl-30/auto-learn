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
import { toast } from 'sonner';
import {
  ApiFailure,
  fetchCardStream,
  proposeStream,
  reportEvent,
  type ProposePreview,
} from './api';
import { bankWord, recordReuse } from './bank';
import type { CardState } from '@/components/word-card';

export type ReviewState =
  | { status: 'idle' }
  /** `preview` grows as the model writes. Nothing is built from it. */
  | { status: 'proposing'; preview: ProposePreview[] }
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
  /**
   * The paste, held here rather than inside the compose panel.
   *
   * The panel unmounts while a proposal is in flight, so anything it owned
   * itself came back empty when the request failed — losing work someone had
   * just typed, on the one path where they most need it back. The over-cap
   * refusal is the sharpest case: it exists to teach you to send less, which
   * it cannot do if the thing you were meant to trim is gone.
   */
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [card, setCard] = useState<CardState | null>(null);
  /** Bumped after every bank write so the bank view re-reads and grows. */
  const [bankVersion, setBankVersion] = useState(0);
  /** Banked words the writer just used again, unprompted. */
  const [reused, setReused] = useState<BankEntry[]>([]);
  /** Whether the open lookup card has been saved to the bank. */
  const [saved, setSaved] = useState(false);

  const submit = useCallback(
    async (text: string, option: TransformOption) => {
      setOpen(null);
      setCard(null);
      setReused([]);
      setState({ status: 'proposing', preview: [] });
      try {
        // Checked before the model runs: this is plain string matching against
        // the bank, and it costs nothing.
        const hits = await recordReuse(text);
        if (hits.length > 0) {
          setReused(hits);
          setBankVersion((v) => v + 1);
        }

        const response = await proposeStream({ text, option }, (preview) => {
          // Appended, never reconciled. These events are what the wait looks
          // like; the payload that arrives at the end is what it *is*, and
          // mixing the two is how a preview bug becomes a review bug.
          setState((current) =>
            current.status === 'proposing'
              ? { ...current, preview: [...current.preview, preview] }
              : current,
          );
        });

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
    async (target: OpenTarget, request: Parameters<typeof fetchCardStream>[0]) => {
      setOpen(target);
      setSaved(false);
      setCard({ status: 'loading' });
      try {
        const response = await fetchCardStream(request, (partial) => {
          // Appended, never reconciled — the payload below is the card, and
          // this is only what the wait looks like.
          setCard({ status: 'streaming', partial });
        });
        setCard({ status: 'ready', response });

        // Deliberately does *not* bank here. Tapping a word is often just
        // checking one you already know, and an auto-banked word you cannot
        // undo fills the bank with noise — the bank is the retention
        // mechanic, so its contents have to be words you chose.
        // Accepting a gate banks (below); a lookup banks only if you say so.
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
      );
    },
    [load, state],
  );

  /** Banks a word the reader looked up and decided was worth keeping. */
  const saveLookup = useCallback(async () => {
    if (card?.status !== 'ready' || card.response.kind !== 'card') return;
    if (state.status !== 'reviewing' || !open) return;

    const sentenceText =
      state.response.sentences[open.sentenceIndex]?.text ?? '';

    await bankWord(card.response.card, sentenceText, 'tapped');
    setBankVersion((v) => v + 1);
    setSaved(true);
    toast.success(`Saved ${card.response.card.word} to your bank`);
  }, [card, open, state]);

  const dismiss = useCallback(() => {
    setOpen(null);
    setCard(null);
    setSaved(false);
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
        const { word } = card.response.card;
        void bankWord(card.response.card, sentenceText, 'accepted').then(() => {
          setBankVersion((v) => v + 1);
          // Accepting banks the word silently; the only sign was a number
          // ticking up far below the fold.
          toast.success(`Saved ${word} to your bank`);
        });
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
    // Start over is a deliberate request for a blank page; a failed request
    // is not. Only the first clears the draft.
    setDraft('');
    setState({ status: 'idle' });
  }, []);

  return {
    state,
    open,
    card,
    draft,
    setDraft,
    bankVersion,
    reused,
    saved,
    saveLookup,
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
