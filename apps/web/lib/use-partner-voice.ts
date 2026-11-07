'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { speakReply } from './api';
import { synthesisedSrc } from './audio';

/**
 * The partner's voice: the API's local engine when it has one, the browser's
 * own speech synthesis otherwise.
 *
 * Not the ElevenLabs route the card uses for a word, and on purpose. That route
 * is held to one word per call because it spends a provider key with no login
 * in front of it; a reply is several sentences on every turn, which is exactly
 * the open-ended spend it was shaped to refuse. The local engine (VoiceStudio,
 * through POST /speak) and the browser's voice are both free, so either may
 * read a whole reply — a conversation that cost a provider call per sentence
 * spoken would be one nobody could afford to leave running.
 *
 * The engine is asked first because it sounds like a person; the browser's
 * voice is what every machine has, so it is the floor rather than the choice.
 * System voices vary by machine, and that is acceptable for a partner making
 * conversation and would not be for a card teaching how one word sounds, which
 * is why the card keeps its own route.
 */

const MUTED_KEY = 'auto-learn:partner-muted';

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

const readMuted = () => window.localStorage.getItem(MUTED_KEY) === '1';

function writeMuted(muted: boolean): void {
  window.localStorage.setItem(MUTED_KEY, muted ? '1' : '0');
  for (const listener of listeners) listener();
}

/**
 * An English voice, preferring the ones that sound least like a robot.
 *
 * Browsers expose their better voices under names rather than flags, so this
 * is a preference list over names, falling back to any English voice, and then
 * to whatever the browser picks for `lang` — never to no voice at all.
 */
export function pickVoice(
  voices: SpeechSynthesisVoice[],
): SpeechSynthesisVoice | undefined {
  const english = voices.filter((voice) => voice.lang.toLowerCase().startsWith('en'));
  const better = /natural|neural|google|samantha|daniel|karen|moira/i;
  return english.find((voice) => better.test(voice.name)) ?? english[0];
}

/**
 * Slightly under normal speed. The listener is following a second language,
 * and a partner who speaks at native pace is the experience they came here to
 * prepare for, not to start with.
 */
const RATE = 0.92;

export function usePartnerVoice() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const muted = useSyncExternalStore(subscribe, readMuted, () => false);
  const [speaking, setSpeaking] = useState(false);
  // The engine's clip while it plays; nothing while the browser's voice reads.
  const player = useRef<HTMLAudioElement | null>(null);
  // Which `say` is current, so a reply still being synthesised when the next
  // one arrives, or when the mic opens, stays silent instead of playing late.
  const turn = useRef(0);

  const stop = useCallback(() => {
    turn.current += 1;
    player.current?.pause();
    player.current = null;
    if (supported) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const say = useCallback(
    (text: string, { force = false }: { force?: boolean } = {}) => {
      // `force` is the replay button: someone who muted the voice and then
      // asked to hear one line has said what they want for that line.
      if (!supported || (muted && !force) || !text.trim()) return;

      // One voice at a time. A new reply arriving while the last is still being
      // read would otherwise queue behind it and answer the wrong turn.
      stop();
      const mine = turn.current;

      const browserVoice = () => {
        const synth = window.speechSynthesis;
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = RATE;
        const voice = pickVoice(synth.getVoices());
        if (voice) utterance.voice = voice;
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => setSpeaking(false);
        setSpeaking(true);
        synth.speak(utterance);
      };

      speakReply(text)
        .then((reply) => {
          if (turn.current !== mine) return;
          const clip = new Audio(synthesisedSrc(reply));
          clip.onended = () => setSpeaking(false);
          clip.onerror = () => setSpeaking(false);
          player.current = clip;
          setSpeaking(true);
          return clip.play();
        })
        .catch(() => {
          // No engine configured, or it failed: the browser's voice reads the line.
          if (turn.current === mine) browserVoice();
        });
    },
    [muted, supported, stop],
  );

  const toggleMuted = useCallback(() => {
    if (!muted) stop();
    writeMuted(!muted);
  }, [muted, stop]);

  // A voice that keeps talking after the page is gone is the speaker's version
  // of a recording light that will not switch off.
  useEffect(
    () => () => {
      player.current?.pause();
      if (supported) window.speechSynthesis.cancel();
    },
    [supported],
  );

  return { supported, muted, speaking, say, stop, toggleMuted };
}
