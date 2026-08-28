import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProposeResponse, ReviewedSentence } from '@auto-learn/shared';
import { ReviewPanel } from './review-panel';

const sentence = (index: number, text: string): ReviewedSentence => ({
  index,
  original: text,
  text,
  silentFixes: [],
  gated: [
    {
      id: `g${index}`,
      type: 'word-choice',
      original: text.split(' ')[0],
      start: 0,
      end: text.split(' ')[0].length,
      teaser: 'stronger word available',
    },
  ],
});

const response = (count: number): ProposeResponse => ({
  sessionId: 'session',
  sentences: Array.from({ length: count }, (_, index) =>
    sentence(index, `Sentence number ${index} reads like this.`),
  ),
});

const setup = (count = 3, focused = 1) => {
  const onFocus = jest.fn();
  render(
    <>
      <ReviewPanel
        response={response(count)}
        focused={focused}
        onFocus={onFocus}
        onOpenGate={jest.fn()}
        onLookup={jest.fn()}
        onStartOver={jest.fn()}
        cardSlot={null}
      />
      <input aria-label="somewhere else" />
    </>,
  );

  return { onFocus, user: userEvent.setup() };
};

/**
 * Moving between sentences was a click handler on a bare div: no role, no tab
 * stop, no key. Every gate outside the focused sentence was unreachable
 * without a mouse.
 */
describe('ReviewPanel choosing a sentence', () => {
  it('offers each unfocused sentence as a named control', () => {
    setup(3, 1);
    const controls = screen.getAllByTestId('focus-sentence');

    expect(controls).toHaveLength(2);
    expect(
      screen.getByRole('button', { name: 'Go to sentence 1' }),
    ).toBeInTheDocument();
  });

  it('is reachable by tab and answers to Enter', async () => {
    const { user, onFocus } = setup(3, 1);

    // Start over comes first in the panel; the sentence before the focused one
    // is the next stop.
    await user.tab();
    await user.tab();
    expect(screen.getAllByTestId('focus-sentence')[0]).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(onFocus).toHaveBeenCalledWith(0);
  });

  it('answers to Space as well, without scrolling the page', async () => {
    const { user, onFocus } = setup(3, 1);
    screen.getAllByTestId('focus-sentence')[0].focus();

    await user.keyboard(' ');

    expect(onFocus).toHaveBeenCalledWith(0);
  });

  it('still answers to a click', async () => {
    const { user, onFocus } = setup(3, 1);
    await user.click(screen.getAllByTestId('focus-sentence')[1]);

    expect(onFocus).toHaveBeenCalledWith(2);
  });
});

describe('ReviewPanel arrow keys', () => {
  it('moves to the next sentence and back', async () => {
    const { user, onFocus } = setup(3, 1);

    await user.keyboard('{ArrowRight}');
    expect(onFocus).toHaveBeenCalledWith(2);

    await user.keyboard('{ArrowLeft}');
    expect(onFocus).toHaveBeenLastCalledWith(0);
  });

  it('stops at both ends rather than wrapping', async () => {
    const last = setup(3, 2);
    await last.user.keyboard('{ArrowRight}');
    expect(last.onFocus).not.toHaveBeenCalled();
  });

  it('says the keys exist', () => {
    setup(3, 1);
    expect(screen.getByTestId('arrow-hint')).toBeInTheDocument();
  });

  it('says nothing, and binds nothing, for a single sentence', async () => {
    const { user, onFocus } = setup(1, 0);

    await user.keyboard('{ArrowRight}');

    expect(onFocus).not.toHaveBeenCalled();
    expect(screen.queryByTestId('arrow-hint')).not.toBeInTheDocument();
  });

  /** Someone in a text field is moving a cursor, not a selection. */
  it('leaves the arrows alone while someone is typing', async () => {
    const { user, onFocus } = setup(3, 1);

    await user.click(screen.getByLabelText('somewhere else'));
    await user.keyboard('{ArrowRight}');

    expect(onFocus).not.toHaveBeenCalled();
  });

  /** A modifier means a browser shortcut — history, word jumps, spaces. */
  it('leaves modified arrows to the browser', async () => {
    const { user, onFocus } = setup(3, 1);

    await user.keyboard('{Meta>}{ArrowRight}{/Meta}');

    expect(onFocus).not.toHaveBeenCalled();
  });
});
