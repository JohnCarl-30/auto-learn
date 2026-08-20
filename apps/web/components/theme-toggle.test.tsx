import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'next-themes';
import { ThemeToggle } from './theme-toggle';

/**
 * `globals.css` has always carried a full `.dark` palette, and nothing ever put
 * that class on the document — so the whole thing was unreachable. What is
 * worth pinning is the class actually landing, since that is the single point
 * the palette hangs off.
 */
const setup = () => {
  render(
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
      <ThemeToggle />
    </ThemeProvider>,
  );
  return { user: userEvent.setup() };
};

describe('ThemeToggle', () => {
  afterEach(() => {
    document.documentElement.className = '';
    window.localStorage.clear();
  });

  it('puts the dark class on the document, and takes it off again', async () => {
    const { user } = setup();
    const toggle = screen.getByTestId('theme-toggle');

    expect(document.documentElement).not.toHaveClass('dark');

    await user.click(toggle);
    expect(document.documentElement).toHaveClass('dark');

    await user.click(toggle);
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('carries a name that does not depend on the resolved theme', () => {
    setup();

    // Deliberately fixed. The server cannot know what the reader's machine
    // prefers, so a label that read the theme would differ across hydration.
    expect(screen.getByTestId('theme-toggle')).toHaveAccessibleName(
      'Toggle theme',
    );
  });
});
