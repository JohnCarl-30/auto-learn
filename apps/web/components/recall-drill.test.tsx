import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { BankEntry } from '@auto-learn/shared';
jest.mock('../lib/api', () => ({ reportEvent: jest.fn() }));

import { reportEvent } from '../lib/api';
import { RecallDrill } from './recall-drill';

const entry = (word: string, overrides: Partial<BankEntry> = {}): BankEntry => ({
  id: `${word}:s1`,
  word,
  lemma: word,
  partOfSpeech: 'adjective',
  senseId: 's1',
  definition: `Definition of ${word}.`,
  synonyms: [{ word: 'sizeable', nuance: 'about size, not importance' }],
  useCases: [],
  register: 'formal',
  sourceSentence: `The results were ${word}.`,
  addedVia: 'accepted',
  addedAt: new Date().toISOString(),
  timesReused: 0,
  lastReusedAt: null,
  ...overrides,
});

describe('RecallDrill', () => {
  /**
   * The prompt is the writer's own sentence, which is the whole reason the
   * word is bankable — but it contains the answer, so it cannot be shown as-is.
   */
  it('asks with the sentence the word came from, minus the word', () => {
    render(<RecallDrill entries={[entry('substantial')]} onDone={jest.fn()} />);

    expect(screen.getByTestId('drill-prompt')).toHaveTextContent(
      'The results were _____.',
    );
    expect(screen.queryByText('substantial')).not.toBeInTheDocument();
  });

  it('holds the answer back until it is asked for', async () => {
    const user = userEvent.setup();
    render(<RecallDrill entries={[entry('substantial')]} onDone={jest.fn()} />);

    expect(screen.queryByTestId('drill-answer')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('drill-reveal'));

    expect(screen.getByTestId('drill-answer')).toHaveTextContent('substantial');
    expect(screen.getByTestId('drill-answer')).toHaveTextContent(
      'Definition of substantial.',
    );
  });

  /** Marking before the reveal would be a guess about a guess. */
  it('only asks how you did once you can see how you did', async () => {
    const user = userEvent.setup();
    render(<RecallDrill entries={[entry('substantial')]} onDone={jest.fn()} />);

    expect(screen.queryByTestId('drill-knew')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('drill-reveal'));
    expect(screen.getByTestId('drill-knew')).toBeInTheDocument();
  });

  it('moves on, and hides the next answer again', async () => {
    const user = userEvent.setup();
    render(
      <RecallDrill entries={[entry('alpha'), entry('beta')]} onDone={jest.fn()} />,
    );

    expect(screen.getByTestId('drill-progress')).toHaveTextContent('1 of 2');
    await user.click(screen.getByTestId('drill-reveal'));
    await user.click(screen.getByTestId('drill-knew'));

    expect(screen.getByTestId('drill-progress')).toHaveTextContent('2 of 2');
    expect(screen.queryByTestId('drill-answer')).not.toBeInTheDocument();
  });

  it('reports what was recalled, counting only what was claimed', async () => {
    const user = userEvent.setup();
    render(
      <RecallDrill entries={[entry('alpha'), entry('beta')]} onDone={jest.fn()} />,
    );

    await user.click(screen.getByTestId('drill-reveal'));
    await user.click(screen.getByTestId('drill-knew'));
    await user.click(screen.getByTestId('drill-reveal'));
    await user.click(screen.getByTestId('drill-missed'));

    expect(screen.getByTestId('drill-summary')).toHaveTextContent(
      'You recalled 1 of 2.',
    );
  });

  it('starts clean when run again', async () => {
    const user = userEvent.setup();
    render(<RecallDrill entries={[entry('alpha')]} onDone={jest.fn()} />);

    await user.click(screen.getByTestId('drill-reveal'));
    await user.click(screen.getByTestId('drill-knew'));
    await user.click(screen.getByTestId('drill-restart'));

    expect(screen.getByTestId('drill-progress')).toHaveTextContent('1 of 1');
    expect(screen.queryByTestId('drill-answer')).not.toBeInTheDocument();
  });

  it('lets someone leave mid-drill', async () => {
    const user = userEvent.setup();
    const onDone = jest.fn();
    render(<RecallDrill entries={[entry('alpha'), entry('beta')]} onDone={onDone} />);

    await user.click(screen.getByTestId('drill-stop'));
    expect(onDone).toHaveBeenCalled();
  });

  /**
   * Nothing here is written back to the bank — a real scheduler needs a due
   * date per entry, which is a change to the stored shape. The drill must not
   * pretend otherwise by looking like it saved something.
   */
  it('claims no progress it has not stored', async () => {
    const user = userEvent.setup();
    render(<RecallDrill entries={[entry('alpha')]} onDone={jest.fn()} />);

    await user.click(screen.getByTestId('drill-reveal'));
    await user.click(screen.getByTestId('drill-knew'));

    expect(screen.getByTestId('drill')).not.toHaveTextContent(/saved|progress|streak/i);
  });
});

/**
 * The fourth question the server keeps counts for, and the only one it cannot
 * observe: whether the words stay. The drill reported nothing at all until
 * now, on the mechanic the product is named for.
 */
describe('what the drill reports', () => {
  const reported = reportEvent as jest.Mock;

  beforeEach(() => reported.mockClear());

  it('reports a drill starting, once, when it opens', () => {
    render(<RecallDrill entries={[entry('alpha'), entry('beta')]} onDone={() => {}} />);

    expect(reported).toHaveBeenCalledWith('drill_started');
    expect(reported).toHaveBeenCalledTimes(1);
  });

  it('reports each self-marked answer', async () => {
    const user = userEvent.setup();
    render(<RecallDrill entries={[entry('alpha'), entry('beta')]} onDone={() => {}} />);

    await user.click(screen.getByTestId('drill-reveal'));
    await user.click(screen.getByTestId('drill-knew'));
    await user.click(screen.getByTestId('drill-reveal'));
    await user.click(screen.getByTestId('drill-missed'));

    expect(reported).toHaveBeenCalledWith('word_recalled');
    expect(reported).toHaveBeenCalledWith('word_forgotten');
  });

  it('reports finishing only when the queue runs out', async () => {
    const user = userEvent.setup();
    render(<RecallDrill entries={[entry('alpha')]} onDone={() => {}} />);

    expect(reported).not.toHaveBeenCalledWith('drill_finished');

    await user.click(screen.getByTestId('drill-reveal'));
    await user.click(screen.getByTestId('drill-knew'));

    expect(reported).toHaveBeenCalledWith('drill_finished');
  });
});
