import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { TransformOption } from '@auto-learn/shared';
import { ComposePanel } from './compose-panel';

/** The panel is controlled, so a test needs someone to hold the text. */
function Harness({
  onSubmit,
}: {
  onSubmit: (text: string, option: TransformOption) => void;
}) {
  const [text, setText] = useState('');

  return (
    <ComposePanel
      text={text}
      onTextChange={setText}
      disabled={false}
      onSubmit={onSubmit}
    />
  );
}

const setup = () => {
  const onSubmit = jest.fn();
  render(<Harness onSubmit={onSubmit} />);
  return { onSubmit, user: userEvent.setup() };
};

/** The panel remembers the last transform, and jsdom keeps localStorage for the file. */
beforeEach(() => window.localStorage.clear());

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

  /**
   * The page unmounts this panel while a proposal is in flight and brings it
   * back on failure, so a draft the panel owned itself returned empty — losing
   * work on the one path where someone most needs it back. Over the cap it was
   * worst: the refusal exists to teach you to send less, which it cannot do
   * once the thing you were meant to trim is gone.
   */
  it('does not own the text, so a failed request cannot eat it', async () => {
    const user = userEvent.setup();
    const onSubmit = jest.fn();

    // The parent holds the draft across the unmount the page performs.
    function Page() {
      const [text, setText] = useState('');
      const [inFlight, setInFlight] = useState(false);

      return (
        <>
          {!inFlight && (
            <ComposePanel
              text={text}
              onTextChange={setText}
              disabled={false}
              onSubmit={() => setInFlight(true)}
            />
          )}
          {inFlight && (
            <button onClick={() => setInFlight(false)}>fail</button>
          )}
        </>
      );
    }

    render(<Page />);
    await user.type(screen.getByTestId('compose'), 'The results was good.');
    await user.click(screen.getByTestId('option-academic'));
    await user.click(screen.getByText('fail'));

    expect(screen.getByTestId('compose')).toHaveValue('The results was good.');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('passes the chosen transform through', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByTestId('compose'), 'A sentence.');
    await user.click(screen.getByTestId('option-clearer'));

    expect(onSubmit).toHaveBeenCalledWith('A sentence.', 'clearer');
  });
});

/**
 * A blank textarea and four verbs is everything a first-time visitor is given.
 */
describe('ComposePanel with an empty box', () => {
  it('offers sentences to start from', () => {
    setup();
    expect(screen.getAllByTestId('example').length).toBeGreaterThan(0);
  });

  /**
   * Filling the box, not submitting it: choosing a transform is the one thing
   * a newcomer has to understand, and submitting for them skips it.
   */
  it('fills the box from an example without spending a request', async () => {
    const { user, onSubmit } = setup();
    const example = screen.getAllByTestId('example')[0];
    const sentence = example.textContent ?? '';

    await user.click(example);

    expect(screen.getByTestId('compose')).toHaveValue(sentence);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('gets out of the way once there is something to work on', async () => {
    const { user } = setup();
    await user.click(screen.getAllByTestId('example')[0]);

    expect(screen.queryByTestId('examples')).not.toBeInTheDocument();
  });

  it('says what each transform does, not just what it is called', () => {
    setup();
    expect(screen.getByTestId('option-clearer')).toHaveTextContent(
      'Untangles sentences that fight themselves.',
    );
    expect(screen.getByTestId('option-grammar')).toHaveTextContent(
      'Only what is actually wrong.',
    );
  });
});

/**
 * There is no sensible default among four verbs, so the keyboard repeats the
 * choice you already made rather than making one for you.
 */
describe('ComposePanel keyboard submit', () => {
  it('does nothing before a transform has ever been chosen', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByTestId('compose'), 'A sentence.');
    await user.keyboard('{Meta>}{Enter}{/Meta}');

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('repeat-hint')).not.toBeInTheDocument();
  });

  it('repeats the last transform', async () => {
    const first = setup();
    await first.user.type(screen.getByTestId('compose'), 'A sentence.');
    await first.user.click(screen.getByTestId('option-academic'));
    expect(first.onSubmit).toHaveBeenCalledWith('A sentence.', 'academic');

    await first.user.clear(screen.getByTestId('compose'));
    await first.user.type(screen.getByTestId('compose'), 'Another one.');
    await first.user.keyboard('{Meta>}{Enter}{/Meta}');

    expect(first.onSubmit).toHaveBeenLastCalledWith('Another one.', 'academic');
  });

  it('takes Ctrl-Enter too, for the people not on a Mac', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByTestId('compose'), 'A sentence.');
    await user.click(screen.getByTestId('option-clearer'));
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onSubmit).toHaveBeenCalledTimes(2);
    expect(onSubmit).toHaveBeenLastCalledWith('A sentence.', 'clearer');
  });

  it('says what the shortcut will do, once it will do something', async () => {
    const { user } = setup();
    await user.type(screen.getByTestId('compose'), 'A sentence.');
    await user.click(screen.getByTestId('option-natural'));

    expect(screen.getByTestId('repeat-hint')).toHaveTextContent(
      'repeats Make it natural',
    );
  });

  it('leaves a plain Enter to the textarea', async () => {
    const { user, onSubmit } = setup();
    await user.type(screen.getByTestId('compose'), 'A sentence.');
    await user.click(screen.getByTestId('option-natural'));

    await user.type(screen.getByTestId('compose'), '{Enter}Second line.');

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('compose')).toHaveValue(
      'A sentence.\nSecond line.',
    );
  });
});
