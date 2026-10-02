jest.mock('../app/signin/actions', () => ({ requestLink: jest.fn() }));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { requestLink } from '../app/signin/actions';
import { SignInForm } from './sign-in-form';

const asks = requestLink as jest.Mock;

/**
 * The action is mocked at the module boundary, which is the only way to reach
 * this form from jsdom: `requestLink` is a server function, and its real
 * implementation talks to a mail provider and a database.
 *
 * What is left is worth testing on its own — that a rejected address comes back
 * as something a screen reader announces and does not cost someone what they
 * typed, and that the button cannot be pressed twice into two emails.
 */
describe('SignInForm', () => {
  beforeEach(() => {
    asks.mockReset();
  });

  it('hands the address to the action', async () => {
    asks.mockResolvedValue({});
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText('Email'), 'writer@school.edu');
    await user.click(screen.getByRole('button', { name: 'Email me a link' }));

    await waitFor(() => expect(asks).toHaveBeenCalled());
    const form = asks.mock.calls[0][1] as FormData;
    expect(form.get('email')).toBe('writer@school.edu');
  });

  /**
   * The address here is a valid one and the failure is the provider's, which is
   * deliberate: `type="email"` means the browser refuses to submit a malformed
   * address at all, and jsdom enforces that too. A bad address never reaches the
   * action through this form — the action validates it anyway, because a fetch
   * does not have to honour an input type, and that is tested where it lives.
   *
   * What this covers is the failure someone can actually see: a good address and
   * a send that did not work.
   */
  it('announces a failed send rather than only colouring the field', async () => {
    asks.mockResolvedValue({
      error: "Couldn't send that link. Try again in a moment.",
      email: 'writer@school.edu',
    });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText('Email'), 'writer@school.edu');
    await user.click(screen.getByRole('button'));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("Couldn't send that link");
    // Pointed at the message, so a screen reader reaches it from the field.
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-describedby',
      'email-error',
    );
    expect(screen.getByLabelText('Email')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
  });

  it('does not make someone retype the address it just rejected', async () => {
    asks.mockResolvedValue({ error: 'No.', email: 'writer@school.edu' });
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText('Email'), 'writer@school.edu');
    await user.click(screen.getByRole('button'));

    await screen.findByRole('alert');
    expect(screen.getByLabelText('Email')).toHaveValue('writer@school.edu');
  });

  it('cannot be submitted twice into two emails', async () => {
    // Never resolves: the form stays in flight, which is the state being tested.
    asks.mockImplementation(() => new Promise(() => undefined));
    const user = userEvent.setup();
    render(<SignInForm />);

    await user.type(screen.getByLabelText('Email'), 'writer@school.edu');
    await user.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(screen.getByRole('button')).toBeDisabled(),
    );
    await user.click(screen.getByRole('button'));
    expect(asks).toHaveBeenCalledTimes(1);
  });
});
