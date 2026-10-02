jest.mock('next-auth/react', () => ({ useSession: jest.fn() }));

import { render, screen } from '@testing-library/react';
import { useSession } from 'next-auth/react';
import { AccountMenu } from './account-menu';

const session = useSession as jest.Mock;

describe('AccountMenu', () => {
  it('offers the account to someone signed in', () => {
    session.mockReturnValue({
      status: 'authenticated',
      data: { user: { id: 'u1', email: 'writer@school.edu' } },
    });
    render(<AccountMenu />);

    expect(screen.getByTestId('account-link')).toHaveAttribute(
      'href',
      '/account',
    );
  });

  it('offers to sign in when nobody is', () => {
    session.mockReturnValue({ status: 'unauthenticated', data: null });
    render(<AccountMenu />);

    expect(screen.getByTestId('sign-in-link')).toHaveAttribute(
      'href',
      '/signin',
    );
  });

  /**
   * The states differ by one word, and the wrong one is not a cosmetic slip:
   * flashing "Sign in" at someone who is signed in reads as having been logged
   * out, which is alarming in a product that holds work.
   */
  it('shows neither while the session is still loading', () => {
    session.mockReturnValue({ status: 'loading', data: null });
    render(<AccountMenu />);

    expect(screen.queryByTestId('sign-in-link')).not.toBeInTheDocument();
    expect(screen.queryByTestId('account-link')).not.toBeInTheDocument();
  });
});
