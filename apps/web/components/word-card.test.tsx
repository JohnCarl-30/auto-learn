jest.mock('../lib/api', () => ({ speak: jest.fn() }));
jest.mock('../lib/audio', () => ({
  playAudio: jest.fn(),
  synthesisedSrc: (r: { mediaType: string; audio: string }) =>
    `data:${r.mediaType};base64,${r.audio}`,
}));

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CardResponse } from '@auto-learn/shared';
import { speak } from '../lib/api';
import { playAudio } from '../lib/audio';
import { WordCard, type CardState } from './word-card';

const asks = speak as jest.Mock;
const plays = playAudio as jest.Mock;

const CARD: CardResponse = {
  kind: 'card',
  card: {
    word: 'substantial',
    lemma: 'substantial',
    partOfSpeech: 'adjective',
    definition: 'Large in amount, size or importance.',
    senseId: 's1',
    synonyms: [
      { word: 'significant', nuance: 'broader; often about meaning, not size' },
      { word: 'considerable', nuance: 'slightly more formal' },
    ],
    useCases: [
      'The study found a substantial increase.',
      'There is substantial evidence for this.',
    ],
    register: 'formal',
    whyHere: 'Precise where "very big" only sounds emphatic.',
    pronunciation: {
      ipa: '/səbˈstænʃəl/',
      audioUrl: 'https://api.dictionaryapi.dev/media/substantial-us.mp3',
    },
  },
  replacement: 'substantial',
  alternative: 'considerable',
};

const NOTE: CardResponse = {
  kind: 'note',
  note: {
    corrected: 'shows',
    note: '"results" is plural, so the verb agrees.',
  },
  replacement: 'shows',
  alternative: null,
};

const setup = (state: CardState) => {
  const handlers = {
    onAccept: jest.fn(),
    onReject: jest.fn(),
    onDismiss: jest.fn(),
  };
  render(<WordCard state={state} {...handlers} />);
  return { ...handlers, user: userEvent.setup() };
};

