'use client';

import { useRef, useState } from 'react';
import { LoaderCircleIcon, Volume2Icon } from 'lucide-react';
import type { Pronunciation } from '@auto-learn/shared';
import { Button } from '@/components/ui/button';
import { speak } from '@/lib/api';
import { playAudio, synthesisedSrc } from '@/lib/audio';

/**
 * Says the word.
 *
 * Two sources, one button. Most words come with a recording the dictionary
 * already had, which costs nothing and is fetched by the browser directly.
 * The rest are synthesised — but only when someone actually asks, because a
 * card that is built is not a card that is listened to, and paying to
 * pronounce every word we display would mean paying mostly for silence.
 */
export function PronounceButton({
  word,
  pronunciation,
}: {
  word: string;
  pronunciation: Pronunciation;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Held in a ref rather than state: a replay should not re-render the card,
  // and once we have a source it is good for the life of this card.
  const source = useRef<string | null>(pronunciation.audioUrl);

  const play = async () => {
    setFailed(false);

    if (source.current) {
      try {
        await playAudio(source.current);
        return;
      } catch {
        // A dictionary URL that will not play — a dead link, or a codec this
        // browser refuses. Fall through and synthesise it instead of leaving
        // the reader with a button that does nothing.
        source.current = null;
      }
    }

    setBusy(true);
    try {
      const spoken = await speak(word);
      source.current = synthesisedSrc(spoken);
      await playAudio(source.current);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        data-testid="pronounce"
        variant="ghost"
        size="sm"
        disabled={busy}
        aria-label={`Hear ${word}`}
        onClick={() => void play()}
      >
        {busy ? (
          <LoaderCircleIcon className="animate-spin" />
        ) : (
          <Volume2Icon />
        )}
      </Button>
      {failed && (
        <span role="status" className="text-xs text-muted-foreground">
          Couldn&apos;t play that.
        </span>
      )}
    </>
  );
}
