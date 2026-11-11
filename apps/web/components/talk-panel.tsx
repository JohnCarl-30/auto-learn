'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRightIcon,
  LoaderCircleIcon,
  MicIcon,
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
import { CallStage } from '@/components/call-stage';
import { ApiNotice, Notice } from '@/components/notice';
import { TeaserList } from '@/components/review-panel';
import { SentenceView } from '@/components/sentence-view';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { WordCard } from '@/components/word-card';
import { useBankSync } from '@/lib/use-bank-sync';
import { cn } from '@/lib/utils';
import { useConversation, type LearnerTurn } from '@/lib/use-conversation';
import { useDictation } from '@/lib/use-dictation';
import { usePartnerVoice } from '@/lib/use-partner-voice';

/** The small mono caps over each turn, as over every labelled block. */
const LABEL = 'font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground';

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
  // The installed app opens on /learn, not on the writing page, so a learner
  // can reach this page without ever opening the writing page; it pulls a
  // signed-in learner's bank in from their other devices itself. Nothing on
  // this page lists the bank, so the counter it returns is unused:
  // the practice word reads the bank afresh each time a conversation starts.
  useBankSync();

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
    // One column on a phone; on a desktop the call sits on the left and the
    // conversation runs beside it.
    <div className="lg:grid lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)] lg:items-start lg:gap-12">
      <CallStage
        listening={recording}
        speaking={voice.speaking}
        thinking={talk.pending}
      />
      <div data-testid="talk">
        <div className="flex items-center justify-between gap-3 border-b pb-3.5">
          <div className="flex items-baseline gap-3">
            <h2 className="font-display text-xl font-semibold" data-testid="scenario">
              {SCENARIO_LABELS[talk.scenario]}
            </h2>
            {/* Same way back to the picker as End; the name says what it is for. */}
            <button
              type="button"
              onClick={talk.end}
              data-testid="change"
              className="rounded-sm text-[13px] font-medium text-cobalt outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/60"
            >
              Change
            </button>
          </div>
          <div className="flex items-center gap-2">
            {voice.supported && (
              <Button
                variant="outline"
                size="icon-lg"
                className="rounded-full"
                data-testid="mute"
                aria-label={voice.muted ? 'Read replies aloud' : 'Stop reading replies aloud'}
                aria-pressed={voice.muted}
                onClick={voice.toggleMuted}
              >
                <IconSwap
                  show={voice.muted ? 'muted' : 'sound'}
                  icons={{ sound: <Volume2Icon />, muted: <VolumeXIcon /> }}
                />
              </Button>
            )}
            <Button
              size="lg"
              onClick={talk.end}
              data-testid="end"
              className="rounded-full bg-[#a33a2e] px-4 text-[13px] font-semibold text-white hover:bg-[#a33a2e]/90"
            >
              End
            </Button>
          </div>
        </div>

        {talk.practiceWord && (
          // Polite: "You used it." arrives after the reply, and a screen reader
          // should hear it without being cut off mid-sentence.
          <p
            className="border-b py-3.5 text-sm text-muted-foreground"
            data-testid="practice-word"
            aria-live="polite"
          >
            {talk.practiceWord.used ? (
              <>
                <span className="font-display text-[17px] font-semibold text-cobalt">
                  {talk.practiceWord.word}
                </span>
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
                <span className="font-mono text-[11px] uppercase tracking-[0.08em]">
                  {talk.scenario === 'word-drill' ? 'Your word:' : 'Try using:'}
                </span>{' '}
                <span className="font-display text-[17px] font-semibold text-cobalt">
                  {talk.practiceWord.word}
                </span>
                {' — '}
                {talk.practiceWord.definition}
              </>
            )}
          </p>
        )}

        <ol className="space-y-5 py-5" aria-label="Conversation">
          {talk.turns.map((turn, index) =>
            turn.role === 'partner' ? (
              <li key={turn.id} data-testid="partner-turn" className="space-y-1.5">
                <p className={LABEL}>
                  Partner
                  {voice.speaking && index === talk.turns.length - 1 && ' · speaking'}
                </p>
                <div className="flex items-start gap-2.5">
                  <p className="max-w-[380px] rounded-xl rounded-tl-sm bg-muted px-4 py-3 text-[15px] leading-[23px]">
                    {turn.text}
                  </p>
                  {voice.supported && (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      className="mt-1.5 rounded-full text-muted-foreground [&_svg]:size-3"
                      aria-label="Hear that again"
                      onClick={() => voice.say(turn.text, { force: true })}
                    >
                      <Volume2Icon />
                    </Button>
                  )}
                </div>
              </li>
            ) : (
              <li
                key={turn.id}
                data-testid="learner-turn"
                className="space-y-2 border-l-2 border-foreground pl-4"
              >
                <p className={LABEL}>You</p>
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
          // ApiNotice, so a locked API's refusal comes with the way to sign in.
          <ApiNotice error={talk.error} testId="talk-notice" />
        )}

        {/*
          Stuck to the bottom of the screen so the mic and Send stay under the
          thumb however long the conversation gets. The inset keeps them clear of
          the home indicator in an installed iPhone app (and the floor of 0.5rem
          keeps them off the screen edge where there is no inset), and the
          background stops the transcript showing through as it scrolls under.
        */}
        <form
          className="sticky bottom-0 space-y-2 bg-background pt-3 pb-[max(env(safe-area-inset-bottom),0.5rem)]"
          onSubmit={(event) => {
            event.preventDefault();
            void talk.send();
          }}
        >
          <div className="rounded-xl border border-foreground transition-shadow focus-within:ring-3 focus-within:ring-ring/50">
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
            rows={2}
            className="min-h-0 resize-none border-0 bg-transparent px-4 pt-3.5 text-base leading-relaxed shadow-none focus-visible:ring-0 sm:text-[15px] dark:bg-transparent"
            aria-label="Your answer"
            data-testid="answer"
          />
          <div className="flex items-center justify-between gap-3 pr-2 pb-2 pl-4">
            <span className="text-[13px] text-muted-foreground">
              {recording
                ? 'Listening…'
                : transcribing
                  ? 'Writing that down…'
                  : 'Check what I heard, then send.'}
            </span>
            {/*
              44px square at least, Apple's minimum touch target: these two are
              pressed every turn, by thumb, often while walking. `lg` alone is 36.
            */}
            <div className="flex items-center gap-2">
              <Button
                type="button"
                data-testid="talk-mic"
                size="lg"
                className="size-11 rounded-full bg-cobalt text-white hover:bg-cobalt/90 [&_svg]:size-[18px]"
                disabled={talk.pending || transcribing}
                aria-label={recording ? 'Stop recording' : 'Answer out loud'}
                onClick={() => (recording ? dictation.stop() : startRecording())}
              >
                <IconSwap
                  show={transcribing ? 'transcribing' : recording ? 'recording' : 'idle'}
                  icons={{
                    idle: <MicIcon />,
                    recording: <SquareIcon />,
                    transcribing: <LoaderCircleIcon className="animate-spin" />,
                  }}
                />
              </Button>
              <Button
                type="submit"
                variant="outline"
                size="lg"
                className="h-11 rounded-full px-4 font-semibold"
                data-testid="send"
                disabled={talk.pending || recording || !talk.draft.trim()}
              >
                Send <ArrowRightIcon data-icon="inline-end" />
              </Button>
            </div>
          </div>
          </div>
          {/*
            A problem with a code came from the server (the recorder path), so
            it can be the sign-in refusal and gets its link; one without is the
            browser's own (permission, silence) and is only ever guidance.
          */}
          {dictation.problem &&
            (dictation.problem.code ? (
              <ApiNotice
                error={{ code: dictation.problem.code, message: dictation.problem.message }}
                testId="dictation-notice"
              />
            ) : (
              <Notice
                message={dictation.problem.message}
                tone="guidance"
                testId="dictation-notice"
              />
            ))}
        </form>
      </div>
    </div>
  );
}

/**
 * A button icon that changes with state, cross-faded: every icon stays mounted
 * in one grid cell so the old one fades out as the new one fades in, whichever
 * way the state goes. Under reduced motion only the opacity fade runs.
 */
function IconSwap({ show, icons }: { show: string; icons: Record<string, ReactNode> }) {
  return (
    <span className="grid place-items-center">
      {Object.entries(icons).map(([key, icon]) => (
        <span
          key={key}
          aria-hidden={key !== show}
          className={cn(
            '[grid-area:1/1] transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)] motion-reduce:scale-100 motion-reduce:blur-[0px]',
            key === show ? 'scale-100 opacity-100 blur-[0px]' : 'scale-[0.25] opacity-0 blur-[4px]',
          )}
        >
          {icon}
        </span>
      ))}
    </span>
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
        <p className="font-display text-xl leading-[30px]">{turn.said}</p>
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
              className="text-xl leading-[30px]"
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
