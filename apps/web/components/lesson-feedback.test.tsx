/**
 * The network and the recorder are mocked: these are about what the feedback
 * says, and the card behind a gate is tested in lib/use-gated-review.test.tsx.
 */
jest.mock('@/lib/api', () => ({
  ApiFailure: class ApiFailure extends Error {},
  fetchCardStream: jest.fn(),
  reportEvent: jest.fn(),
  speak: jest.fn(),
}));
jest.mock('@/lib/bank', () => ({ bankWord: jest.fn() }));
jest.mock('@/lib/use-dictation', () => ({ useDictation: jest.fn() }));

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UNITS, type LessonFeedbackResponse } from '@auto-learn/shared';
import type { SpokenResult } from '@/lib/use-lesson';
import { LessonFeedback } from './lesson-feedback';

const feedback = (over: Partial<LessonFeedbackResponse> = {}): LessonFeedbackResponse => ({
  firstSentence: 'My best project is a vocabulary app.',
  pointFirst: true,
  pointFirstNote: 'That states your point straight away.',
  parts: [{ label: 'point', quote: 'My best project is a vocabulary app.' }],
  structureNote: 'Clear and in order.',
  wordUse: null,
  reviewedText: null,
  review: null,
  ...over,
});

const attempt = (over: Partial<SpokenResult> = {}): SpokenResult => ({
  answer: 'My best project is a vocabulary app.',
  seconds: 42,
  fillers: { total: 0, byWord: {} },
  feedback: feedback(),
  ...over,
});

const unit = (id: number) => UNITS[id - 1];

describe('LessonFeedback', () => {
  it('quotes the first sentence back', () => {
    render(<LessonFeedback unit={unit(1)} attempt={attempt()} retryTarget={false} />);
    expect(screen.getByTestId('first-sentence')).toHaveTextContent(
      'Your first sentence: ‘My best project is a vocabulary app.’',
    );
    expect(screen.getByText('That states your point straight away.')).toBeInTheDocument();
  });

  it('says "Not heard" for a part the answer did not have', () => {
    const missing = feedback({
      parts: [
        { label: 'point', quote: 'Coding early helps.' },
        { label: 'reason', quote: null },
        { label: 'example', quote: null },
      ],
    });
    render(
      <LessonFeedback unit={unit(2)} attempt={attempt({ feedback: missing })} retryTarget={false} />,
    );
    expect(screen.getAllByText('Not heard')).toHaveLength(2);
    expect(screen.getByText('‘Coding early helps.’')).toBeInTheDocument();
  });

  it('shows how long against the target', () => {
    render(<LessonFeedback unit={unit(2)} attempt={attempt()} retryTarget={false} />);
    expect(screen.getByTestId('duration')).toHaveTextContent('You spoke for 0:42 (target 0:45)');
  });

  it('hides the duration when the answer was typed', () => {
    render(
      <LessonFeedback unit={unit(2)} attempt={attempt({ seconds: null })} retryTarget={false} />,
    );
    expect(screen.queryByTestId('duration')).toBeNull();
  });

  it('shows no breakdown when no fillers were heard', () => {
    render(<LessonFeedback unit={unit(1)} attempt={attempt()} retryTarget={false} />);
    expect(screen.getByTestId('fillers')).toHaveTextContent(/^Fillers heard: 0$/);
  });

  it('breaks the fillers down, most heard first', () => {
    const fillers = { total: 3, byWord: { like: 1, um: 2 } };
    render(<LessonFeedback unit={unit(1)} attempt={attempt({ fillers })} retryTarget={false} />);
    expect(screen.getByTestId('fillers')).toHaveTextContent(
      'Fillers heard: 3 (um ×2, like ×1)',
    );
  });

  it('offers the unit 3 retry at twenty seconds after the first attempt', async () => {
    const onRetry = jest.fn();
    render(
      <LessonFeedback unit={unit(3)} attempt={attempt()} retryTarget={false} onRetry={onRetry} />,
    );
    await userEvent.setup().click(
      screen.getByRole('button', { name: 'Now say it in 20 seconds' }),
    );
    expect(onRetry).toHaveBeenCalled();
  });

  it('judges the unit 3 retry against its twenty-second target', () => {
    render(<LessonFeedback unit={unit(3)} attempt={attempt({ seconds: 18 })} retryTarget />);
    expect(screen.getByTestId('duration')).toHaveTextContent('You spoke for 0:18 (target 0:20)');
    expect(screen.queryByRole('button', { name: /say it/ })).toBeNull();
  });

  it('keeps the better wording behind the gate until the card opens', () => {
    const SENTENCE = 'The essay is very big.';
    const gated = feedback({
      reviewedText: SENTENCE,
      review: {
        sessionId: 'session-1',
        sentences: [
          {
            index: 0,
            original: SENTENCE,
            text: SENTENCE,
            silentFixes: [],
            gated: [
              {
                id: 'gate-1',
                type: 'word-choice',
                original: 'very big',
                start: 13,
                end: 21,
                teaser: 'stronger word available',
              },
            ],
          },
        ],
      },
    });
    render(<LessonFeedback unit={unit(1)} attempt={attempt({ feedback: gated })} retryTarget={false} />);

    expect(screen.getByTestId('teaser')).toHaveTextContent('very big — stronger word available');
    expect(screen.queryByTestId('word-card')).toBeNull();
  });
});
