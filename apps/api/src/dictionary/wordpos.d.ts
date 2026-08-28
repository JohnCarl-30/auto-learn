/**
 * `wordpos` ships no types and has no @types package.
 *
 * Declared here rather than cast at every call site: this is the whole surface
 * the service uses, and writing it down is what makes the mapping below
 * typecheck against something. Only `lookup` is declared, because only
 * `lookup` is used — a fuller guess would be fiction.
 */
declare module 'wordpos' {
  /** One synset: a sense, with the words that share it. */
  export interface WordPosResult {
    /** 'n' noun, 'v' verb, 'a' adjective, 's' adjective satellite, 'r' adverb. */
    pos: string;
    /** The gloss, with the usage examples stripped out into `exp`. */
    def: string;
    /** Usage examples WordNet ships with the sense. */
    exp: string[];
    /** Every lemma in this synset, the headword included. */
    synonyms: string[];
    /** Stable within a WordNet release; unique only together with `pos`. */
    synsetOffset: number;
  }

  export default class WordPOS {
    lookup(word: string, callback: (results: WordPosResult[]) => void): void;
  }
}
