import { z } from 'zod';
import { PartOfSpeech, Register, SynonymNuance } from './card';

/**
 * A word the user *chose* — either by accepting the suggestion that introduced
 * it, or by tapping it out of curiosity. Being shown a card does not qualify;
 * intent is the filter, which is what keeps the bank honest for the review
 * layer later (reviewing words you rejected would be actively wrong).
 *
 * This lives in IndexedDB today. The shape deliberately mirrors the eventual
 * server table so the claim-your-bank migration is a copy, not a rewrite.
 */
export const BankEntry = z.object({
  id: z.string(),
  word: z.string(),
  lemma: z.string(),
  partOfSpeech: PartOfSpeech,
  senseId: z.string(),
  definition: z.string(),
  synonyms: z.array(SynonymNuance),
  useCases: z.array(z.string()),
  register: Register,
  /** The user's own sentence it came from — the memory hook. */
  sourceSentence: z.string(),
  addedVia: z.enum(['accepted', 'tapped']),
  addedAt: z.string(),
  /** Incremented when the user later uses this word unprompted. */
  timesReused: z.number().int().default(0),
  lastReusedAt: z.string().nullable().default(null),
});
export type BankEntry = z.infer<typeof BankEntry>;

/** Offer the account prompt once the bank is worth losing. */
export const CLAIM_PROMPT_THRESHOLD = 8;

/**
 * A bank, out of the browser it was built in.
 *
 * Until there are accounts, the bank exists in one browser's IndexedDB and
 * nowhere else — clearing site data destroys everything the product taught
 * someone, silently and unrecoverably. This is the way out.
 *
 * Versioned from the first release rather than when it first hurts: a file
 * written today has to still be readable by whatever reads it back, and a
 * version field costs nothing now and cannot be added retroactively to files
 * already on someone's disk.
 *
 * Entries are the full records, not a summary. A backup that drops
 * `timesReused` or `sourceSentence` restores a worse bank than it saved.
 */
export const BANK_EXPORT_VERSION = 1;

export const BankExport = z.object({
  version: z.literal(BANK_EXPORT_VERSION),
  exportedAt: z.string(),
  entries: z.array(BankEntry),
});
export type BankExport = z.infer<typeof BankExport>;
