/**
 * Inter-rater agreement between the judge and a human.
 *
 * Raw agreement alone flatters a judge that says "fine" to everything: if 90%
 * of synonyms are genuinely fine, a judge that never objects agrees 90% of the
 * time while carrying no information. Cohen's kappa subtracts the agreement
 * you would expect from the two raters' base rates, which is what makes it the
 * number worth reporting.
 */
export interface Pair {
  /** The judge accepted the item. */
  judge: boolean;
  /** The human accepted it. */
  human: boolean;
}

export interface Agreement {
  n: number;
  agreed: number;
  rawAgreement: number;
  kappa: number;
  judgeOkRate: number;
  humanOkRate: number;
  /** Judge rejected, human accepted — the judge is too strict here. */
  judgeStricter: number;
  /** Judge accepted, human rejected — the judge is missing real defects. */
  judgeLooser: number;
}

export function agreement(pairs: Pair[]): Agreement {
  const n = pairs.length;
  if (n === 0) {
    return {
      n: 0,
      agreed: 0,
      rawAgreement: 0,
      kappa: 0,
      judgeOkRate: 0,
      humanOkRate: 0,
      judgeStricter: 0,
      judgeLooser: 0,
    };
  }

  const agreed = pairs.filter((p) => p.judge === p.human).length;
  const judgeOk = pairs.filter((p) => p.judge).length / n;
  const humanOk = pairs.filter((p) => p.human).length / n;
  const observed = agreed / n;

  // Agreement expected from the base rates alone, if the two rated independently.
  const expected = judgeOk * humanOk + (1 - judgeOk) * (1 - humanOk);

  // expected === 1 means both raters were unanimous in the same direction, and
  // kappa is undefined there. Report perfect agreement as 1 and anything else
  // as 0 rather than dividing by zero.
  const kappa =
    expected === 1 ? (observed === 1 ? 1 : 0) : (observed - expected) / (1 - expected);

  return {
    n,
    agreed,
    rawAgreement: observed,
    kappa,
    judgeOkRate: judgeOk,
    humanOkRate: humanOk,
    judgeStricter: pairs.filter((p) => !p.judge && p.human).length,
    judgeLooser: pairs.filter((p) => p.judge && !p.human).length,
  };
}

/** Landis & Koch's bands, which is the convention these numbers get read against. */
export function describeKappa(kappa: number): string {
  if (kappa < 0) return 'worse than chance';
  if (kappa < 0.21) return 'slight';
  if (kappa < 0.41) return 'fair';
  if (kappa < 0.61) return 'moderate';
  if (kappa < 0.81) return 'substantial';
  return 'almost perfect';
}
