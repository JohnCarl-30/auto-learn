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

/**
 * The panel remembers whether it was open, and jsdom keeps localStorage for
 * the whole file — so one test's toggle would otherwise decide the next
 * test's starting state.
 */
beforeEach(() => window.localStorage.clear());

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

describe('BankPanel removing a word', () => {
  it('offers a way out of a word banked by mistake', async () => {
    const user = userEvent.setup();
    const onRemove = jest.fn();
    render(
      <BankPanel
        entries={[entry('substantial')]}
        count={1}
        onRemove={onRemove}
      />,
    );
    await user.click(screen.getByTestId('bank-toggle'));
    await user.click(screen.getByTestId('remove-word'));

    expect(onRemove).toHaveBeenCalledWith('substantial:s1');
  });

  it('labels each remove button with its word', async () => {
    const user = userEvent.setup();
    render(
      <BankPanel
        entries={[entry('substantial'), entry('nonetheless')]}
        count={2}
        onRemove={jest.fn()}
      />,
    );
    await user.click(screen.getByTestId('bank-toggle'));

    expect(
      screen.getByRole('button', { name: 'Remove substantial' }),
    ).toBeInTheDocument();
  });

  it('shows no remove control when removal is not offered', async () => {
    const user = userEvent.setup();
    render(<BankPanel entries={[entry('substantial')]} count={1} />);
    await user.click(screen.getByTestId('bank-toggle'));

    expect(screen.queryByTestId('remove-word')).not.toBeInTheDocument();
  });
});

/**
 * A bank you cannot search stops being a bank at about thirty words and
 * becomes a scroll.
 */
describe('BankPanel finding a word', () => {
  const words = [
    entry('substantial', {
      definition: 'Large enough to matter.',
      sourceSentence: 'The results were very big.',
    }),
    entry('nonetheless', {
      definition: 'In spite of that.',
      sourceSentence: 'It was late, but she finished.',
    }),
  ];

  const open = async () => {
    const user = userEvent.setup();
    render(<BankPanel entries={words} count={words.length} />);
    await user.click(screen.getByTestId('bank-toggle'));
    return user;
  };

  it('narrows the list as you type', async () => {
    const user = await open();
    await user.type(screen.getByTestId('bank-search'), 'nonethe');

    expect(screen.getByText('nonetheless')).toBeInTheDocument();
    expect(screen.queryByText('substantial')).not.toBeInTheDocument();
  });

  /** Half of what you remember about a word is the sentence you met it in. */
  it('searches the sentence the word came from, not just the word', async () => {
    const user = await open();
    await user.type(screen.getByTestId('bank-search'), 'she finished');

    expect(screen.getByText('nonetheless')).toBeInTheDocument();
    expect(screen.queryByText('substantial')).not.toBeInTheDocument();
  });

  it('searches the definition too', async () => {
    const user = await open();
    await user.type(screen.getByTestId('bank-search'), 'large enough');

    expect(screen.getByText('substantial')).toBeInTheDocument();
  });

  it('says so when nothing matches, rather than showing an empty list', async () => {
    const user = await open();
    await user.type(screen.getByTestId('bank-search'), 'zzzz');

    expect(screen.getByTestId('bank-no-match')).toBeInTheDocument();
    expect(screen.queryByTestId('bank-list')).not.toBeInTheDocument();
  });
});

describe('BankPanel ordering', () => {
  const words = [
    entry('beta', { addedAt: '2026-01-02T00:00:00.000Z', timesReused: 1 }),
    entry('alpha', { addedAt: '2026-01-01T00:00:00.000Z', timesReused: 4 }),
  ];

  const shown = () =>
    Array.from(
      screen.getByTestId('bank-list').querySelectorAll('li > div > span:first-child'),
      (node) => node.textContent,
    );

  it('leads with the newest word', async () => {
    const user = userEvent.setup();
    render(<BankPanel entries={words} count={2} />);
    await user.click(screen.getByTestId('bank-toggle'));

    expect(shown()).toEqual(['beta', 'alpha']);
  });

  it('sorts alphabetically on request', async () => {
    const user = userEvent.setup();
    render(<BankPanel entries={words} count={2} />);
    await user.click(screen.getByTestId('bank-toggle'));
    await user.selectOptions(screen.getByTestId('bank-sort'), 'alphabetical');

    expect(shown()).toEqual(['alpha', 'beta']);
  });

  /** The words you have actually used again are the evidence the bank works. */
  it('can lead with the words the writer has reused most', async () => {
    const user = userEvent.setup();
    render(<BankPanel entries={words} count={2} />);
    await user.click(screen.getByTestId('bank-toggle'));
    await user.selectOptions(screen.getByTestId('bank-sort'), 'reused');

    expect(shown()).toEqual(['alpha', 'beta']);
  });
});

