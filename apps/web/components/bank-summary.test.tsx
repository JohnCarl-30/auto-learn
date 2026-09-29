jest.mock('@/lib/bank', () => ({ countBank: jest.fn() }));

import { render, screen } from '@testing-library/react';
import { countBank } from '@/lib/bank';
import { BankSummary } from './bank-summary';

const counts = countBank as jest.Mock;

describe('BankSummary', () => {
  beforeEach(() => counts.mockReset());

  it('counts the words on this device', async () => {
    counts.mockResolvedValue(12);
    render(<BankSummary />);

    // `findByText`, not `findByTestId`: the element is there from the first
    // render saying "Counting…", so waiting for the node finds it immediately
    // and asserts against the placeholder.
    expect(
      await screen.findByText('12 words banked on this device.'),
    ).toBeInTheDocument();
  });

  it('does not say "1 words"', async () => {
    counts.mockResolvedValue(1);
    render(<BankSummary />);

    expect(
      await screen.findByText('1 word banked on this device.'),
    ).toBeInTheDocument();
  });

  /**
   * The honest line is the reason this component exists. Someone who signs in on
   * a phone and finds an empty bank should have been told here that signing in
   * does not move it yet.
   */
  it('says the words have not left this browser', async () => {
    counts.mockResolvedValue(3);
    render(<BankSummary />);

    await screen.findByText('3 words banked on this device.');
    expect(
      screen.getByText(/Still stored in this browser only/),
    ).toBeInTheDocument();
  });

  it('stays quiet rather than throwing when IndexedDB is unavailable', async () => {
    counts.mockRejectedValue(new Error('blocked'));
    render(<BankSummary />);

    // Nothing to assert but the absence of a crash and the presence of the page.
    expect(await screen.findByTestId('bank-count')).toBeInTheDocument();
  });
});
