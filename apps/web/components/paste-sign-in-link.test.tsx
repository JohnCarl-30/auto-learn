import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PasteSignInLink } from './paste-sign-in-link';

// jsdom's origin, which is what the component compares against.
const LINK = `${window.location.origin}/api/auth/callback/resend?token=abc&email=a%40b.c`;

describe('PasteSignInLink', () => {
  it('opens a pasted sign-in link from this site in this window', async () => {
    const go = jest.fn();
    const user = userEvent.setup();
    render(<PasteSignInLink go={go} />);

    await user.click(screen.getByTestId('paste-link'));
    await user.paste(LINK);
    await user.click(screen.getByTestId('paste-link-submit'));

    expect(go).toHaveBeenCalledWith(LINK);
    expect(screen.queryByTestId('paste-link-error')).toBeNull();
  });

  it.each([
    ['a link to another site', 'https://evil.example/api/auth/callback/resend?token=abc'],
    ['a link to another page here', `${window.location.origin}/account`],
    ['something that is not a link', 'hello'],
    ['nothing at all', ''],
  ])('refuses %s, says why, and goes nowhere', async (_, input) => {
    const go = jest.fn();
    const user = userEvent.setup();
    render(<PasteSignInLink go={go} />);

    if (input) {
      await user.click(screen.getByTestId('paste-link'));
      await user.paste(input);
    }
    await user.click(screen.getByTestId('paste-link-submit'));

    expect(go).not.toHaveBeenCalled();
    expect(screen.getByTestId('paste-link-error')).toHaveTextContent(
      "isn't a sign-in link from this site",
    );
    expect(screen.getByTestId('paste-link')).toHaveAttribute('aria-invalid', 'true');
  });

  it('tells an iPhone user to copy the link rather than tap it', () => {
    render(<PasteSignInLink go={jest.fn()} />);
    expect(screen.getByText(/long-press the\s+link/)).toHaveTextContent('15 minutes');
  });
});
