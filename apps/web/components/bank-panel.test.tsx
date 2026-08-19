import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CLAIM_PROMPT_THRESHOLD, type BankEntry } from '@auto-learn/shared';
import { BankPanel } from './bank-panel';

const entry = (word: string, overrides: Partial<BankEntry> = {}): BankEntry => ({
  id: `${word}:s1`,
  word,
  lemma: word,
  partOfSpeech: 'adjective',
  senseId: 's1',
  definition: `Definition of ${word}.`,
  synonyms: [],
  useCases: [],
  register: 'formal',
  sourceSentence: 'The results were very big.',
  addedVia: 'accepted',
  addedAt: new Date().toISOString(),
  timesReused: 0,
  lastReusedAt: null,
  ...overrides,
});

const many = (n: number) =>
  Array.from({ length: n }, (_, i) => entry(`word${i}`));

describe('BankPanel when empty', () => {
  it('explains what will collect there', () => {
    render(<BankPanel entries={[]} count={0} />);
    expect(screen.getByTestId('bank')).toHaveTextContent(/will collect here/i);
  });

  it('does not ask for an account before there is anything to lose', () => {
    render(<BankPanel entries={[]} count={0} />);
    expect(screen.queryByTestId('claim-prompt')).not.toBeInTheDocument();
  });
});

describe('BankPanel with words', () => {
  it('shows the count', () => {
    render(<BankPanel entries={[entry('substantial')]} count={1} />);
    expect(screen.getByTestId('bank-count')).toHaveTextContent('1');
  });

  it('keeps the words hidden until asked', async () => {
    const user = userEvent.setup();
    render(<BankPanel entries={[entry('substantial')]} count={1} />);

    expect(screen.queryByTestId('bank-list')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('bank-toggle'));
    expect(screen.getByTestId('bank-list')).toBeInTheDocument();
    expect(screen.getByText('substantial')).toBeInTheDocument();
  });

  it('shows how the word was acquired and where it came from', async () => {
    const user = userEvent.setup();
    render(
      <BankPanel
        entries={[entry('substantial', { addedVia: 'tapped' })]}
        count={1}
      />,
    );
    await user.click(screen.getByTestId('bank-toggle'));

    expect(screen.getByText('tapped')).toBeInTheDocument();
    expect(screen.getByText(/The results were very big\./)).toBeInTheDocument();
  });

  it('marks a word the writer has since reused', async () => {
    const user = userEvent.setup();
    render(
      <BankPanel
        entries={[entry('substantial', { timesReused: 3 })]}
        count={1}
      />,
    );
    await user.click(screen.getByTestId('bank-toggle'));
    expect(screen.getByTestId('reused-badge')).toHaveTextContent('used 3');
  });
});

describe('BankPanel account prompt', () => {
  it('stays quiet just below the threshold', () => {
    const n = CLAIM_PROMPT_THRESHOLD - 1;
    render(<BankPanel entries={many(n)} count={n} />);
    expect(screen.queryByTestId('claim-prompt')).not.toBeInTheDocument();
  });

  it('asks once the bank is worth losing', () => {
    const n = CLAIM_PROMPT_THRESHOLD;
    render(<BankPanel entries={many(n)} count={n} />);
    expect(screen.getByTestId('claim-prompt')).toHaveTextContent(
      `${n} words saved`,
    );
  });
});
