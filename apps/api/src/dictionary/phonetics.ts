/**
 * Reading pronunciation out of the Free Dictionary payload.
 *
 * Pure and dependency-free so it can be tested against real captured
 * responses, which is the only way to get this right — every rule below comes
 * from a live response that broke a naive read, not from the documentation.
 */

/** The parts of a Free Dictionary entry that describe sound. */
export interface PhoneticSource {
  phonetic?: string;
  phonetics?: Array<{ text?: string; audio?: string }>;
}

/**
 * Accent is whatever Wikimedia happened to have, so a word may come back
 * Australian while the next is British. We cannot make them agree, but we can
 * stop it being arbitrary: prefer one accent consistently when there is a
 * choice, and take whatever exists when there is not.
 */
const ACCENT_PREFERENCE = ['-us.', '-uk.', '-au.'];

/**
 * Some entries give `//ssl.gstatic.com/...` and some give plain `http:`.
 * Both play perfectly on localhost. On a deployed https site the first is
 * resolved against the page — so it works — and the second is silently blocked
 * as mixed content, which reads as a dead button nobody can reproduce locally.
 *
 * Upgrading rather than discarding is safe here because playback failure is
 * already handled: the card falls back to synthesising the word, so the worst
 * case of a bad guess is one wasted request, not a missing feature.
 */
function normaliseAudioUrl(raw: string | undefined): string | null {
  const url = raw?.trim();
  if (!url) return null;

  const absolute = url.startsWith('//')
    ? `https:${url}`
    : url.replace(/^http:\/\//i, 'https://');

  return absolute.startsWith('https://') ? absolute : null;
}

/**
 * Picks the recording and the written pronunciation together, rather than
 * independently, so that when a word has several accents the IPA describes the
 * clip you will actually hear.
 */
export function pickPronunciation(entries: PhoneticSource[]): {
  ipa: string | null;
  audioUrl: string | null;
} {
  const variants = entries.flatMap((entry) => entry.phonetics ?? []);

  // `audio` is often present but empty — an empty string, not a missing key.
  // Filtering on presence rather than truthiness ships a play button that
  // plays nothing.
  const playable = variants
    .map((variant) => ({
      text: variant.text?.trim() || null,
      audioUrl: normaliseAudioUrl(variant.audio),
    }))
    .filter((variant) => variant.audioUrl !== null);

  const chosen =
    ACCENT_PREFERENCE.map((accent) =>
      playable.find((variant) => variant.audioUrl?.includes(accent)),
    ).find(Boolean) ?? playable[0];

  // Falling back past the chosen clip's own text: some entries carry the IPA
  // only at the top level (`phonetic`), and some only inside `phonetics[]`.
  // "ubiquitous" has no top-level one at all, so reading only that field
  // silently drops the pronunciation of exactly the words this product teaches.
  const ipa =
    chosen?.text ??
    entries.map((entry) => entry.phonetic?.trim()).find(Boolean) ??
    variants.map((variant) => variant.text?.trim()).find(Boolean) ??
    null;

  return { ipa: ipa ?? null, audioUrl: chosen?.audioUrl ?? null };
}
