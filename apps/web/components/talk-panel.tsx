'use client';

import { useEffect, useRef, useState } from 'react';
import {
  LoaderCircleIcon,
  MicIcon,
  SendIcon,
  SquareIcon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react';
import {
  SCENARIO_HINTS,
  SCENARIO_LABELS,
  Scenario,
  joinDictation,
  type FeedbackSkipped,
} from '@auto-learn/shared';
import { Notice, toneFor } from '@/components/notice';
import { TeaserList } from '@/components/review-panel';
import { SentenceView } from '@/components/sentence-view';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { WordCard } from '@/components/word-card';
import { useConversation, type LearnerTurn } from '@/lib/use-conversation';
import { useDictation } from '@/lib/use-dictation';
import { usePartnerVoice } from '@/lib/use-partner-voice';

/** Why a turn has no feedback, said as what to do next. */
const SKIPPED_NOTES: Record<FeedbackSkipped, string> = {
  too_many_sentences:
    'That was a lot in one go. Your partner answered, but feedback covers up to three sentences a turn.',
  unavailable: "No feedback on this one — the review didn't come back. Your partner still answered.",
};

/**
 * The speaking partner: opens in "Just talk" with the opener ready, so the mic
 * is one press away; "Change" goes back to pick another room.
 *
 * Every turn the learner takes comes back reviewed under what they said, with
 * the same gates the writing page has. Nothing is corrected out loud — the
 * partner answers what you meant, and what a fluent speaker would have said is
 * there to open when you want it, not pressed on you mid-sentence.
 */
export function TalkPanel() {
  const voice = usePartnerVoice();
  const talk = useConversation({ onReply: (text) => voice.say(text) });

  // Appends, as the compose panel does: the transcript lands in the box to be
  // checked before it is sent, because an accented sentence misheard and then
  // reviewed is feedback on words nobody said.
  const dictation = useDictation((transcript) =>
    talk.setDraft(joinDictation(talk.draft, transcript)),
  );
  const recording = dictation.status === 'recording';
  const transcribing = dictation.status === 'transcribing';

  // Opening the app is opening a conversation: the first mount starts "Just
  // talk" so the learner lands one press from the mic. Only the first mount —
  // End and Change come back to the picker and must be left there. A ref, so
  // Strict Mode's second effect run does not start it twice. The opener is
  // shown but not spoken: nothing has been tapped yet, and iOS Safari and
  // Chrome only let speech start from a tap, so it would be silent or flaky.
  // "Hear that again" plays it; picking a room is a tap, so those do speak.
  const autoStarted = useRef(false);
  // Until that start has run, render nothing rather than flash the picker the
  // learner is not meant to see.
  const [settled, setSettled] = useState(false);
  const { start } = talk;
  useEffect(() => {
    if (autoStarted.current) return;
    autoStarted.current = true;
    start('free-talk', { speak: false });
    setSettled(true);
  }, [start]);

  if (!talk.scenario) {
    return settled ? <ScenarioPicker onPick={talk.start} /> : null;
  }

  const startRecording = () => {
    // The microphone would otherwise record the partner still speaking, and
    // the transcript would be the partner's sentence handed back as yours.
    voice.stop();
    void dictation.start();
  };

  return (
    <div className="space-y-6" data-testid="talk">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <span className="text-sm text-muted-foreground" data-testid="scenario">
            {SCENARIO_LABELS[talk.scenario]}
          </span>
          {/* Same way back to the picker as End; the name says what it is for. */}
          <Button variant="ghost" size="sm" onClick={talk.end} data-testid="change">
            Change
          </Button>
        </div>
        <div className="flex items-center gap-1">
          {voice.supported && (
            <Button
              variant="ghost"
              size="sm"
              data-testid="mute"
              aria-label={voice.muted ? 'Read replies aloud' : 'Stop reading replies aloud'}
              aria-pressed={voice.muted}
              onClick={voice.toggleMuted}
            >
              {voice.muted ? <VolumeXIcon /> : <Volume2Icon />}
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={talk.end} data-testid="end">
            End
          </Button>
        </div>
      </div>

      {talk.practiceWord && (
        // Polite: "You used it." arrives after the reply, and a screen reader
        // should hear it without being cut off mid-sentence.
        <p
          className="text-sm text-muted-foreground"
          data-testid="practice-word"
          aria-live="polite"
        >
          {talk.practiceWord.used ? (
            <>
              <span className="font-medium text-foreground">{talk.practiceWord.word}</span>
              {' — '}
              <span>You used it.</span>
              {talk.practiceWord.justBanked && (
                <>
                  {' '}
                  <span>Added to your bank.</span>
                </>
              )}
            </>
          ) : (
            <>
              Try using:{' '}
              <span className="font-medium text-foreground">{talk.practiceWord.word}</span>
              {' — '}
              {talk.practiceWord.definition}
            </>
          )}
        </p>
      )}

      <ol className="space-y-5" aria-label="Conversation">
        {talk.turns.map((turn) =>
          turn.role === 'partner' ? (
            <li key={turn.id} data-testid="partner-turn" className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Partner</p>
              <div className="flex items-start gap-2">
                <p className="flex-1 rounded-lg bg-muted px-3.5 py-2.5 leading-relaxed">
                  {turn.text}
                </p>
                {voice.supported && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Hear that again"
                    onClick={() => voice.say(turn.text, { force: true })}
                  >
                    <Volume2Icon />
                  </Button>
                )}
              </div>
            </li>
          ) : (
            <li key={turn.id} data-testid="learner-turn" className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">You</p>
              <LearnerTurnView turn={turn} talk={talk} />
            </li>
          ),
        )}
      </ol>

      {talk.pending && (
        <p role="status" className="text-sm text-muted-foreground" data-testid="thinking">
          Your partner is thinking…
        </p>
      )}

      {talk.error && (
        <Notice
          message={talk.error.message}
          tone={toneFor(talk.error.code)}
          testId="talk-notice"
        />
      )}

      {/*
        Stuck to the bottom of the screen so the mic and Send stay under the
        thumb however long the conversation gets. The inset keeps them clear of
        the home indicator in an installed iPhone app (and the floor of 0.5rem
        keeps them off the screen edge where there is no inset), and the
        background stops the transcript showing through as it scrolls under.
      */}
      <form
        className="sticky bottom-0 space-y-2 border-t bg-background pt-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
        onSubmit={(event) => {
          event.preventDefault();
          void talk.send();
        }}
      >
        <Textarea
          value={talk.draft}
          onChange={(event) => talk.setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends, as in any chat; Shift-Enter is a new line.
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void talk.send();
            }
          }}
          placeholder="Press the mic and answer, or type."
          rows={3}
          className="resize-none text-base leading-relaxed"
          aria-label="Your answer"
          data-testid="answer"
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted-foreground">
            {recording
              ? 'Listening…'
              : transcribing
                ? 'Writing that down…'
                : 'Check what I heard, then send.'}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              data-testid="talk-mic"
              variant={recording ? 'secondary' : 'outline'}
              size="sm"
              disabled={talk.pending || transcribing}
              aria-label={recording ? 'Stop recording' : 'Answer out loud'}
              onClick={() => (recording ? dictation.stop() : startRecording())}
            >
              {transcribing ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : recording ? (
                <SquareIcon />
              ) : (
                <MicIcon />
              )}
            </Button>
            <Button
              type="submit"
              size="sm"
              data-testid="send"
              disabled={talk.pending || recording || !talk.draft.trim()}
            >
              <SendIcon /> Send
            </Button>
          </div>
        </div>
        {dictation.problem && (
          <Notice
            message={dictation.problem.message}
            tone={dictation.problem.code ? toneFor(dictation.problem.code) : 'guidance'}
            testId="dictation-notice"
          />
        )}
      </form>
    </div>
  );
}

