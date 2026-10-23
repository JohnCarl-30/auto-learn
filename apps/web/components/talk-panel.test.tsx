/**
 * The network and the recorder are mocked so these stay about the panel: what
 * a turn sends, what comes back on screen, and that a failed turn costs the
 * learner nothing. jsdom has no speechSynthesis, so the partner is silent here;
 * the voice is tested on its own in lib/use-partner-voice.test.tsx.
 */
jest.mock('../lib/api', () => ({
  ApiFailure: class ApiFailure extends Error {
    constructor(readonly detail: { code: string; message: string }) {
      super(detail.message);
    }
  },
  converse: jest.fn(),
  fetchCardStream: jest.fn(),
  reportEvent: jest.fn(),
  speak: jest.fn(),
}));
jest.mock('../lib/bank', () => ({
  bankWord: jest.fn(),
  knownWords: jest.fn().mockResolvedValue(['significant']),
}));
jest.mock('../lib/use-dictation', () => ({ useDictation: jest.fn() }));

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SCENARIO_OPENERS, type ConverseResponse } from '@auto-learn/shared';
import { ApiFailure, converse, fetchCardStream } from '../lib/api';
import { useDictation } from '../lib/use-dictation';
import { TalkPanel } from './talk-panel';

const send = converse as jest.Mock;
const openCard = fetchCardStream as jest.Mock;
const dictation = useDictation as jest.Mock;

let deliver: (transcript: string) => void = () => undefined;

const reviewed: ConverseResponse = {
  reply: 'Of course. How much more time do you need?',
  skipped: null,
  review: {
    sessionId: 'session-1',
    sentences: [
      {
        index: 0,
        original: 'I want ask for more time, the essay is very big.',
        text: 'I want ask for more time, the essay is very big.',
        silentFixes: [],
        gated: [
          {
            id: 'gate-1',
            type: 'word-choice',
            original: 'very big',
            start: 39,
            end: 47,
            teaser: 'stronger word available',
          },
        ],
      },
    ],
  },
};

beforeEach(() => {
  send.mockReset();
  openCard.mockReset();
  dictation.mockReset();
  dictation.mockImplementation((onTranscript: (t: string) => void) => {
    deliver = onTranscript;
    return { status: 'idle', problem: null, start: jest.fn(), stop: jest.fn() };
  });
});

async function startOfficeHours() {
  const user = userEvent.setup();
  render(<TalkPanel />);
  await user.click(screen.getByTestId('scenario-office-hours'));
  return user;
}

describe('TalkPanel', () => {
  it('opens with the partner speaking first, no model call spent', async () => {
    await startOfficeHours();

    expect(screen.getByTestId('partner-turn')).toHaveTextContent(
      SCENARIO_OPENERS['office-hours'],
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('sends the turn with the conversation so far, and shows the reviewed turn and the reply', async () => {
    send.mockResolvedValue(reviewed);
    const user = await startOfficeHours();

    await user.type(
      screen.getByTestId('answer'),
      'I want ask for more time, the essay is very big.{Enter}',
    );

    expect(send).toHaveBeenCalledWith({
      scenario: 'office-hours',
      history: [{ role: 'partner', text: SCENARIO_OPENERS['office-hours'] }],
      utterance: 'I want ask for more time, the essay is very big.',
      known: ['significant'],
    });

    const partner = await screen.findAllByTestId('partner-turn');
    expect(partner.at(-1)).toHaveTextContent('How much more time do you need?');
    const mine = screen.getByTestId('learner-turn');
    expect(within(mine).getByTestId('teaser')).toHaveTextContent(
      'very big — stronger word available',
    );
    expect(screen.getByTestId('answer')).toHaveValue('');
  });

  it('opens a gate on a spoken turn through the same card route as the writing page', async () => {
    send.mockResolvedValue(reviewed);
    openCard.mockReturnValue(new Promise(() => undefined));
    const user = await startOfficeHours();

    await user.type(screen.getByTestId('answer'), 'Anything.{Enter}');
    await user.click(await screen.findByTestId('teaser'));

    expect(openCard).toHaveBeenCalledWith(
      { kind: 'suggestion', sessionId: 'session-1', suggestionId: 'gate-1' },
      expect.any(Function),
    );
  });

  it('keeps the words and adds no turn when the partner fails to answer', async () => {
    send.mockRejectedValue(
      new ApiFailure({ code: 'upstream_failed', message: "Your partner didn't answer." }),
    );
    const user = await startOfficeHours();

    await user.type(screen.getByTestId('answer'), 'Hello there.{Enter}');

    expect(await screen.findByTestId('talk-notice')).toHaveTextContent(
      "Your partner didn't answer.",
    );
    expect(screen.getByTestId('answer')).toHaveValue('Hello there.');
    expect(screen.queryByTestId('learner-turn')).toBeNull();
  });

  it('says why a turn has no feedback, and still shows the reply', async () => {
    send.mockResolvedValue({ reply: 'Wow, busy week!', review: null, skipped: 'too_many_sentences' });
    const user = await startOfficeHours();

    await user.type(screen.getByTestId('answer'), 'A. B. C. D.{Enter}');

    expect(await screen.findByTestId('feedback-skipped')).toHaveTextContent('up to three sentences');
    expect(screen.getAllByTestId('partner-turn').at(-1)).toHaveTextContent('Wow, busy week!');
  });

  it('puts a dictated answer in the box to check, rather than sending it', async () => {
    await startOfficeHours();

    act(() => deliver('I have a question about the essay'));

    expect(screen.getByTestId('answer')).toHaveValue('I have a question about the essay');
    expect(send).not.toHaveBeenCalled();
  });

  it('does not send an empty answer', async () => {
    const user = await startOfficeHours();
    expect(screen.getByTestId('send')).toBeDisabled();
    await user.type(screen.getByTestId('answer'), '   {Enter}');
    expect(send).not.toHaveBeenCalled();
  });

  it('ends back at the choice of room', async () => {
    const user = await startOfficeHours();
    await user.click(screen.getByTestId('end'));
    expect(screen.getByTestId('scenarios')).toBeInTheDocument();
  });
});
