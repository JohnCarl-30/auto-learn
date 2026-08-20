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
