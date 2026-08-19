import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ComposePanel } from './compose-panel';

const setup = () => {
  const onSubmit = jest.fn();
  render(<ComposePanel disabled={false} onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
};

describe('ComposePanel', () => {
  it('counts sentences as they are typed', async () => {
    const { user } = setup();
    const box = screen.getByTestId('compose');

    expect(screen.getByTestId('sentence-count')).toHaveTextContent(
      'One to three sentences.',
    );

    await user.type(box, 'Just one.');
    expect(screen.getByTestId('sentence-count')).toHaveTextContent('1 sentence');

    await user.type(box, ' And two. And three.');
    expect(screen.getByTestId('sentence-count')).toHaveTextContent(
      '3 sentences',
    );
  });

  it('offers exactly the four transforms, and no summarize', () => {
    setup();
    expect(screen.getByTestId('option-grammar')).toHaveTextContent(
      'Fix my grammar',
    );
    expect(screen.getByTestId('option-natural')).toBeInTheDocument();
    expect(screen.getByTestId('option-academic')).toBeInTheDocument();
    expect(screen.getByTestId('option-clearer')).toBeInTheDocument();
    expect(screen.queryByText(/summari[sz]e/i)).not.toBeInTheDocument();
  });

  it('disables the transforms while there is nothing to work on', async () => {
    const { user } = setup();
    expect(screen.getByTestId('option-academic')).toBeDisabled();

    await user.type(screen.getByTestId('compose'), 'Something.');
    expect(screen.getByTestId('option-academic')).toBeEnabled();
  });

  it('warns over the cap but keeps the button live', async () => {
    const { user, onSubmit } = setup();
    await user.type(
      screen.getByTestId('compose'),
      'One. Two. Three. Four. Five.',
    );

    expect(screen.getByTestId('sentence-count')).toHaveTextContent(
      '5 sentences',
    );
    expect(screen.getByText(/more than I take at once/i)).toBeInTheDocument();

    // Deliberately still submittable: the server has to see the attempt,
    // because the overflow count is the signal that decides whether
    // whole-essay mode is worth building.
    const button = screen.getByTestId('option-academic');
    expect(button).toBeEnabled();

    await user.click(button);
    expect(onSubmit).toHaveBeenCalledWith(
      'One. Two. Three. Four. Five.',
      'academic',
    );
  });

  it('passes the chosen transform through', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByTestId('compose'), 'A sentence.');
    await user.click(screen.getByTestId('option-clearer'));

    expect(onSubmit).toHaveBeenCalledWith('A sentence.', 'clearer');
  });
});
