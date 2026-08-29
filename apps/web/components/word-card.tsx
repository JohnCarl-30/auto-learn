'use client';

import { useEffect } from 'react';
import { curlyQuotes, type ApiError, type CardResponse } from '@auto-learn/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { PronounceButton } from '@/components/pronounce-button';

export type CardState =
  | { status: 'loading' }
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
      <Card>
        <CardContent className="space-y-3 py-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    );
  }

  if (state.status === 'error') {
    return (
      <Card>
        <CardContent className="flex items-center justify-between py-5">
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
    <Card data-testid="word-card">
      <CardContent className="space-y-4 py-5">
        {response.kind === 'card' ? (
          <CardBody response={response} />
        ) : (
          <NoteBody response={response} />
        )}

        <Separator />

        <div className="flex items-center gap-2">
          {response.replacement !== null ? (
            <>
              <Button
                size="sm"
                data-testid="accept"
                onClick={() => onAccept(response.replacement as string)}
              >
                Use it
              </Button>
              <Button
                size="sm"
                variant="outline"
                data-testid="reject"
                onClick={onReject}
              >
                Keep mine
              </Button>
              {response.alternative && (
                <span className="ml-auto text-xs text-muted-foreground">
                  or try{' '}
                  <button
                    type="button"
                    className="underline underline-offset-2"
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
                  size="sm"
                  variant={saved ? 'ghost' : 'default'}
                  data-testid="save"
                  disabled={saved}
                  onClick={onSave}
                >
                  {saved ? 'Saved' : 'Save to bank'}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={onDismiss}>
                Close
              </Button>
            </>
          )}
        </div>
      </CardContent>
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

function CardBody({
  response,
}: {
  response: Extract<CardResponse, { kind: 'card' }>;
}) {
  const { card } = response;

  return (
    <>
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-lg font-semibold">{card.word}</h3>
        {/*
          Written pronunciation, which exists for far more words than the
          recordings do — so a word nobody read aloud still tells you how to
          say it.
        */}
        {card.pronunciation.ipa && (
          <span
            data-testid="ipa"
            className="text-sm text-muted-foreground"
            aria-label={`Pronounced ${card.pronunciation.ipa}`}
          >
            {card.pronunciation.ipa}
          </span>
        )}
        {/*
          Keyed by the word, because everything this button remembers — the
          source it resolved, whether playing it failed — is about *that* word
          and must not outlive it. A card currently passes through a loading
          state between words, which unmounts this anyway, but that is an
          accident of how the page renders rather than a guarantee. Without the
          key, the day that stops being true is the day the button plays the
          previous word.
        */}
        <PronounceButton
          key={card.word}
          word={card.word}
          pronunciation={card.pronunciation}
        />
        <span className="text-sm text-muted-foreground">
          {card.partOfSpeech}
        </span>
        <Badge variant="secondary" className="ml-auto">
          {card.register}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed">{curlyQuotes(card.definition)}</p>

      {card.whyHere && (
        <p className="text-sm text-muted-foreground italic">
          {curlyQuotes(card.whyHere)}
        </p>
      )}

      <div className="space-y-1">
        {card.synonyms.map((synonym) => (
          <p key={synonym.word} className="text-sm">
            <span className="font-medium">{synonym.word}</span>
            <span className="text-muted-foreground">
              {' — '}
              {curlyQuotes(synonym.nuance)}
            </span>
          </p>
        ))}
      </div>

      <ul className="space-y-1 border-l-2 pl-3">
        {card.useCases.map((useCase) => (
          <li key={useCase} className="text-sm text-muted-foreground">
            {curlyQuotes(useCase)}
          </li>
        ))}
      </ul>
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
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-lg font-semibold">{response.note.corrected}</h3>
        <Badge variant="secondary">grammar</Badge>
      </div>
      <p className="text-sm leading-relaxed">{curlyQuotes(response.note.note)}</p>
    </div>
  );
}
