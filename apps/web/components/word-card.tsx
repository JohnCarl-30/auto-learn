'use client';

import { useEffect } from 'react';
import { curlyQuotes, type ApiError, type CardResponse } from '@auto-learn/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { PartialCard } from '@/lib/api';
import { PronounceButton } from '@/components/pronounce-button';
import { SayItBack } from '@/components/say-it-back';
import { cn } from '@/lib/utils';

/** The card's frame: an ink hairline, with a flat cobalt-wash shadow set off behind it. */
const SHELL =
  'gap-0 rounded-md border border-foreground py-0 shadow-[6px_6px_0_var(--cobalt-wash)] ring-0';
const WORD = 'font-display text-title font-semibold tracking-tight';
const DEFINITION = 'font-display text-[22px] leading-[30px]';
/** Both footer buttons, at the height the design gives them. */
const ACTION = 'h-10 rounded-md px-4';

export type CardState =
  | { status: 'loading' }
  /** The model is still writing. Whatever has arrived is real; the rest is not here yet. */
  | { status: 'streaming'; partial: PartialCard }
  | { status: 'ready'; response: CardResponse }
  | { status: 'error'; error: ApiError };

export function WordCard({
  state,
  saved = false,
  onAccept,
  onReject,
  onSave,
  onDismiss,
}: {
  state: CardState;
  /** True once a looked-up word has been added to the bank. */
  saved?: boolean;
  onAccept: (replacement: string) => void;
  onReject: () => void;
  onSave?: () => void;
  onDismiss: () => void;
}) {
  useEscapeToDismiss(onDismiss);

  if (state.status === 'loading') {
    return (
      <Card className={SHELL}>
        <CardContent className="space-y-3 px-7 py-6">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'streaming') {
    return (
      <Card data-testid="card-streaming" className={SHELL}>
        <CardContent className="flex flex-col gap-5 px-7 py-6">
          <StreamingBody partial={state.partial} />
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card className={SHELL}>
        <CardContent className="flex items-center justify-between px-7 py-6">
          <p className="text-sm text-destructive">{state.error.message}</p>
          <Button variant="ghost" size="sm" onClick={onDismiss}>
            Close
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { response } = state;

  return (
    <Card data-testid="word-card" className={SHELL}>
      {response.kind === 'card' ? (
        <CardBody response={response} />
      ) : (
        <NoteBody response={response} />
      )}

      <div className="flex items-center gap-2 border-t py-4 pr-5 pl-7">
          {response.replacement !== null ? (
            <>
              <Button
                className={cn(ACTION, 'bg-cobalt px-4.5 font-semibold text-white hover:bg-cobalt/90')}
                data-testid="accept"
                onClick={() => onAccept(response.replacement as string)}
              >
                Use it
              </Button>
              <Button
                className={ACTION}
                variant="outline"
                data-testid="reject"
                onClick={onReject}
              >
                Keep mine
              </Button>
              {response.alternative && (
                <span className="ml-auto text-[13px] text-muted-foreground">
                  or try{' '}
                  <button
                    type="button"
                    className="font-medium text-foreground underline underline-offset-2"
                    onClick={() => onAccept(response.alternative as string)}
                  >
                    {response.alternative}
                  </button>
                </span>
              )}
            </>
          ) : (
            <>
              {/*
                A looked-up word banks only on request. Tapping is often just
                checking a word you already know, and the bank is the
                retention mechanic — its contents have to be chosen.
              */}
              {response.kind === 'card' && onSave && (
                <Button
                  className={ACTION}
                  variant={saved ? 'ghost' : 'default'}
                  data-testid="save"
                  disabled={saved}
                  onClick={onSave}
                >
                  {saved ? 'Saved' : 'Save to bank'}
                </Button>
              )}
              <Button className={ACTION} variant="ghost" onClick={onDismiss}>
                Close
              </Button>
            </>
          )}
      </div>
    </Card>
  );
}

/**
 * Escape closes the card.
 *
 * The card is the only thing in the product that opens over what you were
 * reading, and until now the way out was a button that is not always there —
 * a gate offers "Use it" and "Keep mine", neither of which is "not now". The
 * keyboard needed an exit that does not depend on which card you got.
 */
function useEscapeToDismiss(onDismiss: () => void) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onDismiss();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);
}

/**
 * The card as it is being written.
 *
 * Deliberately the same shapes in the same order as the finished card below,
 * because this is the same card — anything that moved when the last section
 * landed would read as the answer changing its mind. What has not arrived is
 * simply absent rather than a skeleton standing in for it: a placeholder the
 * width of a definition promises a definition of that width.
 */
function StreamingBody({ partial }: { partial: PartialCard }) {
  return (
    <>
      <div className="space-y-1">
        {partial.word ? (
          <h3 className={WORD}>{partial.word}</h3>
        ) : (
          <Skeleton className="h-8 w-40" />
        )}
        {partial.partOfSpeech && (
          <p className="text-muted-foreground font-mono text-[13px]">{partial.partOfSpeech}</p>
        )}
      </div>

      {partial.definition ? (
        <p className={DEFINITION}>{curlyQuotes(partial.definition)}</p>
      ) : (
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-4/6" />
        </div>
      )}

      {partial.synonyms.length > 0 && <Synonyms synonyms={partial.synonyms} />}

      {partial.useCases.length > 0 && <UseCases useCases={partial.useCases} />}

      {/*
        No buttons until the card is finished. `replacement` arrives with the
        payload, so a "Use it" here would either do nothing or apply something
        that is still being written.
      */}
      <p className="text-muted-foreground text-sm" role="status">
        Writing the card…
      </p>
    </>
  );
}

/**
 * A small, quiet heading for the three things below the definition.
 *
 * The card used to be one flat stack at a single size: the word being taught,
 * its definition, the nuance lines and the examples all read at the same
 * weight, so nothing announced itself and everything had to be read in order
 * to be understood. These labels are what let the eye skip.
 */
function SectionLabel({ children, accent = false }: { children: string; accent?: boolean }) {
  return (
    <h4
      className={cn(
        'font-mono text-[11px] font-normal tracking-[0.08em] uppercase',
        accent ? 'text-cobalt' : 'text-muted-foreground',
      )}
    >
      {children}
    </h4>
  );
}

/**
 * One row per synonym: the word in a fixed column, its nuance beside it. That
 * difference is the only thing on this card a dictionary would not have given
 * the reader, so it gets the row rather than a footnote.
 */
function Synonyms({ synonyms }: { synonyms: { word: string; nuance: string }[] }) {
  return (
    <div className="space-y-2">
      <SectionLabel>Instead of</SectionLabel>
      <ul className="space-y-1.5">
        {synonyms.map((synonym) => (
          <li key={synonym.word} className="flex gap-3">
            <p className="w-24 shrink-0 text-sm font-semibold">{synonym.word}</p>
            <p className="text-muted-foreground text-[13px] leading-5">
              {curlyQuotes(synonym.nuance)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function UseCases({ useCases }: { useCases: string[] }) {
  return (
    <div className="space-y-2">
      <SectionLabel>In use</SectionLabel>
      <ul className="space-y-1.5 border-l-2 pl-3.5">
        {useCases.map((useCase) => (
          <li key={useCase} className="font-display text-base leading-6 italic">
            {curlyQuotes(useCase)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CardBody({
  response,
}: {
  response: Extract<CardResponse, { kind: 'card' }>;
}) {
  const { card } = response;

  return (
    <>
      {/*
        The word is the hero: a card exists to teach one word, and everything
        else on it is support for the line below.
      */}
      <div className="space-y-4 border-b px-7 pt-6 pb-6">
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <h3 className={WORD}>{card.word}</h3>
            <span className="text-muted-foreground mt-2 shrink-0 rounded-full border px-2 py-0.5 font-mono text-[11px] tracking-[0.08em] uppercase">
              {card.register}
            </span>
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[13px]">
            {/*
              Written pronunciation, which exists for far more words than the
              recordings do — so a word nobody read aloud still tells you how
              to say it.
            */}
            {card.pronunciation.ipa && (
              <span
                data-testid="ipa"
                aria-label={`Pronounced ${card.pronunciation.ipa}`}
              >
                {card.pronunciation.ipa}
              </span>
            )}
            {card.pronunciation.ipa && <span aria-hidden>·</span>}
            <span>{card.partOfSpeech}</span>
            {/*
              Keyed by the word, because everything this button remembers — the
              source it resolved, whether playing it failed — is about *that*
              word and must not outlive it. A card currently passes through a
              loading state between words, which unmounts this anyway, but that
              is an accident of how the page renders rather than a guarantee.
              Without the key, the day that stops being true is the day the
              button plays the previous word.
            */}
            <PronounceButton
              key={card.word}
              word={card.word}
              pronunciation={card.pronunciation}
            />
            {/*
              With the identity, not with Use it and Keep mine: saying the word
              back is part of meeting the word, and those buttons are about the
              sentence. Quiet by default — it only has something to say once
              someone has tried.
            */}
            <SayItBack key={`say-${card.word}`} word={card.word} />
          </div>
        </div>

        {/* The line the reader came for, and sized to say so. */}
        <p className={DEFINITION}>{curlyQuotes(card.definition)}</p>

        {card.whyHere && (
          <div className="space-y-1">
            <SectionLabel accent>Why here</SectionLabel>
            <p className="text-sm leading-[21px]">{curlyQuotes(card.whyHere)}</p>
          </div>
        )}
      </div>

      <div className="space-y-5 px-7 pt-5 pb-6">
        <Synonyms synonyms={card.synonyms} />
        <UseCases useCases={card.useCases} />
      </div>
    </>
  );
}

/**
 * A grammar gate. Deliberately not a vocabulary card — the lesson is the rule,
 * so there is no definition, no synonyms, and nothing to bank.
 */
function NoteBody({
  response,
}: {
  response: Extract<CardResponse, { kind: 'note' }>;
}) {
  return (
    <div className="space-y-2 px-7 py-6">
      <div className="flex items-baseline gap-2">
        <h3 className="font-display text-2xl font-semibold">{response.note.corrected}</h3>
        <Badge variant="secondary">grammar</Badge>
      </div>
      <p className="text-sm leading-relaxed">{curlyQuotes(response.note.note)}</p>
    </div>
  );
}
