import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReviewedSentence } from '@auto-learn/shared';
import { SentenceView } from './sentence-view';

//                     0         1         2         3
//                     0123456789012345678901234567890123456789
const TEXT = 'The results were very big and it show a trend.';

const sentence = (
  overrides: Partial<ReviewedSentence> = {},
): ReviewedSentence => ({
  index: 0,
  original: TEXT,
  text: TEXT,
  silentFixes: [],
  gated: [
    {
      id: 'g1',
      type: 'word-choice',
      original: 'very big',
      start: 17,
      end: 25,
      teaser: 'stronger word available',
    },
    {
      id: 'g2',
      type: 'grammar',
      original: 'show',
      start: 33,
      end: 37,
      teaser: 'grammar fix available',
    },
  ],
  ...overrides,
});

const setup = (interactive = true, overrides: Partial<ReviewedSentence> = {}) => {
  const onOpenGate = jest.fn();
  const onLookup = jest.fn();
  render(
    <SentenceView
      sentence={sentence(overrides)}
      interactive={interactive}
      onOpenGate={onOpenGate}
      onLookup={onLookup}
    />,
  );
  return { onOpenGate, onLookup, user: userEvent.setup() };
};

describe('SentenceView gates', () => {
  it('marks grammar and word choice as different kinds of thing', () => {
    setup();
    const gates = screen.getAllByTestId('gate');
    const kinds = gates.map((gate) => gate.getAttribute('data-gate-type'));

    // The distinction is the point: one promises a word to learn, the other a
    // rule. They used to be indistinguishable.
    expect(kinds).toEqual(['word-choice', 'grammar']);
    expect(gates[0].className).not.toBe(gates[1].className);
  });

  it('opens the gate it was clicked on', async () => {
    const { user, onOpenGate } = setup();
    await user.click(screen.getByRole('button', { name: 'very big' }));
    expect(onOpenGate).toHaveBeenCalledWith('g1');
  });

  it('renders the sentence text intact', () => {
    setup();
    expect(screen.getByRole('paragraph')).toHaveTextContent(TEXT);
  });
});

/**
 * An unfocused sentence is text, not a row of dead controls. Disabled buttons
 * are still announced, so a screen reader walking the review used to meet every
 * gate in every sentence and could act on none of them.
 */
describe('SentenceView when the sentence is not focused', () => {
  it('offers nothing to press', () => {
    setup(false);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(screen.queryAllByTestId('word')).toHaveLength(0);
  });

  it('still shows where the suggestions are', () => {
    setup(false);
    expect(screen.getAllByTestId('gate')).toHaveLength(2);
    expect(screen.getByRole('paragraph')).toHaveTextContent(TEXT);
  });
});

describe('SentenceView word lookup', () => {
  it('makes every word tappable, not only the flagged ones', async () => {
    const { user, onLookup } = setup();
    await user.click(screen.getByRole('button', { name: 'results' }));
    expect(onLookup).toHaveBeenCalledWith('results');
  });

  it('strips edge punctuation before looking a word up', async () => {
    const { user, onLookup } = setup();
    await user.click(screen.getByRole('button', { name: 'trend.' }));
    expect(onLookup).toHaveBeenCalledWith('trend');
  });
});

describe('SentenceView silent fixes', () => {
  it('shows the corrected text rather than what was typed', () => {
    setup(true, {
      text: 'The results were fine.',
      silentFixes: [
        {
          id: 's1',
          type: 'typo',
          original: 'reuslts',
          replacement: 'results',
          start: 4,
          end: 11,
          note: 'spelling',
        },
      ],
      gated: [],
    });

    expect(screen.getByRole('paragraph')).toHaveTextContent(
      'The results were fine.',
    );
    expect(screen.queryByText('reuslts')).not.toBeInTheDocument();
  });
});
