'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  SCENARIO_OPENERS,
  applyReplacement,
  dismissSuggestion,
  recentTurns,
  type ApiError,
  type ConverseTurn,
  type FeedbackSkipped,
  type ProposeResponse,
  type Scenario,
} from '@auto-learn/shared';
import { toast } from 'sonner';
import {
  ApiFailure,
  converse,
  fetchCardStream,
  reportEvent,
} from './api';
import { bankWord, knownWords } from './bank';
import type { CardState } from '@/components/word-card';

export type PartnerTurn = { id: string; role: 'partner'; text: string };

export type LearnerTurn = {
  id: string;
  role: 'learner';
  /** Exactly what was sent, which is what the partner answered. */
  said: string;
  /** The turn reviewed as a paste would be. Gates on it open real cards. */
  review: ProposeResponse | null;
  skipped: FeedbackSkipped | null;
};

export type Turn = PartnerTurn | LearnerTurn;

/** Which gate or word is open, so the card renders under the right turn. */
type OpenTarget = {
  turnId: string;
  sentenceIndex: number;
  suggestionId: string | null;
};

const toApiError = (error: unknown): ApiError =>
  error instanceof ApiFailure
    ? error.detail
    : { code: 'upstream_failed', message: 'Something went wrong.' };

let counter = 0;
const nextId = () => `turn-${Date.now()}-${counter++}`;

/** What the partner is sent: what each side actually said, corrections not applied. */
function asHistory(turns: Turn[]): ConverseTurn[] {
  return recentTurns(
    turns.map((turn) =>
      turn.role === 'partner'
        ? { role: 'partner', text: turn.text }
        : { role: 'learner', text: turn.said },
    ),
  );
}

function findLearner(turns: Turn[], turnId: string): LearnerTurn | undefined {
  return turns.find(
    (turn): turn is LearnerTurn => turn.id === turnId && turn.role === 'learner',
  );
}

function sentenceText(turns: Turn[], target: OpenTarget): string {
  return (
    findLearner(turns, target.turnId)?.review?.sentences[target.sentenceIndex]
      ?.text ?? ''
  );
}

type Sentence = ProposeResponse['sentences'][number];

/** An updater that rewrites one sentence of one learner turn and nothing else. */
function rewriteSentence(target: OpenTarget, change: (sentence: Sentence) => Sentence) {
  return (current: Turn[]): Turn[] =>
    current.map((turn) =>
      turn.id === target.turnId && turn.role === 'learner' && turn.review
        ? {
            ...turn,
            review: {
              ...turn.review,
              sentences: turn.review.sentences.map((sentence, index) =>
                index === target.sentenceIndex ? change(sentence) : sentence,
              ),
            },
          }
        : turn,
    );
}

