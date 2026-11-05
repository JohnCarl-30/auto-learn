'use client';

import { useEffect, useRef, useState } from 'react';
import { VideoIcon, VideoOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * The desktop "call": the partner large, you picture-in-picture in her corner,
 * each lit while it is their turn to speak. The camera is only a mirror — the stream
 * goes to the <video> on this screen and nowhere else, nothing is recorded or
 * sent. Off until asked for, because a camera light coming on unasked is the
 * fastest way to make someone close the tab.
 */
export function CallStage({
  listening,
  speaking,
  thinking,
}: {
  listening: boolean;
  speaking: boolean;
  thinking: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (video.current) video.current.srcObject = stream;
    // Turning the camera off, or leaving the page, switches its light off.
    return () => stream?.getTracks().forEach((track) => track.stop());
  }, [stream]);

  const startCamera = async () => {
    setProblem(null);
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: true, audio: false }));
    } catch {
      setProblem('No camera — allow it in the browser, or keep talking without it.');
    }
  };

  const status = listening
    ? 'Listening to you'
    : speaking
      ? 'Speaking'
      : thinking
        ? 'Thinking…'
        : null;

  return (
    // Desktop only, and pinned while the conversation scrolls beside it: the
    // call stays in view the way a video call's window does.
    <div className="hidden space-y-2 lg:sticky lg:top-6 lg:block" data-testid="call-stage">
      <figure
        className={cn(
          'relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted shadow-sm ring-2 ring-transparent transition-shadow duration-300',
          speaking && 'ring-primary',
        )}
      >
        <PartnerVideo speaking={speaking} />
        {/* A soft shade at the bottom so the labels read over any frame. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />

        {status && (
          <span
            className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm"
            data-testid="call-status"
          >
            <span
              className={cn(
                'size-2 rounded-full',
                listening ? 'bg-red-500' : 'bg-emerald-400',
                'motion-safe:animate-pulse',
              )}
            />
            {status}
          </span>
        )}

        <figcaption className="absolute bottom-3 left-3 text-sm font-medium text-white drop-shadow">
          {speaking ? 'Partner · speaking' : thinking ? 'Partner · thinking' : 'Partner'}
        </figcaption>

        {/* You, picture-in-picture, as every video call shows you to yourself. */}
        <div
          className={cn(
            'absolute right-3 bottom-3 aspect-video w-[32%] overflow-hidden rounded-xl bg-neutral-800 shadow-lg ring-2 ring-white/70 transition-shadow duration-300',
            listening && 'ring-red-500',
          )}
        >
          {stream ? (
            <>
              {/* Mirrored, as every selfie camera is: an unmirrored face reads as a stranger's. */}
              <video
                ref={video}
                autoPlay
                playsInline
                muted
                className="size-full -scale-x-100 object-cover"
                data-testid="self-view"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                className="absolute top-1.5 right-1.5 rounded-full bg-black/55 text-white hover:bg-black/70"
                onClick={() => setStream(null)}
                aria-label="Camera off"
                data-testid="camera"
              >
                <VideoOffIcon />
              </Button>
            </>
          ) : (
            // The whole tile is the switch while there is nothing to show in it.
            <button
              type="button"
              className="flex size-full flex-col items-center justify-center gap-1 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
              onClick={() => void startCamera()}
              data-testid="camera"
            >
              <VideoIcon className="size-5" />
              Camera on
            </button>
          )}
          <span className="pointer-events-none absolute bottom-1.5 left-2 text-xs font-medium text-white drop-shadow">
            {listening ? 'You · speaking' : 'You'}
          </span>
        </div>
      </figure>

      <p className="text-sm text-muted-foreground" role="status">
        {problem ??
          (stream
            ? 'Only you can see your camera. Nothing is recorded.'
            : 'Turn your camera on to watch yourself speak.')}
      </p>
    </div>
  );
}

/** Seconds into the clip where she is smiling with her mouth closed. */
const IDLE_FRAME_AT = 12;

/**
 * The partner as a person: a real clip of someone talking to the camera,
 * played while the voice speaks and held on a closed-mouth frame between.
 * From Mixkit (mixkit.co/free-stock-video/, clip 4834), free licence, no
 * attribution needed.
 *
 * shortcut: the lips do not match the words, because the browser's voice gives
 * nothing to sync to; upgrade to a lip-synced avatar if one is ever paid for.
 */
function PartnerVideo({ speaking }: { speaking: boolean }) {
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (speaking) {
      // A refused autoplay only leaves her still; the voice carries on regardless.
      void el.play()?.catch(() => undefined);
    } else {
      el.pause();
      el.currentTime = IDLE_FRAME_AT;
    }
  }, [speaking]);

  return (
    <video
      ref={video}
      src={`/partner.mp4#t=${IDLE_FRAME_AT}`}
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden
      className="absolute inset-0 size-full object-cover"
      data-testid="partner-video"
    />
  );
}
