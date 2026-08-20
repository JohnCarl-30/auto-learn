/**
 * The hook is mocked so these tests stay about the panel: what the mic button
 * does to the draft, and what the panel shows while it is listening. The
 * recorder itself — permissions, the length cap, cleanup — is exercised
 * against real browser stubs in lib/use-dictation.test.tsx.
 */
jest.mock('../lib/use-dictation', () => ({ useDictation: jest.fn() }));

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import type { TransformOption } from '@auto-learn/shared';
import { useDictation } from '../lib/use-dictation';
import { ComposePanel } from './compose-panel';

const dictation = useDictation as jest.Mock;

/** Lets a test play the part of the recorder finishing a transcript. */
let deliver: (transcript: string) => void = () => undefined;

const listening = (
  status: 'idle' | 'recording' | 'transcribing' = 'idle',
  problem: { message: string; code: string | null } | null = null,
) => {
  dictation.mockImplementation((onTranscript: (t: string) => void) => {
    deliver = onTranscript;
    return { status, problem, start: jest.fn(), stop: jest.fn() };
  });
};

beforeEach(() => {
  dictation.mockReset();
  listening();
});

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

  describe('dictation', () => {
    /**
     * The bug worth pinning. Overwriting the box would destroy typed work, and
     * a programmatic change to a controlled textarea leaves no undo entry to
     * get it back with.
     */
    it('adds what was said to what was already typed', async () => {
      const { user } = setup();
      await user.type(screen.getByTestId('compose'), 'I wrote this myself.');

      act(() => deliver('And I said this.'));

      expect(screen.getByTestId('compose')).toHaveValue(
        'I wrote this myself. And I said this.',
      );
    });

    it('is the whole draft when nothing was typed', () => {
      setup();

      act(() => deliver('I only spoke.'));

      expect(screen.getByTestId('compose')).toHaveValue('I only spoke.');
    });

    it('says it is listening rather than leaving the button ambiguous', () => {
      listening('recording');
      setup();

      expect(screen.getByTestId('sentence-count')).toHaveTextContent(
        'Listening…',
      );
      expect(screen.getByTestId('dictate')).toHaveAccessibleName(
        'Stop recording',
      );
    });

    it('will not take a second recording while writing down the first', () => {
      listening('transcribing');
      setup();

      expect(screen.getByTestId('dictate')).toBeDisabled();
    });

    it('shows a denied microphone as guidance, not as a breakage', () => {
      listening('idle', {
        message: 'I need permission to use your microphone.',
        code: null,
      });
      setup();

      const notice = screen.getByTestId('dictation-notice');
      expect(notice).toHaveTextContent('I need permission');
      expect(notice.className).toContain('amber');
    });

    /**
     * The distinction the tone rules exist for. "Allow your microphone" is
     * something the reader can act on; "the provider fell over" is not, and
     * dressing the second as gentle advice tells them to retry something that
     * will keep failing.
     */
    it('shows a provider failure in red instead', () => {
      listening('idle', {
        message: "I couldn't make out that recording.",
        code: 'upstream_failed',
      });
      setup();

      expect(screen.getByTestId('dictation-notice').className).toContain(
        'destructive',
      );
    });
  });
});
