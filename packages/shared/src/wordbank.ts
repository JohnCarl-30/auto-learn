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
