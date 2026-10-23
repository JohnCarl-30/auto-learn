import { describe, expect, it } from 'vitest';
import {
  ConverseRequest,
  MAX_HISTORY_TURNS,
  MAX_TURN_CHARS,
  SCENARIO_CONTEXT,
  SCENARIO_LABELS,
  SCENARIO_OPENERS,
  Scenario,
  recentTurns,
  type ConverseTurn,
} from './converse';

const turn = (i: number): ConverseTurn => ({
  role: i % 2 === 0 ? 'partner' : 'learner',
  text: `turn ${i}`,
});

describe('recentTurns', () => {
  it('keeps everything under the cap, in order', () => {
    const turns = [turn(0), turn(1), turn(2)];
    expect(recentTurns(turns)).toEqual(turns);
  });

  it('drops the oldest turns, never the newest', () => {
    const turns = Array.from({ length: MAX_HISTORY_TURNS + 3 }, (_, i) => turn(i));
    const kept = recentTurns(turns);
    expect(kept).toHaveLength(MAX_HISTORY_TURNS);
    expect(kept[0].text).toBe('turn 3');
    expect(kept.at(-1)?.text).toBe(`turn ${MAX_HISTORY_TURNS + 2}`);
  });
});

describe('ConverseRequest', () => {
  const valid = {
    scenario: 'office-hours',
    history: [{ role: 'partner', text: 'Come in.' }],
    utterance: 'I want ask about the deadline.',
  };

  it('accepts a turn with history', () => {
    expect(ConverseRequest.safeParse(valid).success).toBe(true);
  });

  it('refuses a blank utterance, even one that is only spaces', () => {
    expect(ConverseRequest.safeParse({ ...valid, utterance: '   ' }).success).toBe(false);
  });

  it('bounds what one request can carry', () => {
    const long = 'a'.repeat(MAX_TURN_CHARS + 1);
    expect(ConverseRequest.safeParse({ ...valid, utterance: long }).success).toBe(false);
    const history = Array.from({ length: MAX_HISTORY_TURNS + 1 }, (_, i) => turn(i));
    expect(ConverseRequest.safeParse({ ...valid, history }).success).toBe(false);
  });

  it('refuses a scenario it has no partner for', () => {
    expect(ConverseRequest.safeParse({ ...valid, scenario: 'job-interview' }).success).toBe(false);
  });
});

describe('scenarios', () => {
  it('every scenario has a label, a partner, and an opener', () => {
    for (const scenario of Scenario.options) {
      expect(SCENARIO_LABELS[scenario]).toBeTruthy();
      expect(SCENARIO_CONTEXT[scenario]).toBeTruthy();
      expect(SCENARIO_OPENERS[scenario]).toBeTruthy();
    }
  });
});
