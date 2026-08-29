import { describe, expect, it } from 'vitest';
import { agreement, describeKappa } from './agreement';

const pairs = (spec: Array<[boolean, boolean]>) =>
  spec.map(([judge, human]) => ({ judge, human }));

describe('agreement', () => {
  it('reports perfect agreement as kappa 1', () => {
    const result = agreement(pairs([[true, true], [false, false], [true, true]]));
    expect(result.rawAgreement).toBe(1);
    expect(result.kappa).toBe(1);
  });

  it('gives no credit to a judge that accepts everything', () => {
    // Nine of ten items really are fine, and the judge says yes to all ten. Raw
    // agreement is a flattering 90%; kappa is 0, which is the honest number.
    const result = agreement(
      pairs([...Array.from({ length: 9 }, () => [true, true] as [boolean, boolean]), [true, false]]),
    );
    expect(result.rawAgreement).toBe(0.9);
    expect(result.kappa).toBe(0);
    expect(result.judgeLooser).toBe(1);
  });

  it('separates a judge that is too strict from one that is too loose', () => {
    const result = agreement(pairs([[false, true], [false, true], [true, false]]));
    expect(result.judgeStricter).toBe(2);
    expect(result.judgeLooser).toBe(1);
  });

  it('goes negative when the raters systematically disagree', () => {
    const result = agreement(pairs([[true, false], [false, true], [true, false], [false, true]]));
    expect(result.kappa).toBeLessThan(0);
    expect(describeKappa(result.kappa)).toBe('worse than chance');
  });

  it('survives an empty set rather than dividing by zero', () => {
    expect(agreement([]).kappa).toBe(0);
    expect(agreement([]).n).toBe(0);
  });
});
