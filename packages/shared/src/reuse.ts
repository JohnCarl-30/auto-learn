import { bareWord } from './segment';

/**
 * Finds banked words the writer has used again, unprompted.
 *
 * This is the product's only reward, and it is deliberately earned rather than
 * given: it fires on evidence of transfer — you used the word yourself — not
 * on attendance. Plain string work, no model call.
 *
 * Matching is deliberately conservative. A false positive congratulates
 * someone for a word they did not use, which is worse than staying quiet.
 */
export function findReused(
  text: string,
  lemmas: readonly string[],
): string[] {
  const used = new Set(
    text
      .split(/\s+/)
      .map((token) => bareWord(token).toLowerCase())
      .filter(Boolean),
  );

  if (used.size === 0) return [];

  return lemmas.filter((lemma) => {
    const base = lemma.toLowerCase();
    if (used.has(base)) return true;
    return inflectionsOf(base).some((form) => used.has(form));
  });
}

/**
 * A small, closed set of regular English inflections.
 *
 * Not a stemmer on purpose: an aggressive stemmer matches "substance" to
 * "substantial" and claims a reuse that never happened. These forms only
 * *add* to the base, so they cannot collapse two distinct words together.
 */
function inflectionsOf(base: string): string[] {
  const forms = [`${base}s`, `${base}es`, `${base}ed`, `${base}ing`];

  // consonant + y -> ies / ied  (study -> studies, studied)
  if (/[^aeiou]y$/.test(base)) {
    const stem = base.slice(0, -1);
    forms.push(`${stem}ies`, `${stem}ied`);
  }

  // silent e -> ed / ing  (argue -> argued, arguing)
  if (base.endsWith('e')) {
    const stem = base.slice(0, -1);
    forms.push(`${stem}ed`, `${stem}ing`);
  }

  return forms;
}