describe('BankPanel remembering whether it was open', () => {
  it('comes back open once it has been opened', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BankPanel entries={[entry('substantial')]} count={1} />);

    await user.click(screen.getByTestId('bank-toggle'));
    unmount();

    render(<BankPanel entries={[entry('substantial')]} count={1} />);
    expect(await screen.findByTestId('bank-list')).toBeInTheDocument();
  });

  it('stays shut once it has been shut', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<BankPanel entries={[entry('substantial')]} count={1} />);

    await user.click(screen.getByTestId('bank-toggle'));
    await user.click(screen.getByTestId('bank-toggle'));
    unmount();

    render(<BankPanel entries={[entry('substantial')]} count={1} />);
    expect(screen.queryByTestId('bank-list')).not.toBeInTheDocument();
  });
});

describe('BankPanel practice', () => {
  it('is not offered on a bank too small to have forgotten anything', async () => {
    const user = userEvent.setup();
    render(<BankPanel entries={many(2)} count={2} />);
    await user.click(screen.getByTestId('bank-toggle'));

    expect(screen.queryByTestId('bank-practice')).not.toBeInTheDocument();
  });

  it('starts a drill over the words on screen', async () => {
    const user = userEvent.setup();
    render(<BankPanel entries={many(5)} count={5} />);
    await user.click(screen.getByTestId('bank-toggle'));
    await user.click(screen.getByTestId('bank-practice'));

    expect(screen.getByTestId('drill')).toBeInTheDocument();
    expect(screen.getByTestId('drill-progress')).toHaveTextContent('1 of 5');
    expect(screen.queryByTestId('bank-list')).not.toBeInTheDocument();
  });

  /** A search narrows the drill as well as the list. */
  it('drills only what the search left', async () => {
    const user = userEvent.setup();
    // word1 and word10..word19 — eleven of the twenty.
    render(<BankPanel entries={many(20)} count={20} />);
    await user.click(screen.getByTestId('bank-toggle'));
    await user.type(screen.getByTestId('bank-search'), 'word1');
    await user.click(screen.getByTestId('bank-practice'));

    expect(screen.getByTestId('drill-progress')).toHaveTextContent('1 of 11');
  });

  it('gives the list back when the drill is stopped', async () => {
    const user = userEvent.setup();
    render(<BankPanel entries={many(5)} count={5} />);
    await user.click(screen.getByTestId('bank-toggle'));
    await user.click(screen.getByTestId('bank-practice'));
    await user.click(screen.getByTestId('drill-stop'));

    expect(screen.getByTestId('bank-list')).toBeInTheDocument();
  });
});

describe('BankPanel export', () => {
  it('offers the way out whenever there is something to lose', () => {
    const onExport = jest.fn();
    render(
      <BankPanel entries={[]} count={3} onRemove={jest.fn()} onExport={onExport} />,
    );

    // Offered with the panel collapsed: the moment you reach for this is the
    // moment you are about to lose the browser, not a moment for expanding.
    expect(screen.getByTestId('bank-export')).toBeInTheDocument();
  });

  it('says nothing about exporting an empty bank', () => {
    render(<BankPanel entries={[]} count={0} onExport={jest.fn()} />);

    expect(screen.queryByTestId('bank-export')).not.toBeInTheDocument();
  });

  it('hands the click straight through', async () => {
    const onExport = jest.fn();
    const user = userEvent.setup();
    render(<BankPanel entries={[]} count={3} onExport={onExport} />);

    await user.click(screen.getByTestId('bank-export'));
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

describe('BankPanel import', () => {
  const file = (contents: string) =>
    new File([contents], 'bank.json', { type: 'application/json' });

  /**
   * The case a backup exists for is a browser with nothing in it — a fresh
   * machine, or storage that was cleared. An import control that only appears
   * next to an existing bank is unreachable exactly when it is needed.
   */
  it('offers import with an empty bank', () => {
    render(<BankPanel entries={[]} count={0} onImport={jest.fn()} />);

    expect(screen.getByTestId('bank-import')).toBeInTheDocument();
  });

  it('offers it alongside an existing bank too', () => {
    render(<BankPanel entries={[]} count={5} onImport={jest.fn()} />);

    expect(screen.getByTestId('bank-import')).toBeInTheDocument();
  });

  it('hands the chosen file over', async () => {
    const onImport = jest.fn();
    const user = userEvent.setup();
    render(<BankPanel entries={[]} count={0} onImport={onImport} />);

    await user.upload(screen.getByTestId('bank-import-input'), file('{}'));

    expect(onImport).toHaveBeenCalledTimes(1);
    expect((onImport.mock.calls[0][0] as File).name).toBe('bank.json');
  });

  /**
   * A file input holds on to its selection, so choosing the same file twice
   * fires no second change event — which would make a retry after a failed
   * import look like a dead button.
   */
  it('lets the same file be chosen again after a failure', async () => {
    const onImport = jest.fn();
    const user = userEvent.setup();
    render(<BankPanel entries={[]} count={0} onImport={onImport} />);

    const input = screen.getByTestId('bank-import-input');
    await user.upload(input, file('{}'));
    await user.upload(input, file('{}'));

    expect(onImport).toHaveBeenCalledTimes(2);
  });
});
