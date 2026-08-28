import { render, screen } from '@testing-library/react';
import type { ProposePreview } from '@/lib/api';
import { ProposingPanel } from './proposing-panel';

const fix: ProposePreview = {
  kind: 'fix',
  sentence: 0,
  type: 'typo',
  original: 'efect',
  replacement: 'effect',
};

const gate: ProposePreview = {
  kind: 'gate',
  sentence: 0,
  type: 'word-choice',
  original: 'big',
  teaser: 'stronger word available',
};

describe('ProposingPanel', () => {
  it('falls back to skeletons before anything has arrived', () => {
    render(<ProposingPanel preview={[]} />);

    expect(screen.getByTestId('proposing')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-fix')).not.toBeInTheDocument();
    expect(screen.queryByTestId('preview-gate')).not.toBeInTheDocument();
  });

  it('shows a fix in full, since nothing about it is withheld', () => {
    render(<ProposingPanel preview={[fix]} />);

    expect(screen.getByText('efect')).toBeInTheDocument();
    expect(screen.getByText('effect')).toBeInTheDocument();
  });

  /**
   * The gate, in the one place it would be easiest to leak: a progressive
   * render is written for the reader's benefit, and "just show what changed"
   * is the obvious thing to write here and the wrong thing.
   */
  it('shows a gate as the writer’s own words and a teaser, never a wording', () => {
    render(<ProposingPanel preview={[gate]} />);

    expect(screen.getByText('big')).toBeInTheDocument();
    expect(screen.getByText('stronger word available')).toBeInTheDocument();
    expect(screen.getByTestId('preview-gate').textContent).not.toContain(
      'substantial',
    );
  });

  it('keeps the model’s order, which is the order the reader is reading in', () => {
    render(<ProposingPanel preview={[fix, gate]} />);

    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('data-testid', 'preview-fix');
    expect(items[1]).toHaveAttribute('data-testid', 'preview-gate');
  });

  it('offers nothing to click: these spans have no settled position yet', () => {
    render(<ProposingPanel preview={[fix, gate]} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
