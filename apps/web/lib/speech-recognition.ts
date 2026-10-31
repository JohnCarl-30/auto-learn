/**
 * The slice of the Web Speech API this app uses.
 *
 * Declared here rather than taken from `lib.dom` because TypeScript's DOM
 * typings describe the unprefixed `SpeechRecognition` only on some versions
 * and never the `webkit` one that Chrome and Safari actually ship, and a
 * dependency for a dozen members would be more code than the members.
 */
export type BrowserRecognitionEvent = {
  // Final results only (we never ask for interim ones); each holds the
  // alternatives for one phrase, best first.
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
};

export type BrowserRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: BrowserRecognitionEvent) => void) | null;
  // `error` is the spec's SpeechRecognitionErrorCode, kept as a string so an
  // unknown one from a newer browser still arrives rather than failing a cast.
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

/**
 * The browser's own recogniser, or null where there is none.
 *
 * Null covers an iPhone home-screen app, where WebKit exposes no
 * SpeechRecognition at all, and the server render, where there is no window.
 * Looked up on each call rather than once at import so a test can add or
 * remove it, and so the answer never goes stale across a hot reload.
 */
export function recognitionConstructor(): (new () => BrowserRecognition) | null {
  if (typeof window === 'undefined') return null;
  const scope = window as unknown as {
    SpeechRecognition?: new () => BrowserRecognition;
    webkitSpeechRecognition?: new () => BrowserRecognition;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}