function ScenarioPicker({ onPick }: { onPick: (scenario: Scenario) => void }) {
  return (
    <div className="space-y-3" data-testid="scenarios">
      <p className="text-muted-foreground">
        Pick where you want to practise. Your partner speaks first.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {Scenario.options.map((scenario) => (
          <Button
            key={scenario}
            variant="outline"
            data-testid={`scenario-${scenario}`}
            onClick={() => onPick(scenario)}
            className="h-auto flex-col items-start gap-0.5 py-2 text-left whitespace-normal"
          >
            <span>{SCENARIO_LABELS[scenario]}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {SCENARIO_HINTS[scenario]}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * What the learner said, reviewed: silent fixes in the diff, gates behind
 * teasers, and the card opening underneath the sentence it belongs to.
 */
function LearnerTurnView({
  turn,
  talk,
}: {
  turn: LearnerTurn;
  talk: ReturnType<typeof useConversation>;
}) {
  if (!turn.review) {
    return (
      <div className="space-y-1">
        <p className="text-lg leading-loose">{turn.said}</p>
        {turn.skipped && (
          <p className="text-sm text-muted-foreground" data-testid="feedback-skipped">
            {SKIPPED_NOTES[turn.skipped]}
          </p>
        )}
      </div>
    );
  }

  const nothingToTeach = turn.review.sentences.every((s) => s.gated.length === 0);

  return (
    <div className="space-y-3">
      {turn.review.sentences.map((sentence, index) => {
        const cardHere =
          talk.card &&
          talk.open?.turnId === turn.id &&
          talk.open.sentenceIndex === index;

        return (
          <div key={sentence.index} className="space-y-2">
            <SentenceView
              sentence={sentence}
              interactive
              onOpenGate={(id) => talk.openGate(turn.id, index, id)}
              onLookup={(word) => talk.lookup(turn.id, index, word)}
            />
            {cardHere ? (
              <WordCard
                state={talk.card!}
                saved={talk.saved}
                onAccept={talk.accept}
                onReject={talk.reject}
                onSave={() => void talk.saveLookup()}
                onDismiss={talk.dismiss}
              />
            ) : (
              <TeaserList
                sentence={sentence}
                onOpenGate={(id) => talk.openGate(turn.id, index, id)}
              />
            )}
          </div>
        );
      })}
      {nothingToTeach && (
        <p className="text-sm text-muted-foreground">That came across well.</p>
      )}
    </div>
  );
}
