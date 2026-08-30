'use client';

import { useEffect, useMemo, useState } from 'react';
import { maskLemma, type BankEntry } from '@auto-learn/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { reportEvent } from '@/lib/api';

/**
 * Below this the drill is a formality — you cannot be tested on two words you
 * banked a minute ago. It is offered once the bank has enough in it to have
 * forgotten something.
 */
export const DRILL_MIN = 3;

/**
 * Recall practice over the bank.
 *
 * The prompt is the writer's own sentence with the word blanked out, because
 * that sentence is why the word is in the bank at all — testing against a
 * dictionary definition would be testing a stranger's sentence.
 *
 * For an accepted suggestion the stored sentence is the one from *before* the
 * replacement landed, so it holds the writer's weaker wording and the mask
 * finds nothing to hide. That is the better prompt of the two, not a bug: the
 * cue is "you wrote very big here", and the answer is the word you took.
 *
 * Deliberately session-only: nothing here is written back. A real scheduler
 * needs due dates and an interval per entry, which is a change to the stored
 * shape and its migration, not a UI feature — and shipping a score that
 * silently goes nowhere is worse than shipping no score. What the drill does
 * today is put you in front of your own words again, which is the part that
 * does not need a schema.
 */
export function RecallDrill({
  entries,
  onDone,
}: {
  entries: BankEntry[];
  onDone: () => void;
}) {
  // Shuffled once per drill, not per render — reshuffling under someone
  // mid-answer would swap the card they are looking at.
  const [queue, setQueue] = useState(() => shuffle(entries));
  const [position, setPosition] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [recalled, setRecalled] = useState(0);

  /*
    Reported because nothing else can see it. The three counts the server keeps
    say whether people arrive, open the gate and take what it offers; whether
    they then keep the word is this component's question alone, and it went
    unasked. Fire-and-forget, like accept and reject — a dropped count is not
    worth interrupting practice for.

    Mounting is starting: the drill has no other entry, and the button that
    reaches it lives in the panel above.
  */
  useEffect(() => reportEvent('drill_started'), []);

  const current = queue[position];
  const finished = !current;

  useEffect(() => {
    if (finished) reportEvent('drill_finished');
  }, [finished]);

  const prompt = useMemo(
    () =>
      current ? maskLemma(current.sourceSentence, current.lemma) : '',
    [current],
  );

  const answer = (knew: boolean) => {
    // Self-marked, and only ever asked after the word was shown.
    reportEvent(knew ? 'word_recalled' : 'word_forgotten');
    if (knew) setRecalled((total) => total + 1);
    setRevealed(false);
    setPosition((index) => index + 1);
  };

  const restart = () => {
    reportEvent('drill_started');
    setQueue(shuffle(entries));
    setPosition(0);
    setRevealed(false);
    setRecalled(0);
  };

  if (!current) {
    return (
      <Card data-testid="drill">
        <CardContent className="space-y-4 py-5">
          <p className="text-sm" data-testid="drill-summary">
            You recalled {recalled} of {queue.length}.
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" data-testid="drill-restart" onClick={restart}>
              Again
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card data-testid="drill">
      <CardContent className="space-y-4 py-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground" data-testid="drill-progress">
            {position + 1} of {queue.length}
          </span>
          <Button size="sm" variant="ghost" data-testid="drill-stop" onClick={onDone}>
            Stop
          </Button>
        </div>

        <p className="text-lg leading-loose" data-testid="drill-prompt">
          {prompt}
        </p>

        <div className="flex flex-wrap items-baseline gap-2 text-sm text-muted-foreground">
          <span>{current.partOfSpeech}</span>
          <Badge variant="secondary" className="text-xs">
            {current.register}
          </Badge>
        </div>

        <Separator />

        {/*
          The answer is announced: revealing the word replaces the prompt with
          content a screen reader would otherwise never be told arrived — and
          being told the word is the entire point of pressing the button.
        */}
        {revealed ? (
          <div
            className="space-y-3"
            data-testid="drill-answer"
            role="status"
            aria-live="polite"
          >
            <h3 className="text-lg font-semibold">{current.word}</h3>
            <p className="text-sm leading-relaxed">{current.definition}</p>

            {current.synonyms.length > 0 && (
              <div className="space-y-1">
                {current.synonyms.map((synonym) => (
                  <p key={synonym.word} className="text-sm">
                    <span className="font-medium">{synonym.word}</span>
                    <span className="text-muted-foreground">
                      {' — '}
                      {synonym.nuance}
                    </span>
                  </p>
                ))}
              </div>
            )}

            {/*
              Self-marked, and asked only after the answer is visible. Marking
              before the reveal is a guess about a guess.
            */}
            <div className="flex items-center gap-2">
              <Button size="sm" data-testid="drill-knew" onClick={() => answer(true)}>
                I knew it
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="drill-missed"
                onClick={() => answer(false)}
              >
                I didn&apos;t
              </Button>
            </div>
          </div>
        ) : (
          <Button
            size="sm"
            variant="outline"
            data-testid="drill-reveal"
            onClick={() => setRevealed(true)}
          >
            Show the word
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function shuffle(entries: readonly BankEntry[]): BankEntry[] {
  const shuffled = [...entries];

  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  return shuffled;
}
