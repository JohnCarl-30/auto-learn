/**
 * `useLesson` is mocked: its steps are tested in lib/use-lesson.test.tsx, and
 * here the question is only what each step puts on screen and which way each
 * button sends the learner.
 */
jest.mock('@/lib/use-lesson', () => ({ useLesson: jest.fn() }));
jest.mock('@/lib/api', () => ({
  ApiFailure: class ApiFailure extends Error {},
  fetchCardStream: jest.fn(),
  // No local engine here, so the partner's voice falls back to the browser's.
  speakReply: jest.fn(() => Promise.reject(new Error('no local voice'))),
  reportEvent: jest.fn(),
  speak: jest.fn(),
}));
jest.mock('@/lib/bank', () => ({ bankWord: jest.fn() }));
jest.mock('@/lib/audio', () => ({ playAudio: jest.fn(), synthesisedSrc: jest.fn() }));
const mockDictation = { status: 'idle', problem: null, start: jest.fn(), stop: jest.fn() };
jest.mock('@/lib/use-dictation', () => ({ useDictation: () => mockDictation }));

import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UNITS, type LessonFeedbackResponse, type LessonProgress } from '@auto-learn/shared';
import { speak } from '@/lib/api';
import { playAudio } from '@/lib/audio';
import { useLesson, type SpokenResult } from '@/lib/use-lesson';
import { LessonPanel } from './lesson-panel';

const lesson = useLesson as jest.Mock;

const progress: LessonProgress = {
  xp: 120,
  streak: 3,
  doneToday: 1,
  counts: { '1': 5, '2': 2 },
  highestUnlocked: 2,
  pathFinished: false,
  recentPromptIds: [],
  dueEntryIds: [],
};

const spoken = (wordUse: LessonFeedbackResponse['wordUse']): SpokenResult => ({
  answer: 'An answer.',
  seconds: 30,
  fillers: { total: 0, byWord: {} },
  feedback: {
    firstSentence: 'An answer.',
    pointFirst: true,
    pointFirstNote: '',
    parts: [],
    structureNote: '',
    wordUse,
    reviewedText: null,
    review: null,
    fillerNotes: [],
  },
});

/** A lesson in the given state; everything not named is inert. */
function lessonAt(over: Partial<ReturnType<typeof useLesson>>) {
  return {
    step: 'loading',
    progress,
    unit: UNITS[1],
    prompt: UNITS[1].prompts[0],
    reviews: [],
    reviewIndex: 0,
    answerReview: jest.fn().mockResolvedValue(true),
    advanceReview: jest.fn(),
    word: null,
    continueToSpeak: jest.fn(),
    submitAnswer: jest.fn(),
    attempts: [],
    canRetry: false,
    retry: jest.fn(),
    finish: jest.fn(),
    bankedWord: false,
    error: null,
    ...over,
  };
}

beforeEach(() => {
  lesson.mockReset();
  mockDictation.start.mockReset();
  (playAudio as jest.Mock).mockReset();
  (speak as jest.Mock).mockReset();
});

