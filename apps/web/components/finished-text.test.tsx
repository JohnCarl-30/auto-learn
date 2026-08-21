import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import type { ProposeResponse } from '@auto-learn/shared';
import { FinishedText } from './finished-text';

jest.mock('sonner', () => ({
  toast: { success: jest.fn(), error: jest.fn() },
}));

const response = {
  sessionId: 'session',
  sentences: [
    { index: 0, text: 'The results were substantial.', silentFixes: [], gated: [] },
    { index: 1, text: 'They warrant further study.', silentFixes: [], gated: [] },
  ],
} as unknown as ProposeResponse;

/**
 * Installed after `userEvent.setup()`, which swaps in a clipboard stub of its
 * own — do it the other way round and the component writes to user-event's
 * copy and this one never sees the call.
 */
const setup = (writeText: jest.Mock) => {
  const user = userEvent.setup();

  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  });

  render(<FinishedText response={response} />);
  return user;
};

describe('FinishedText', () => {
  beforeEach(() => jest.clearAllMocks());

  it('copies every sentence, joined as prose', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const user = setup(writeText);

    await user.click(screen.getByTestId('copy'));

    expect(writeText).toHaveBeenCalledWith(
      'The results were substantial. They warrant further study.',
    );
    expect(toast.success).toHaveBeenCalledWith('Copied');
  });

  /**
   * The clipboard is blocked by permissions and by insecure contexts, and the
   * failure used to be swallowed — the button simply did nothing, which reads
   * as broken. The text is selectable either way, so say so.
   */
  it('says so when the clipboard refuses, rather than going quiet', async () => {
    const writeText = jest.fn().mockRejectedValue(new Error('denied'));
    const user = setup(writeText);

    await user.click(screen.getByTestId('copy'));

    expect(toast.error).toHaveBeenCalledWith(
      'Could not copy. Select the text and copy it yourself.',
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});

/**
 * The diff is what makes "learn the word that fixed it" checkable — the
 * finished text alone shows the destination and hides the journey.
 */
describe('FinishedText showing the changes', () => {
  const revised = {
    sessionId: 'session',
    sentences: [
      {
        index: 0,
        original: 'The results were very big.',
        text: 'The results were substantial.',
        silentFixes: [],
        gated: [],
      },
    ],
  } as unknown as ProposeResponse;

  it('keeps the plain, copyable text as the default view', () => {
    render(<FinishedText response={revised} />);

    expect(screen.getByTestId('finished-text')).toHaveTextContent(
      'The results were substantial.',
    );
    expect(screen.queryByTestId('diff-text')).not.toBeInTheDocument();
  });

  it('shows what was replaced, and what replaced it', async () => {
    const user = userEvent.setup();
    render(<FinishedText response={revised} />);

    await user.click(screen.getByTestId('toggle-changes'));

    const diff = screen.getByTestId('diff-text');
    expect(diff).toHaveTextContent('The results were very big.substantial.');
    expect(screen.getByTestId('diff-removed')).toHaveTextContent('very big.');
    expect(screen.getByTestId('diff-added')).toHaveTextContent('substantial.');
  });

  it('goes back to the plain text, which is what people came for', async () => {
    const user = userEvent.setup();
    render(<FinishedText response={revised} />);

    await user.click(screen.getByTestId('toggle-changes'));
    await user.click(screen.getByTestId('toggle-changes'));

    expect(screen.getByTestId('finished-text')).toBeInTheDocument();
    expect(screen.queryByTestId('diff-text')).not.toBeInTheDocument();
  });

  /**
   * A toggle that reveals an unchanged sentence teaches nothing and reads as
   * broken, so it is not offered.
   */
  it('offers no toggle when nothing changed', () => {
    const untouched = {
      sessionId: 'session',
      sentences: [
        {
          index: 0,
          original: 'This reads well already.',
          text: 'This reads well already.',
          silentFixes: [],
          gated: [],
        },
      ],
    } as unknown as ProposeResponse;

    render(<FinishedText response={untouched} />);
    expect(screen.queryByTestId('toggle-changes')).not.toBeInTheDocument();
  });

  it('copies the revision, never the diff', async () => {
    const writeText = jest.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    render(<FinishedText response={revised} />);
    await user.click(screen.getByTestId('toggle-changes'));
    await user.click(screen.getByTestId('copy'));

    expect(writeText).toHaveBeenCalledWith('The results were substantial.');
  });
});
