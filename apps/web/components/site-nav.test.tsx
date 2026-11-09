jest.mock('next/navigation', () => ({ usePathname: jest.fn() }));
jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'unauthenticated', data: null }),
}));
jest.mock('next-themes', () => ({ useTheme: () => ({ setTheme: jest.fn() }) }));

import { render, screen } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { SiteNav } from './site-nav';

const pathname = usePathname as jest.Mock;

describe('SiteNav', () => {
  it('marks the current section and only that one', () => {
    pathname.mockReturnValue('/learn');
    render(<SiteNav />);
    expect(screen.getByTestId('learn-link')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('write-link')).not.toHaveAttribute('aria-current');
    expect(screen.getByTestId('talk-link')).not.toHaveAttribute('aria-current');
  });

  it('treats only the root as Write, so /learn does not light both', () => {
    pathname.mockReturnValue('/');
    render(<SiteNav />);
    expect(screen.getByTestId('write-link')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('learn-link')).not.toHaveAttribute('aria-current');
  });
});
