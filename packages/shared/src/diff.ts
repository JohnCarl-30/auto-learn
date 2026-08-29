/**
 * One run of the word-level diff between what someone typed and what they are
 * leaving with.
 *
 * The product's whole claim is "learn the word that fixed it", which it can
 * only make good on if the fix is visible. The finished text alone shows the
 * destination and hides the journey.
 */
export type DiffPart =
  | { kind: 'same'; value: string }
  | { kind: 'removed'; value: string }
  | { kind: 'added'; value: string };

/**
 * Above this the quadratic table stops being free. Nothing in the product can
 * reach it — the cap is three sentences — so this is a guard against a caller
 * that changes, not a case the UI hits.
 */
const MAX_TOKENS = 1500;

/**
 * Diffs two versions of the same prose at word granularity.
 *
 * Two invariants hold for every input, and both are tested: concatenating the
 * `same` and `removed` parts reproduces `original` exactly, and concatenating
 * the `same` and `added` parts reproduces `revised` exactly. That is what lets
 * a view render one string, the other, or both at once from a single pass —
 * and what stops a rendering bug from quietly inventing text the writer never
 * wrote.
 *
 * Whitespace is tokenized alongside words rather than collapsed, because the
 * reconstruction invariant has to survive a change in spacing too.
 */
export function diffWords(original: string, revised: string): DiffPart[] {
  if (original === revised) {
    return original.length > 0 ? [{ kind: 'same', value: original }] : [];
  }

  const a = tokenize(original);
  const b = tokenize(revised);

  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    // Coarse, but still honest: the invariants above hold, so the view degrades
    // to "all of this changed" rather than showing something wrong.
    return compact([
      { kind: 'removed', value: original },
      { kind: 'added', value: revised },
    ]);
  }

  const width = b.length + 1;
  const lcs = longestCommonSubsequence(a, b, width);

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;

  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      parts.push({ kind: 'same', value: a[i] });
      i++;
      j++;
      continue;
    }

    // Ties go to the removal, so a replaced word reads as the writer's wording
    // struck out and the new wording after it — the order it happened in.
    const removeIsAtLeastAsGood =
      j === b.length || lcs[(i + 1) * width + j] >= lcs[i * width + j + 1];

    if (i < a.length && removeIsAtLeastAsGood) {
      parts.push({ kind: 'removed', value: a[i] });
      i++;
    } else {
      parts.push({ kind: 'added', value: b[j] });
      j++;
    }
  }

  return compact(parts);
}

/** Words and the whitespace between them, each its own token. */
function tokenize(value: string): string[] {
  return value.match(/\s+|\S+/g) ?? [];
}

/**
 * `lcs[i * width + j]` is the length of the longest common subsequence of
 * `a.slice(i)` and `b.slice(j)`. Filled backwards so the walk above can read
 * it forwards, which is what keeps the output in reading order.
 */
function longestCommonSubsequence(
  a: readonly string[],
  b: readonly string[],
  width: number,
): Int32Array {
  const lcs = new Int32Array((a.length + 1) * width);

  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i * width + j] =
        a[i] === b[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  return lcs;
}

/** Merges adjacent runs of the same kind, so a view renders one mark per change. */
function compact(parts: readonly DiffPart[]): DiffPart[] {
  const merged: DiffPart[] = [];

  for (const part of parts) {
    if (part.value.length === 0) continue;

    const last = merged[merged.length - 1];
    if (last && last.kind === part.kind) {
      merged[merged.length - 1] = { kind: last.kind, value: last.value + part.value };
      continue;
    }

    merged.push(part);
  }

  return merged;
}

/** The text as it was typed, recovered from a diff. */
export function originalOf(parts: readonly DiffPart[]): string {
  return parts
    .filter((part) => part.kind !== 'added')
    .map((part) => part.value)
    .join('');
}

/** The text as it stands now, recovered from a diff. */
export function revisedOf(parts: readonly DiffPart[]): string {
  return parts
    .filter((part) => part.kind !== 'removed')
    .map((part) => part.value)
    .join('');
}

/**
 * The single word a gated suggestion is actually teaching.
 *
 * A gate can cover a phrase — the model returns "big effect" → "significant
 * effect" as readily as "big" → "significant" — and the card that opens behind
 * it is looked up in a dictionary, which has entries for words and not for
 * phrases. So a phrase gate used to render a marker the reader could click and
 * nothing could ever answer: a dead end in the one interaction the product is
 * built around.
 *
 * The word being taught is the word the diff *adds*. "big effect" becomes
 * "significant effect" by adding one word, and that word is the lesson; the
 * rest of the phrase is context that happened to sit inside the span.
 *
 * Falls back to the whole replacement when the change is not one word —
 * "because of the fact that" → "because" adds nothing, and "because" is the
 * right answer there anyway. A genuinely multi-word coinage still fails to
 * find an entry, which is honest: there is no card to write for it.
 */
export function wordToTeach(original: string, replacement: string): string {
  const added = diffWords(original, replacement)
    .filter((part) => part.kind === 'added')
    .flatMap((part) => part.value.split(/\s+/))
    // Punctuation moves around inside a span without being the lesson.
    .map((token) => token.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter((token) => /\p{L}/u.test(token));

  return added.length === 1 ? added[0] : replacement.trim();
}
