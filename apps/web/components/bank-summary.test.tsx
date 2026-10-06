jest.mock('@/lib/bank', () => ({ countBank: jest.fn() }));
jest.mock('@/lib/sync', () => ({ syncBank: jest.fn() }));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { countBank } from '@/lib/bank';
import { syncBank } from '@/lib/sync';
import { BankSummary } from './bank-summary';

const counts = countBank as jest.Mock;
const syncs = syncBank as jest.Mock;

describe('BankSummary', () => {
  beforeEach(() => {
    counts.mockReset();
    syncs.mockReset();
    counts.mockResolvedValue(3);
    syncs.mockResolvedValue({ total: 5, syncedAt: '2026-09-30T00:00:00.000Z' });
  });

  /**
   * Someone who just signed in on a new device came here to find their words,
   * not to press a button — so the sync happens on arrival.
   */
  it('syncs on arrival without being asked', async () => {
    render(<BankSummary />);
    await waitFor(() => expect(syncs).toHaveBeenCalledTimes(1));
  });

  it('reports the count the sync settled on, not the one it started with', async () => {
    render(<BankSummary />);

    // 3 locally before, 5 after the account's words arrived.
    expect(await screen.findByText('5 words banked.')).toBeInTheDocument();
  });

  it('does not say "1 words"', async () => {
    counts.mockResolvedValue(1);
    syncs.mockResolvedValue({ total: 1, syncedAt: '2026-09-30T00:00:00.000Z' });
    render(<BankSummary />);

    expect(await screen.findByText('1 word banked.')).toBeInTheDocument();
  });

  it('says the words are on the account once they are', async () => {
    render(<BankSummary />);

    await waitFor(() =>
      expect(screen.getByTestId('bank-sync')).toHaveTextContent(
        'Synced to your account',
      ),
    );
  });

  /**
   * The promise the product makes, said where someone will look for it: a word
   * found on a new device with no sentence under it was the deal, not a bug.
   */
  it('says the sentences stay behind', async () => {
    render(<BankSummary />);

    await screen.findByText('5 words banked.');
    expect(
      screen.getByText(/sentences you wrote them in stay on the device/),
    ).toBeInTheDocument();
  });

  describe('when the sync fails', () => {
    beforeEach(() => syncs.mockRejectedValue(new Error('offline')));

    /**
     * The one thing this must never do is claim the words are safe when the
     * request did not land.
     */
    it('says so plainly, and does not claim the account has them', async () => {
      render(<BankSummary />);

      await waitFor(() =>
        expect(screen.getByTestId('bank-sync')).toHaveTextContent(
          "Couldn't reach your account",
        ),
      );
      expect(screen.getByTestId('bank-sync')).not.toHaveTextContent(
        'Synced to your account',
      );
    });

    it('says nothing was lost, because nothing was', async () => {
      render(<BankSummary />);

      await waitFor(() =>
        expect(screen.getByTestId('bank-sync')).toHaveTextContent(
          'Nothing was lost',
        ),
      );
    });

    it('still reports the words that are here', async () => {
      render(<BankSummary />);
      expect(await screen.findByText('3 words banked.')).toBeInTheDocument();
    });

    it('offers a retry that actually retries', async () => {
      const user = userEvent.setup();
      render(<BankSummary />);

      await screen.findByTestId('bank-retry');
      syncs.mockResolvedValue({
        total: 4,
        syncedAt: '2026-09-30T00:10:00.000Z',
      });
      await user.click(screen.getByTestId('bank-retry'));

      expect(await screen.findByText('4 words banked.')).toBeInTheDocument();
      expect(syncs).toHaveBeenCalledTimes(2);
    });
  });

  it('survives a browser that will not give it IndexedDB', async () => {
    counts.mockRejectedValue(new Error('blocked'));
    render(<BankSummary />);

    await waitFor(() =>
      expect(screen.getByTestId('bank-sync')).toHaveTextContent(
        "Couldn't reach your account",
      ),
    );
    expect(syncs).not.toHaveBeenCalled();
  });
});