export function useConversation({ onReply }: { onReply?: (text: string) => void } = {}) {
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  /**
   * The turn being composed, held here rather than in the composer for the
   * reason use-review gives for its draft: a turn that fails to send must come
   * back exactly as it was, so it can be said again without being re-recorded.
   */
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [open, setOpen] = useState<OpenTarget | null>(null);
  const [card, setCard] = useState<CardState | null>(null);
  const [saved, setSaved] = useState(false);
  /** Bumped after every bank write, as on the writing page. */
  const [bankVersion, setBankVersion] = useState(0);

  // Read inside the callbacks without rebuilding them every time a turn
  // arrives, the way use-dictation holds its transcript handler.
  const turnsRef = useRef(turns);
  const replyRef = useRef(onReply);
  useEffect(() => {
    turnsRef.current = turns;
    replyRef.current = onReply;
  }, [turns, onReply]);

  const dismiss = useCallback(() => {
    setOpen(null);
    setCard(null);
    setSaved(false);
  }, []);

  const start = useCallback(
    (next: Scenario) => {
      const opener = SCENARIO_OPENERS[next];
      dismiss();
      setError(null);
      setDraft('');
      setScenario(next);
      setTurns([{ id: nextId(), role: 'partner', text: opener }]);
      replyRef.current?.(opener);
    },
    [dismiss],
  );

  const end = useCallback(() => {
    dismiss();
    setError(null);
    setDraft('');
    setTurns([]);
    setScenario(null);
  }, [dismiss]);

  const send = useCallback(async () => {
    const utterance = draft.trim();
    if (!scenario || !utterance || pending) return;

    setPending(true);
    setError(null);
    try {
      // As on /propose: an unreadable bank costs a preference, not a turn.
      const known = await knownWords().catch(() => [] as string[]);
      const result = await converse({
        scenario,
        history: asHistory(turnsRef.current),
        utterance,
        known,
      });

      setTurns((current) => [
        ...current,
        {
          id: nextId(),
          role: 'learner',
          said: utterance,
          review: result.review,
          skipped: result.skipped,
        },
        { id: nextId(), role: 'partner', text: result.reply },
      ]);
      setDraft('');
      replyRef.current?.(result.reply);
    } catch (failure) {
      // The turn is not added and the draft stays: nothing was answered, so
      // nothing happened, and the learner can send the same words again.
      setError(toApiError(failure));
    } finally {
      setPending(false);
    }
  }, [draft, pending, scenario]);

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
    (turnId: string, sentenceIndex: number, suggestionId: string) => {
      const review = findLearner(turnsRef.current, turnId)?.review;
      if (!review) return;
      void load(
        { turnId, sentenceIndex, suggestionId },
        { kind: 'suggestion', sessionId: review.sessionId, suggestionId },
      );
    },
    [load],
  );

  const lookup = useCallback(
    (turnId: string, sentenceIndex: number, word: string) => {
      const review = findLearner(turnsRef.current, turnId)?.review;
      if (!review || !word) return;
      void load(
        { turnId, sentenceIndex, suggestionId: null },
        { kind: 'lookup', sessionId: review.sessionId, sentenceIndex, word },
      );
    },
    [load],
  );

  /**
   * Accepting shows the learner their own turn as a fluent speaker would have
   * said it, and banks the word — the same two things accepting does on the
   * writing page. What was sent to the partner is left alone: that is what was
   * actually said, and the conversation answered it.
   */
  const accept = useCallback(
    (replacement: string) => {
      const target = open;
      if (!target?.suggestionId) return;
      reportEvent('suggestion_accepted');

      if (card?.status === 'ready' && card.response.kind === 'card') {
        const { word } = card.response.card;
        void bankWord(
          card.response.card,
          sentenceText(turnsRef.current, target),
          'accepted',
        ).then(() => {
          setBankVersion((v) => v + 1);
          toast.success(`Saved ${word} to your bank`);
        });
      }

      setTurns(
        rewriteSentence(target, (sentence) =>
          applyReplacement(sentence, target.suggestionId!, replacement),
        ),
      );
      dismiss();
    },
    [card, dismiss, open],
  );

  const reject = useCallback(() => {
    const target = open;
    if (!target?.suggestionId) return;
    reportEvent('suggestion_rejected');
    setTurns(
      rewriteSentence(target, (sentence) =>
        dismissSuggestion(sentence, target.suggestionId!),
      ),
    );
    dismiss();
  }, [dismiss, open]);

  const saveLookup = useCallback(async () => {
    if (card?.status !== 'ready' || card.response.kind !== 'card' || !open) return;
    await bankWord(card.response.card, sentenceText(turnsRef.current, open), 'tapped');
    setBankVersion((v) => v + 1);
    setSaved(true);
    toast.success(`Saved ${card.response.card.word} to your bank`);
  }, [card, open]);

  return {
    scenario,
    turns,
    draft,
    setDraft,
    pending,
    error,
    open,
    card,
    saved,
    bankVersion,
    start,
    end,
    send,
    openGate,
    lookup,
    accept,
    reject,
    saveLookup,
    dismiss,
  };
}
