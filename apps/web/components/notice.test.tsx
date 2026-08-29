import { render, screen } from '@testing-library/react';
import type { ApiError } from '@auto-learn/shared';
import { ApiNotice, Notice, toneFor } from './notice';

const error = (code: ApiError['code'], message = 'Something.'): ApiError => ({
  code,
  message,
});

describe('toneFor', () => {
  /**
   * The distinction the whole component exists for: a refusal the reader can
   * act on is not a failure, and dressing it in the red treatment tells them
   * something broke when nothing did.
   */
  it('treats a recoverable refusal as guidance', () => {
    expect(toneFor('too_many_sentences')).toBe('guidance');
    expect(toneFor('rate_limited')).toBe('guidance');
    expect(toneFor('recording_too_long')).toBe('guidance');
    expect(toneFor('no_speech_detected')).toBe('guidance');
  });

  it('keeps everything else red', () => {
    expect(toneFor('upstream_failed')).toBe('error');
    expect(toneFor('invalid_request')).toBe('error');
    // A blank submission is a bug on our side, not something to coach.
    expect(toneFor('empty_input')).toBe('error');
  });
});

describe('ApiNotice', () => {
  it('keeps the ids the rest of the app already looks for', () => {
    const { rerender } = render(
      <ApiNotice error={error('too_many_sentences')} />,
    );
    expect(screen.getByTestId('cap-notice')).toBeInTheDocument();

    rerender(<ApiNotice error={error('rate_limited')} />);
    expect(screen.getByTestId('wait-notice')).toBeInTheDocument();

    rerender(<ApiNotice error={error('upstream_failed')} />);
    expect(screen.getByTestId('error-notice')).toBeInTheDocument();
  });

  it('names the two voice refusals separately', () => {
    const { rerender } = render(
      <ApiNotice error={error('recording_too_long')} />,
    );
    expect(screen.getByTestId('recording-notice')).toBeInTheDocument();

    rerender(<ApiNotice error={error('no_speech_detected')} />);
    expect(screen.getByTestId('silence-notice')).toBeInTheDocument();
  });

  it('says what the server said', () => {
    render(<ApiNotice error={error('rate_limited', 'Wait a moment.')} />);
    expect(screen.getByText('Wait a moment.')).toBeInTheDocument();
  });
});

describe('Notice', () => {
  /**
   * Used directly for a refused microphone, which never reaches the server and
   * so has no ApiErrorCode to look up.
   */
  it('carries a message that never came from the API', () => {
    render(
      <Notice
        message="I need permission to use your microphone."
        tone="guidance"
        testId="dictation-notice"
      />,
    );

    const notice = screen.getByTestId('dictation-notice');
    expect(notice).toHaveTextContent('I need permission');
    expect(notice).toHaveAttribute('role', 'status');
  });
});
