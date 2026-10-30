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
  fetchCard: jest.fn(),
  fetchCardStream: jest.fn(),
  reportEvent: jest.fn(),
  speak: jest.fn(),
  suggestWord: jest.fn(),
}));
jest.mock('../lib/bank', () => ({
  bankWord: jest.fn(),
  knownWords: jest.fn(),
  listBank: jest.fn(),
  recordReuse: jest.fn(),
}));
jest.mock('../lib/use-dictation', () => ({ useDictation: jest.fn() }));

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  SCENARIO_OPENERS,
  type BankEntry,
  type ConverseResponse,
  type WordCard,
} from '@auto-learn/shared';
import {
  ApiFailure,
  converse,
  fetchCard,
  fetchCardStream,
  suggestWord,
} from '../lib/api';
import { bankWord, knownWords, listBank, recordReuse } from '../lib/bank';
import { useDictation } from '../lib/use-dictation';
import { TalkPanel } from './talk-panel';

const send = converse as jest.Mock;
const openCard = fetchCardStream as jest.Mock;
const lookupCard = fetchCard as jest.Mock;
const suggest = suggestWord as jest.Mock;
const bank = listBank as jest.Mock;
const reuse = recordReuse as jest.Mock;
const save = bankWord as jest.Mock;
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
  lookupCard.mockReset();
  save.mockReset().mockResolvedValue(undefined);
  (knownWords as jest.Mock).mockReset().mockResolvedValue(['significant']);
  // An empty bank and no suggestion: the panel as it was before practice words.
  bank.mockReset().mockResolvedValue([]);
  reuse.mockReset().mockResolvedValue([]);
  suggest.mockReset().mockResolvedValue({ word: null });
  dictation.mockReset();
  dictation.mockImplementation((onTranscript: (t: string) => void) => {
    deliver = onTranscript;
    return { status: 'idle', problem: null, start: jest.fn(), stop: jest.fn() };
  });
});

// The panel opens in "Just talk" by itself, so choosing a room means going
// back to the picker first, exactly as the learner would.
async function startOfficeHours() {
  const user = userEvent.setup();
  render(<TalkPanel />);
  await user.click(screen.getByTestId('change'));
  await user.click(screen.getByTestId('scenario-office-hours'));
  return user;
}

