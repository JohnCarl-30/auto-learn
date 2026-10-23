import { act, renderHook } from '@testing-library/react';
import { pickVoice, usePartnerVoice } from './use-partner-voice';

/** A speechSynthesis that records what it was asked to say. */
function fakeSynth(voices: Partial<SpeechSynthesisVoice>[] = []) {
  const spoken: SpeechSynthesisUtterance[] = [];
  const synth = {
    speak: jest.fn((u: SpeechSynthesisUtterance) => spoken.push(u)),
    cancel: jest.fn(),
    getVoices: () => voices as SpeechSynthesisVoice[],
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  // jsdom has no utterance either; this is the part of it the hook touches.
  (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
    class {
      lang = '';
      rate = 1;
      voice: unknown = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(readonly text: string) {}
    };
  return { synth, spoken };
}

afterEach(() => {
  window.localStorage.clear();
  delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
});

describe('pickVoice', () => {
  const voice = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice;

  it('prefers a natural-sounding English voice', () => {
    expect(
      pickVoice([voice('Albert', 'en-US'), voice('Google US English', 'en-US')])?.name,
    ).toBe('Google US English');
  });

  it('falls back to any English voice, and never picks another language', () => {
    expect(pickVoice([voice('Thomas', 'fr-FR'), voice('Fred', 'en-US')])?.name).toBe('Fred');
    expect(pickVoice([voice('Thomas', 'fr-FR')])).toBeUndefined();
  });
});

describe('usePartnerVoice', () => {
  it('reads a reply aloud, a little slower than normal, cutting off the last one', () => {
    const { synth, spoken } = fakeSynth([{ name: 'Samantha', lang: 'en-US' }]);
    const { result } = renderHook(() => usePartnerVoice());

    act(() => result.current.say('How has your week been?'));

    expect(synth.cancel).toHaveBeenCalled();
    expect(spoken[0].text).toBe('How has your week been?');
    expect(spoken[0].rate).toBeLessThan(1);
    expect(spoken[0].voice?.name).toBe('Samantha');
  });

  it('stays quiet when muted, unless asked to replay a line', () => {
    const { spoken } = fakeSynth();
    const { result } = renderHook(() => usePartnerVoice());

    act(() => result.current.toggleMuted());
    act(() => result.current.say('First.'));
    expect(spoken).toHaveLength(0);

    act(() => result.current.say('Again, please.', { force: true }));
    expect(spoken.map((u) => u.text)).toEqual(['Again, please.']);
  });

  it('remembers being muted across visits', () => {
    fakeSynth();
    const first = renderHook(() => usePartnerVoice());
    act(() => first.result.current.toggleMuted());
    first.unmount();

    const second = renderHook(() => usePartnerVoice());
    expect(second.result.current.muted).toBe(true);
  });

  it('does nothing where the browser cannot speak', () => {
    const { result } = renderHook(() => usePartnerVoice());
    expect(result.current.supported).toBe(false);
    expect(() => act(() => result.current.say('Hello?'))).not.toThrow();
  });

  it('stops talking when the page goes away', () => {
    const { synth } = fakeSynth();
    const { unmount } = renderHook(() => usePartnerVoice());
    unmount();
    expect(synth.cancel).toHaveBeenCalled();
  });
});