describe('WordCard rendering a word card', () => {
  it('shows the word, its part of speech and register', () => {
    setup({ status: 'ready', response: CARD });
    expect(screen.getByText('substantial')).toBeInTheDocument();
    expect(screen.getByText('adjective')).toBeInTheDocument();
    expect(screen.getByText('formal')).toBeInTheDocument();
  });

  it('shows each synonym with the nuance that separates it', () => {
    setup({ status: 'ready', response: CARD });
    expect(screen.getByText('significant')).toBeInTheDocument();
    expect(
      screen.getByText(/broader; often about meaning, not size/),
    ).toBeInTheDocument();
  });

  it('shows both use cases', () => {
    setup({ status: 'ready', response: CARD });
    expect(
      screen.getByText('The study found a substantial increase.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('There is substantial evidence for this.'),
    ).toBeInTheDocument();
  });

  it('renders quoted prose with typographic quotes', () => {
    setup({ status: 'ready', response: CARD });
    expect(
      screen.getByText(/Precise where “very big” only sounds emphatic\./),
    ).toBeInTheDocument();
  });
});

describe('WordCard rendering a grammar note', () => {
  it('shows the rule, not a vocabulary card', () => {
    setup({ status: 'ready', response: NOTE });

    expect(screen.getByText('shows')).toBeInTheDocument();
    expect(screen.getByText('grammar')).toBeInTheDocument();
    expect(
      screen.getByText(/“results” is plural, so the verb agrees\./),
    ).toBeInTheDocument();
  });

  it('offers nothing to learn as vocabulary', () => {
    setup({ status: 'ready', response: NOTE });
    expect(screen.queryByText('adjective')).not.toBeInTheDocument();
    expect(screen.queryByText('significant')).not.toBeInTheDocument();
  });
});

describe('WordCard actions', () => {
  it('passes the withheld replacement up on accept', async () => {
    const { user, onAccept } = setup({ status: 'ready', response: CARD });
    await user.click(screen.getByTestId('accept'));
    expect(onAccept).toHaveBeenCalledWith('substantial');
  });

  it('reports a rejection without a replacement', async () => {
    const { user, onReject, onAccept } = setup({
      status: 'ready',
      response: CARD,
    });
    await user.click(screen.getByTestId('reject'));
    expect(onReject).toHaveBeenCalled();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('offers the alternative as a second way to accept', async () => {
    const { user, onAccept } = setup({ status: 'ready', response: CARD });
    await user.click(screen.getByRole('button', { name: 'considerable' }));
    expect(onAccept).toHaveBeenCalledWith('considerable');
  });

  it('offers no accept or reject for a plain lookup', () => {
    setup({
      status: 'ready',
      response: { ...CARD, replacement: null, alternative: null },
    });
    expect(screen.queryByTestId('accept')).not.toBeInTheDocument();
    expect(screen.queryByTestId('reject')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

describe('WordCard non-ready states', () => {
  it('shows a placeholder while loading', () => {
    setup({ status: 'loading' });
    expect(screen.queryByTestId('word-card')).not.toBeInTheDocument();
  });

  it('surfaces the error message and a way out', async () => {
    const { user, onDismiss } = setup({
      status: 'error',
      error: { code: 'no_dictionary_entry', message: "I couldn't find that." },
    });
    expect(screen.getByText("I couldn't find that.")).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe('WordCard saving a looked-up word', () => {
  const LOOKUP = { ...CARD, replacement: null, alternative: null };

  const setupLookup = (saved = false) => {
    const handlers = {
      onAccept: jest.fn(),
      onReject: jest.fn(),
      onSave: jest.fn(),
      onDismiss: jest.fn(),
    };
    render(
      <WordCard
        state={{ status: 'ready', response: LOOKUP }}
        saved={saved}
        {...handlers}
      />,
    );
    return { ...handlers, user: userEvent.setup() };
  };

  it('offers to save rather than banking on sight', async () => {
    // Tapping a word is often just checking one you already know. Banking it
    // automatically fills the bank with noise the reader never chose.
    const { user, onSave } = setupLookup();
    const save = screen.getByTestId('save');
    expect(save).toHaveTextContent('Save to bank');

    await user.click(save);
    expect(onSave).toHaveBeenCalled();
  });

  it('shows it is already saved and stops offering', () => {
    setupLookup(true);
    const save = screen.getByTestId('save');
    expect(save).toHaveTextContent('Saved');
    expect(save).toBeDisabled();
  });

  it('offers no save on a grammar note, which is not vocabulary', () => {
    render(
      <WordCard
        state={{ status: 'ready', response: { ...NOTE, replacement: null } }}
        onAccept={jest.fn()}
        onReject={jest.fn()}
        onSave={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.queryByTestId('save')).not.toBeInTheDocument();
  });

  describe('hearing the word', () => {
    beforeEach(() => {
      asks.mockReset();
      plays.mockReset();
      plays.mockResolvedValue(undefined);
    });

    it('shows how the word is written out in sound', () => {
      setup({ status: 'ready', response: CARD });

      expect(screen.getByTestId('ipa')).toHaveTextContent('/səbˈstænʃəl/');
    });

    /**
     * The free path, and the one that must not cost anything. When the
     * dictionary already had a recording, asking the server to synthesise one
     * would be paying for audio we were given.
     */
    it('plays the recording the dictionary had, without asking the server', async () => {
      const { user } = setup({ status: 'ready', response: CARD });

      await user.click(screen.getByTestId('pronounce'));

      expect(plays).toHaveBeenCalledWith(
        'https://api.dictionaryapi.dev/media/substantial-us.mp3',
      );
      expect(asks).not.toHaveBeenCalled();
    });

    it('synthesises only when nobody recorded the word', async () => {
      asks.mockResolvedValue({
        word: 'substantial',
        audio: 'bGlzdGVu',
        mediaType: 'audio/mpeg',
      });

      const { user } = setup({
        status: 'ready',
        response: {
          ...CARD,
          card: {
            ...CARD.card,
            pronunciation: { ipa: '/səbˈstænʃəl/', audioUrl: null },
          },
        } as CardResponse,
      });

      await user.click(screen.getByTestId('pronounce'));

      await waitFor(() =>
        expect(plays).toHaveBeenCalledWith('data:audio/mpeg;base64,bGlzdGVu'),
      );
      expect(asks).toHaveBeenCalledWith('substantial');
    });

    it('does not pay twice to replay the same word', async () => {
      asks.mockResolvedValue({
        word: 'substantial',
        audio: 'bGlzdGVu',
        mediaType: 'audio/mpeg',
      });

      const { user } = setup({
        status: 'ready',
        response: {
          ...CARD,
          card: { ...CARD.card, pronunciation: { ipa: null, audioUrl: null } },
        } as CardResponse,
      });

      await user.click(screen.getByTestId('pronounce'));
      await waitFor(() => expect(plays).toHaveBeenCalledTimes(1));
      await user.click(screen.getByTestId('pronounce'));

      await waitFor(() => expect(plays).toHaveBeenCalledTimes(2));
      expect(asks).toHaveBeenCalledTimes(1);
    });

    /**
     * A dictionary URL can be dead, or in a codec this browser will not take.
     * Falling through to synthesis means a broken link costs one silent
     * attempt rather than the feature.
     */
    it('synthesises when the recording will not play', async () => {
      plays.mockRejectedValueOnce(new Error('no codec'));
      asks.mockResolvedValue({
        word: 'substantial',
        audio: 'bGlzdGVu',
        mediaType: 'audio/mpeg',
      });

      const { user } = setup({ status: 'ready', response: CARD });

      await user.click(screen.getByTestId('pronounce'));

      await waitFor(() => expect(asks).toHaveBeenCalledWith('substantial'));
    });

    it('says so rather than going quiet when it cannot play at all', async () => {
      asks.mockRejectedValue(new Error('down'));

      const { user } = setup({
        status: 'ready',
        response: {
          ...CARD,
          card: { ...CARD.card, pronunciation: { ipa: null, audioUrl: null } },
        } as CardResponse,
      });

      await user.click(screen.getByTestId('pronounce'));

      expect(await screen.findByText(/Couldn't play that/)).toBeInTheDocument();
    });

    /**
     * Everything the button remembers is about one word. Today a card passes
     * through a loading state between words, which unmounts it — but that is
     * how the page happens to render, not a promise. Without a key on the word,
     * a card swapped in place keeps the previous word's audio and plays it
     * under the new one's name, which is a hard bug to see and a worse one to
     * hear.
     */
    it('forgets the previous word when a card is replaced in place', async () => {
      asks.mockResolvedValue({
        word: 'warrant',
        audio: 'bGlzdGVu',
        mediaType: 'audio/mpeg',
      });

      const { rerender } = render(
        <WordCard
          state={{ status: 'ready', response: CARD }}
          onAccept={jest.fn()}
          onReject={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );

      // A different word, with no recording of its own, straight into the same
      // position — no loading state in between.
      rerender(
        <WordCard
          state={{
            status: 'ready',
            response: {
              ...CARD,
              card: {
                ...CARD.card,
                word: 'warrant',
                pronunciation: { ipa: null, audioUrl: null },
              },
            } as CardResponse,
          }}
          onAccept={jest.fn()}
          onReject={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );

      await userEvent.setup().click(screen.getByTestId('pronounce'));

      // Synthesised, because this word has no recording. Reaching for the
      // previous word's URL would play "substantial" as "warrant".
      await waitFor(() => expect(asks).toHaveBeenCalledWith('warrant'));
      expect(plays).not.toHaveBeenCalledWith(CARD.card.pronunciation.audioUrl);
    });

    it('leaves no pronunciation controls on a grammar note', () => {
      setup({ status: 'ready', response: NOTE });

      expect(screen.queryByTestId('pronounce')).not.toBeInTheDocument();
      expect(screen.queryByTestId('ipa')).not.toBeInTheDocument();
    });
  });
});

/**
 * The card is the only thing that opens over what you were reading, and its
 * way out depends on which card you got: a gate offers "Use it" and "Keep
 * mine", neither of which means "not now".
 */
describe('WordCard leaving by keyboard', () => {
  it('closes on Escape', async () => {
    const { user, onDismiss } = setup({ status: 'ready', response: CARD });

    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalled();
  });

  it('closes on Escape while it is still loading', async () => {
    const { user, onDismiss } = setup({ status: 'loading' });

    await user.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalled();
  });

  it('does not accept anything on the way out', async () => {
    const { user, onAccept, onReject } = setup({
      status: 'ready',
      response: CARD,
    });

    await user.keyboard('{Escape}');

    expect(onAccept).not.toHaveBeenCalled();
    expect(onReject).not.toHaveBeenCalled();
  });
});
