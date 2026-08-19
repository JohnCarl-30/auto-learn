'use client';

import type { ApiError, CardResponse } from '@auto-learn/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

export type CardState =
  | { status: 'loading' }
  | { status: 'ready'; response: CardResponse }
  | { status: 'error'; error: ApiError };

export function WordCard({
  state,
  onAccept,
  onReject,
  onDismiss,
}: {
  state: CardState;
  onAccept: (replacement: string) => void;
  onReject: () => void;
  onDismiss: () => void;
}) {
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
            <Button size="sm" variant="ghost" onClick={onDismiss}>
              Close
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
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
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-lg font-semibold">{card.word}</h3>
        <span className="text-sm text-muted-foreground">
          {card.partOfSpeech}
        </span>
        <Badge variant="secondary" className="ml-auto">
          {card.register}
        </Badge>
      </div>

      <p className="text-sm leading-relaxed">{card.definition}</p>

      {card.whyHere && (
        <p className="text-sm text-muted-foreground italic">{card.whyHere}</p>
      )}

      <div className="space-y-1">
        {card.synonyms.map((synonym) => (
          <p key={synonym.word} className="text-sm">
            <span className="font-medium">{synonym.word}</span>
            <span className="text-muted-foreground"> — {synonym.nuance}</span>
          </p>
        ))}
      </div>

      <ul className="space-y-1 border-l-2 pl-3">
        {card.useCases.map((useCase) => (
          <li key={useCase} className="text-sm text-muted-foreground">
            {useCase}
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
      <p className="text-sm leading-relaxed">{response.note.note}</p>
    </div>
  );
}
