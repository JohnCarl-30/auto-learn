jest.mock('next-auth/react', () => ({ useSession: jest.fn() }));
jest.mock('./sync', () => ({ syncBank: jest.fn() }));

import { render, waitFor } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { syncBank } from './sync';
import { useBankSync } from './use-bank-sync';

const session = useSession as jest.Mock;
const syncs = syncBank as jest.Mock;

function Probe() {
  return <span data-testid="version">{useBankSync()}</span>;
}

describe('useBankSync', () => {
  beforeEach(() => {
    session.mockReset();
    syncs.mockReset();
    syncs.mockResolvedValue({ total: 2, syncedAt: '2026-09-30T00:00:00.000Z' });
  });

  it('does nothing for someone who is not signed in', () => {
    session.mockReturnValue({ status: 'unauthenticated', data: null });
    render(<Probe />);

    expect(syncs).not.toHaveBeenCalled();
  });

  it('does nothing while the session is still loading', () => {
    session.mockReturnValue({ status: 'loading', data: null });
    render(<Probe />);

    expect(syncs).not.toHaveBeenCalled();
  });

  it('pulls the account’s bank in once signed in', async () => {
    session.mockReturnValue({ status: 'authenticated', data: { user: {} } });
    const { getByTestId } = render(<Probe />);

    await waitFor(() => expect(getByTestId('version')).toHaveTextContent('1'));
  });

  /**
   * `status` settles through `loading`, so a dependency on it alone would fire
   * twice — two syncs per page load, on the one request that carries the whole
   * bank both ways.
   */
  it('syncs once, not once per session state it passes through', async () => {
    session.mockReturnValue({ status: 'loading', data: null });
    const { rerender, getByTestId } = render(<Probe />);

    session.mockReturnValue({ status: 'authenticated', data: { user: {} } });
    rerender(<Probe />);
    rerender(<Probe />);

    await waitFor(() => expect(getByTestId('version')).toHaveTextContent('1'));
    expect(syncs).toHaveBeenCalledTimes(1);
  });

  /**
   * The bank is already in this browser and the product works without the
   * server, so a background failure must not take the page down with it. It is
   * reported on the account page, where someone goes to ask.
   */
  it('survives a failed sync without disturbing the page', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    syncs.mockRejectedValue(new Error('offline'));
    session.mockReturnValue({ status: 'authenticated', data: { user: {} } });

    const { getByTestId } = render(<Probe />);

    await waitFor(() => expect(syncs).toHaveBeenCalled());
    expect(getByTestId('version')).toHaveTextContent('0');
    jest.restoreAllMocks();
  });
});