describe('LessonPanel', () => {
  it('shows the review cue with a Check button', () => {
    lesson.mockReturnValue(
      lessonAt({
        step: 'review',
        reviews: [
          { entryId: 'e1', lemma: 'argue', cue: 'We ____ about tabs.', cueIsDefinition: false },
        ],
      }),
    );
    render(<LessonPanel />);
    expect(screen.getByText('We ____ about tabs.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check' })).toBeInTheDocument();
  });

  it('checks a review answer once, then shows the word and Next', async () => {
    const answerReview = jest.fn().mockResolvedValue(false);
    lesson.mockReturnValue(
      lessonAt({
        step: 'review',
        reviews: [{ entryId: 'e1', lemma: 'argue', cue: 'to give reasons', cueIsDefinition: true }],
        answerReview,
      }),
    );
    const user = userEvent.setup();
    render(<LessonPanel />);

    await user.type(screen.getByLabelText('The missing word'), 'argu');
    await user.click(screen.getByRole('button', { name: 'Check' }));

    expect(await screen.findByTestId('review-result')).toHaveTextContent('argue');
    expect(screen.getByRole('button', { name: 'Check' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(answerReview).toHaveBeenCalledTimes(1);
  });

  describe("today's word", () => {
    const word = { word: 'mitigate', definition: 'make less severe' };

    // Unmounted first: the voice cancels itself on the way out.
    afterEach(() => {
      cleanup();
      delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    });

    it('plays the dictionary recording when there is one', async () => {
      lesson.mockReturnValue(
        lessonAt({
          step: 'word',
          word: { ...word, pronunciation: { ipa: null, audioUrl: 'https://x/m.mp3' } },
        }),
      );
      const user = userEvent.setup();
      render(<LessonPanel />);

      await user.click(screen.getByRole('button', { name: 'Hear mitigate' }));
      expect(playAudio).toHaveBeenCalledWith('https://x/m.mp3');
      expect(speak).not.toHaveBeenCalled();
    });

    it("speaks it in the browser's voice when nobody recorded it, not through /speak", async () => {
      const speakAloud = jest.fn();
      Object.defineProperty(window, 'speechSynthesis', {
        value: { speak: speakAloud, cancel: jest.fn(), getVoices: () => [] },
        configurable: true,
      });
      (globalThis as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance =
        class {
          constructor(readonly text: string) {}
        };
      lesson.mockReturnValue(
        lessonAt({
          step: 'word',
          word: { ...word, pronunciation: { ipa: '/x/', audioUrl: null } },
        }),
      );
      const user = userEvent.setup();
      render(<LessonPanel />);

      await user.click(screen.getByRole('button', { name: 'Hear mitigate' }));
      await waitFor(() =>
        expect(speakAloud).toHaveBeenCalledWith(expect.objectContaining({ text: 'mitigate' })),
      );
      expect(speak).not.toHaveBeenCalled();
    });
  });

  it('shows the XP this lesson earned and the streak when done', () => {
    // The word used correctly and the retry taken: 10 + 5 + 5.
    lesson.mockReturnValue(
      lessonAt({ step: 'done', attempts: [spoken('unused'), spoken('correct')] }),
    );
    render(<LessonPanel />);
    expect(screen.getByText('+20 XP')).toBeInTheDocument();
    expect(screen.getByText('3-day streak')).toBeInTheDocument();
  });

  it('fills a bar for each streak day, leaving today open until its lesson is done', () => {
    const filled = () =>
      screen.getAllByTestId('streak-day').map((day) => day.dataset.done === 'true');

    // Three days ending today.
    lesson.mockReturnValue(lessonAt({ step: 'speak' }));
    const { unmount } = render(<LessonPanel />);
    expect(filled()).toEqual([false, false, false, false, true, true, true]);
    unmount();

    // Three days ending yesterday: today is the one still to do.
    lesson.mockReturnValue(lessonAt({ step: 'speak', progress: { ...progress, doneToday: 0 } }));
    render(<LessonPanel />);
    expect(filled()).toEqual([false, false, false, true, true, true, false]);
  });

  it('shows how you speak and names the weakest habit as the focus', () => {
    const skill = (value: number, score: number) => ({ value, score, before: null });
    lesson.mockReturnValue(
      lessonAt({
        step: 'speak',
        habits: {
          answers: 3,
          skills: {
            pace: skill(148, 1),
            fillers: skill(6.5, 0.2),
            range: skill(0.82, 0.7),
            structure: skill(0.75, 0.75),
          },
        },
      }),
    );
    render(<LessonPanel />);
    const habits = screen.getByTestId('speaking-habits');
    expect(habits).toHaveTextContent('148 words a minute');
    expect(habits).toHaveTextContent('6.5 per 100 words');
    expect(screen.getByTestId('speaking-focus')).toHaveTextContent(
      'Focus: Pause instead of filling the gap.',
    );
  });

  it('shows no speaking block before any answer has been measured', () => {
    lesson.mockReturnValue(lessonAt({ step: 'speak', habits: null }));
    render(<LessonPanel />);
    expect(screen.queryByTestId('speaking-habits')).toBeNull();
  });

  it('dims the locked units on the path and marks them disabled', () => {
    lesson.mockReturnValue(lessonAt({ step: 'done', attempts: [spoken(null)] }));
    render(<LessonPanel />);

    const path = screen.getByRole('list', { name: 'Your path' });
    const units = within(path).getAllByRole('button');
    expect(units).toHaveLength(7);
    expect(units[0]).toHaveAttribute('aria-disabled', 'false');
    expect(units[1]).toHaveAttribute('aria-disabled', 'false');
    for (const locked of units.slice(2)) {
      expect(locked).toHaveAttribute('aria-disabled', 'true');
    }
    expect(units[1]).toHaveTextContent('2/5');
  });

  it('starts a lesson in an unlocked unit when it is tapped, and ignores a locked one', async () => {
    lesson.mockReturnValue(lessonAt({ step: 'done', attempts: [spoken(null)] }));
    const user = userEvent.setup();
    render(<LessonPanel />);
    const units = within(screen.getByRole('list', { name: 'Your path' })).getAllByRole('button');

    await user.click(units[4]);
    expect(lesson).toHaveBeenLastCalledWith(undefined);

    await user.click(units[0]);
    expect(lesson).toHaveBeenLastCalledWith(1);
  });

  it('offers Finish only once there is an attempt, and the retry while it is allowed', () => {
    lesson.mockReturnValue(
      lessonAt({ step: 'feedback', attempts: [spoken(null)], canRetry: true }),
    );
    render(<LessonPanel />);
    expect(screen.getByRole('button', { name: 'Finish' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Try once more' })).toBeInTheDocument();
  });

  it('sends a typed answer with no length, since nothing timed it', async () => {
    const submitAnswer = jest.fn().mockResolvedValue(undefined);
    lesson.mockReturnValue(lessonAt({ step: 'speak', submitAnswer }));
    const user = userEvent.setup();
    render(<LessonPanel />);

    expect(screen.getByTestId('prompt')).toHaveTextContent(UNITS[1].prompts[0].text);
    await user.type(screen.getByLabelText('Your answer'), 'Coding early helps.');
    await user.click(screen.getByRole('button', { name: /Submit/ }));

    expect(submitAnswer).toHaveBeenCalledWith('Coding early helps.', null);
  });

  it('warns fifteen seconds before the recorder stops itself, and not before', () => {
    jest.useFakeTimers();
    mockDictation.status = 'recording';
    try {
      lesson.mockReturnValue(lessonAt({ step: 'speak' }));
      render(<LessonPanel />);

      act(() => jest.advanceTimersByTime(164_000));
      expect(screen.getByTestId('time-left')).toBeEmptyDOMElement();

      act(() => jest.advanceTimersByTime(1_000));
      expect(screen.getByTestId('time-left')).toHaveTextContent('15 seconds left');
    } finally {
      mockDictation.status = 'idle';
      jest.useRealTimers();
    }
  });

  it('hides the unit 6 question until Start, then records after five seconds', async () => {
    jest.useFakeTimers();
    try {
      lesson.mockReturnValue(
        lessonAt({ step: 'speak', unit: UNITS[5], prompt: UNITS[5].prompts[0] }),
      );
      const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
      render(<LessonPanel />);

      expect(screen.queryByTestId('prompt')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Start' }));
      expect(screen.getByTestId('prompt')).toHaveTextContent(UNITS[5].prompts[0].text);
      expect(screen.getByTestId('countdown')).toHaveTextContent('Recording in 5…');

      // A second at a time: each tick renders before the next is scheduled.
      for (const left of [4, 3, 2, 1]) {
        act(() => jest.advanceTimersByTime(1000));
        expect(screen.getByTestId('countdown')).toHaveTextContent(`Recording in ${left}…`);
      }
      expect(mockDictation.start).not.toHaveBeenCalled();
      act(() => jest.advanceTimersByTime(1000));
      expect(mockDictation.start).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });
});
