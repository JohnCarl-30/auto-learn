import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardResponse } from '@auto-learn/shared';
import { WordCard, type CardState } from './word-card';

const CARD: CardResponse = {
  kind: 'card',
  card: {
    word: 'substantial',
    lemma: 'substantial',
    partOfSpeech: 'adjective',
    definition: 'Large in amount, size or importance.',
    senseId: 's1',
    synonyms: [
      { word: 'significant', nuance: 'broader; often about meaning, not size' },
      { word: 'considerable', nuance: 'slightly more formal' },
    ],
    useCases: [
      'The study found a substantial increase.',
      'There is substantial evidence for this.',
    ],
    register: 'formal',
    whyHere: 'Precise where "very big" only sounds emphatic.',
  },
  replacement: 'substantial',
  alternative: 'considerable',
};

const NOTE: CardResponse = {
  kind: 'note',
  note: {
    corrected: 'shows',
    note: '"results" is plural, so the verb agrees.',
  },
  replacement: 'shows',
  alternative: null,
};

const setup = (state: CardState) => {
  const handlers = {
    onAccept: jest.fn(),
    onReject: jest.fn(),
    onDismiss: jest.fn(),
  };
  render(<WordCard state={state} {...handlers} />);
  return { ...handlers, user: userEvent.setup() };
};

describe('WordCard rendering a word card', () => {
  it('shows the word, its part of speech and register', () => {
    setup({ status: 'ready', response: CARD });
    expect(screen.getByText('substantial')).toBeInTheDocument();
    expect(screen.getByText('adjective')).toBeInTheDocument();
    expect(screen.getByText('formal')).toBeInTheDocument();
  });

  it('shows each synonym with the nuance that separates it', () => {
    setup({ status: 'ready', response: CARD });
    expect(screen.getByText('significant')).toBeInTheDocument();
    expect(
      screen.getByText(/broader; often about meaning, not size/),
    ).toBeInTheDocument();
  });

  it('shows both use cases', () => {
    setup({ status: 'ready', response: CARD });
    expect(
      screen.getByText('The study found a substantial increase.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('There is substantial evidence for this.'),
    ).toBeInTheDocument();
  });

  it('renders quoted prose with typographic quotes', () => {
    setup({ status: 'ready', response: CARD });
    expect(
      screen.getByText(/Precise where “very big” only sounds emphatic\./),
    ).toBeInTheDocument();
  });
});

describe('WordCard rendering a grammar note', () => {
  it('shows the rule, not a vocabulary card', () => {
    setup({ status: 'ready', response: NOTE });

    expect(screen.getByText('shows')).toBeInTheDocument();
    expect(screen.getByText('grammar')).toBeInTheDocument();
    expect(
      screen.getByText(/“results” is plural, so the verb agrees\./),
    ).toBeInTheDocument();
  });

  it('offers nothing to learn as vocabulary', () => {
    setup({ status: 'ready', response: NOTE });
    expect(screen.queryByText('adjective')).not.toBeInTheDocument();
    expect(screen.queryByText('significant')).not.toBeInTheDocument();
  });
});

describe('WordCard actions', () => {
  it('passes the withheld replacement up on accept', async () => {
    const { user, onAccept } = setup({ status: 'ready', response: CARD });
    await user.click(screen.getByTestId('accept'));
    expect(onAccept).toHaveBeenCalledWith('substantial');
  });

  it('reports a rejection without a replacement', async () => {
    const { user, onReject, onAccept } = setup({
      status: 'ready',
      response: CARD,
    });
    await user.click(screen.getByTestId('reject'));
    expect(onReject).toHaveBeenCalled();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('offers the alternative as a second way to accept', async () => {
    const { user, onAccept } = setup({ status: 'ready', response: CARD });
    await user.click(screen.getByRole('button', { name: 'considerable' }));
    expect(onAccept).toHaveBeenCalledWith('considerable');
  });

  it('offers no accept or reject for a plain lookup', () => {
    setup({
      status: 'ready',
      response: { ...CARD, replacement: null, alternative: null },
    });
    expect(screen.queryByTestId('accept')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reject')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

describe('WordCard non-ready states', () => {
  it('shows a placeholder while loading', () => {
    setup({ status: 'loading' });
    expect(screen.queryByTestId('word-card')).not.toBeInTheDocument();
  });

  it('surfaces the error message and a way out', async () => {
    const { user, onDismiss } = setup({
      status: 'error',
      error: { code: 'no_dictionary_entry', message: "I couldn't find that." },
    });
    expect(screen.getByText("I couldn't find that.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});
