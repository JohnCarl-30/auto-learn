import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProposeResponse } from '@auto-learn/shared';
import { ReviewPanel } from './review-panel';

const response = {
  sessionId: 'session',
  sentences: [
    { index: 0, text: 'The results was good.', silentFixes: [], gated: [] },
    { index: 1, text: 'They warrant study.', silentFixes: [], gated: [] },
  ],
} as unknown as ProposeResponse;

const setup = () => {
  const onFocus = jest.fn();
  render(
    <ReviewPanel
      response={response}
      focused={0}
      onFocus={onFocus}
      onOpenGate={jest.fn()}
      onLookup={jest.fn()}
      onStartOver={jest.fn()}
      cardSlot={null}
    />,
  );
  return { onFocus, user: userEvent.setup() };
};

/**
 * Every gate and every word in the focused sentence is a real button, but the
 * unfocused sentence was a bare clickable div — and its own buttons are
 * disabled while it is dimmed, so they are not tab stops either. A keyboard
 * user could reach the first sentence and nothing beyond it.
 */
describe('ReviewPanel', () => {
  it('lets the keyboard reach an unfocused sentence', async () => {
    const { onFocus, user } = setup();
    const sentence = screen.getByTestId('focus-sentence');

    // A tab stop at all — it sits behind Start over and the focused
    // sentence's own word buttons, so the count of tabs is not the point.
    expect(sentence).toHaveAttribute('tabindex', '0');

    sentence.focus();
    await user.keyboard('{Enter}');

    expect(onFocus).toHaveBeenCalledWith(1);
  });

  it('takes Space as well, because that is what a button does', async () => {
    const { onFocus, user } = setup();

    screen.getByTestId('focus-sentence').focus();
    await user.keyboard(' ');

    expect(onFocus).toHaveBeenCalledWith(1);
  });

  it('still switches on a click', async () => {
    const { onFocus, user } = setup();

    await user.click(screen.getByTestId('focus-sentence'));

    expect(onFocus).toHaveBeenCalledWith(1);
  });

  it('leaves the focused sentence out of the tab order', () => {
    setup();

    // Exactly one: the other sentence is the focused one, which is not a
    // control — its gates and words are.
    expect(screen.getAllByTestId('focus-sentence')).toHaveLength(1);
  });
});
