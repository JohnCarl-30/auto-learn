jest.mock('../lib/api', () => ({ reportEvent: jest.fn() }));

const dictation = {
  status: 'idle' as 'idle' | 'recording' | 'transcribing',
  problem: null as { message: string; code: null } | null,
  start: jest.fn(),
  stop: jest.fn(),
};
let heard: (transcript: string) => void = () => {};

jest.mock('../lib/use-dictation', () => ({
  useDictation: (onTranscript: (t: string) => void) => {
    heard = onTranscript;
    return dictation;
  },
}));

import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { reportEvent } from '../lib/api';
import { SayItBack } from './say-it-back';

const reported = reportEvent as jest.Mock;

beforeEach(() => {
  dictation.status = 'idle';
  dictation.problem = null;
  dictation.start.mockClear();
  dictation.stop.mockClear();
  reported.mockClear();
});

describe('SayItBack', () => {
  it('records, then reports what came through', async () => {
    const user = userEvent.setup();
    render(<SayItBack word="substantial" />);

    await user.click(screen.getByTestId('say-it-back-toggle'));
    expect(dictation.start).toHaveBeenCalled();

    act(() => heard('substantial'));

    expect(screen.getByTestId('say-it-back-result')).toHaveTextContent(
      'That came through as substantial',
    );
    expect(reported).toHaveBeenCalledWith('said_back_matched');
  });

  /**
   * The line the whole feature turns on. Transcription of accented English is
   * good rather than perfect, so a miss reports what was heard instead of
   * telling the learner they were wrong — the transcriber is the likelier
   * culprit and the wording has to leave room for that.
   */
  it('reports what it heard rather than saying you were wrong', async () => {
    const user = userEvent.setup();
    render(<SayItBack word="substantial" />);

    await user.click(screen.getByTestId('say-it-back-toggle'));
    act(() => heard('banana'));

    const result = screen.getByTestId('say-it-back-result');
    expect(result).toHaveTextContent('I heard “banana”');
    expect(result.textContent).not.toMatch(/wrong|incorrect|failed/i);
    expect(reported).toHaveBeenCalledWith('said_back_missed');
  });

  it('encourages a near miss instead of failing it', async () => {
    const user = userEvent.setup();
    render(<SayItBack word="corroborate" />);

    await user.click(screen.getByTestId('say-it-back-toggle'));
    act(() => heard('corroberate'));

    expect(screen.getByTestId('say-it-back-result')).toHaveTextContent('Close');
  });

  it('clears the last verdict when a new attempt starts', async () => {
    const user = userEvent.setup();
    render(<SayItBack word="substantial" />);

    await user.click(screen.getByTestId('say-it-back-toggle'));
    act(() => heard('banana'));
    expect(screen.getByTestId('say-it-back-result')).toBeInTheDocument();

    await user.click(screen.getByTestId('say-it-back-toggle'));
    // A stale verdict sitting under a live recording reads as its answer.
    expect(screen.queryByTestId('say-it-back-result')).not.toBeInTheDocument();
  });

  it('passes a refused microphone straight through', () => {
    dictation.problem = { message: 'I need permission to use your microphone.', code: null };
    render(<SayItBack word="substantial" />);

    expect(screen.getByTestId('say-it-back-problem')).toHaveTextContent(
      'I need permission',
    );
  });

  it('stops rather than restarting while it is recording', async () => {
    const user = userEvent.setup();
    dictation.status = 'recording';
    render(<SayItBack word="substantial" />);

    await user.click(screen.getByTestId('say-it-back-toggle'));
    expect(dictation.stop).toHaveBeenCalled();
    expect(dictation.start).not.toHaveBeenCalled();
  });
});