describe('TalkPanel', () => {
  it('opens straight into Just talk without picking a room', async () => {
    render(<TalkPanel />);

    expect(screen.getByTestId('scenario')).toHaveTextContent('Just talk');
    expect(screen.getByTestId('answer')).toBeInTheDocument();
    expect(screen.queryByTestId('scenarios')).toBeNull();
    expect(screen.getByTestId('partner-turn')).toHaveTextContent(
      SCENARIO_OPENERS['free-talk'],
    );
    expect(send).not.toHaveBeenCalled();
  });

  it('goes back to the room picker from Change, and stays there', async () => {
    const user = userEvent.setup();
    render(<TalkPanel />);

    await user.click(screen.getByTestId('change'));

    // Only the first mount starts a room by itself; coming back to choose
    // must not be undone by starting Just talk again.
    expect(screen.getByTestId('scenarios')).toBeInTheDocument();
    expect(screen.queryByTestId('talk')).toBeNull();
  });

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

  describe('the word to practise', () => {
    const banked: BankEntry = {
      id: 'substantial:1',
      word: 'substantial',
      lemma: 'substantial',
      partOfSpeech: 'adjective',
      senseId: '1',
      definition: 'large in amount',
      synonyms: [],
      useCases: [],
      register: 'neutral',
      sourceSentence: 'The evidence was substantial.',
      addedVia: 'accepted',
      addedAt: '2026-10-01T00:00:00.000Z',
      timesReused: 0,
      lastReusedAt: null,
    };

    const mitigate: WordCard = {
      word: 'mitigated',
      lemma: 'mitigate',
      partOfSpeech: 'verb',
      definition: 'make less severe',
      senseId: '1',
      synonyms: [
        { word: 'ease', nuance: 'gentler' },
        { word: 'reduce', nuance: 'plainer' },
      ],
      useCases: ['one', 'two'],
      register: 'formal',
      whyHere: null,
      pronunciation: { ipa: null, audioUrl: null },
    };

    const SAID = 'We mitigated the risk.';

    const answered = (review: ConverseResponse['review']): ConverseResponse => ({
      reply: 'Good. What else?',
      skipped: review ? null : 'too_many_sentences',
      review,
    });

    const reviewOf = (text: string): ConverseResponse['review'] => ({
      sessionId: 's1',
      sentences: [
        { index: 0, original: text, text, silentFixes: [], gated: [] },
      ],
    });

    beforeEach(() => {
      suggest.mockResolvedValue({
        word: { word: 'mitigate', definition: 'make less severe' },
      });
    });

    it('shows a bank word to practise when the bank has one', async () => {
      bank.mockResolvedValue([banked]);
      reuse.mockResolvedValue([banked]);
      send.mockResolvedValue(answered(reviewOf('It was substantial.')));
      const user = await startOfficeHours();

      expect(await screen.findByTestId('practice-word')).toHaveTextContent(
        'Try using: substantial — large in amount',
      );
      expect(suggest).not.toHaveBeenCalled();

      await user.type(screen.getByTestId('answer'), 'It was substantial.{Enter}');

      // Counted by the bank's own reuse check, so no card is opened for it.
      expect(reuse).toHaveBeenCalledWith('It was substantial.');
      expect(await screen.findByText('You used it.')).toBeInTheDocument();
      expect(screen.queryByText('Added to your bank.')).toBeNull();
      expect(lookupCard).not.toHaveBeenCalled();
    });

    it('asks for a word when the bank is empty and shows it', async () => {
      await startOfficeHours();

      expect(await screen.findByTestId('practice-word')).toHaveTextContent(
        'Try using: mitigate — make less severe',
      );
      expect(suggest).toHaveBeenCalledWith({
        scenario: 'office-hours',
        known: ['significant'],
      });
    });

    it('banks a suggested word after the learner uses it', async () => {
      send.mockResolvedValue(answered(reviewOf(SAID)));
      lookupCard.mockResolvedValue({
        kind: 'card',
        card: mitigate,
        replacement: null,
        alternative: null,
      });
      const user = await startOfficeHours();
      await screen.findByTestId('practice-word');

      await user.type(screen.getByTestId('answer'), `${SAID}{Enter}`);

      expect(await screen.findByText('Added to your bank.')).toBeInTheDocument();
      expect(lookupCard).toHaveBeenCalledWith({
        kind: 'lookup',
        sessionId: 's1',
        sentenceIndex: 0,
        word: 'mitigated',
      });
      expect(save).toHaveBeenCalledWith(mitigate, SAID, 'accepted');
      expect(screen.getByTestId('practice-word')).toHaveTextContent('You used it.');
    });

    it('still banks a used word when the conversation ends before the reply', async () => {
      let answer: (response: ConverseResponse) => void = () => undefined;
      send.mockReturnValue(new Promise((resolve) => (answer = resolve)));
      lookupCard.mockResolvedValue({
        kind: 'card',
        card: mitigate,
        replacement: null,
        alternative: null,
      });
      const user = await startOfficeHours();
      await screen.findByTestId('practice-word');

      await user.type(screen.getByTestId('answer'), `${SAID}{Enter}`);
      await user.click(screen.getByTestId('end'));
      await act(async () => answer(answered(reviewOf(SAID))));

      // The word was used, so it joins the bank; the finished conversation
      // has no word on screen to update.
      expect(save).toHaveBeenCalledWith(mitigate, SAID, 'accepted');
      expect(screen.queryByTestId('practice-word')).toBeNull();
    });

    it('marks the word used but opens no card when the turn had no review', async () => {
      send.mockResolvedValue(answered(null));
      const user = await startOfficeHours();
      await screen.findByTestId('practice-word');

      await user.type(screen.getByTestId('answer'), `${SAID}{Enter}`);

      expect(await screen.findByText('You used it.')).toBeInTheDocument();
      expect(lookupCard).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
    });

    it('still lets you talk when no word could be found', async () => {
      suggest.mockRejectedValue(new Error('offline'));
      send.mockResolvedValue(answered(reviewOf('Hello there.')));
      const user = await startOfficeHours();

      await user.type(screen.getByTestId('answer'), 'Hello there.{Enter}');

      expect(
        (await screen.findAllByTestId('partner-turn')).at(-1),
      ).toHaveTextContent('Good. What else?');
      expect(screen.queryByTestId('practice-word')).toBeNull();
    });
  });
});
