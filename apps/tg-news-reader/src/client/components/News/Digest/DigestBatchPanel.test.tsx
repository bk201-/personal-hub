import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DigestBatchPanel } from './DigestBatchPanel';

// Minimal i18n mock — returns key with simple interpolation
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, string | number>) => {
      if (!vars) return key;
      return (
        key +
        ':' +
        Object.entries(vars)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
      );
    },
  }),
}));

function makeProps(overrides: Partial<React.ComponentProps<typeof DigestBatchPanel>> = {}) {
  return {
    index: 0,
    fromItem: 1,
    toItem: 50,
    status: 'idle' as const,
    progress: null,
    error: null,
    digestOpened: false,
    onShow: vi.fn(),
    onMarkRead: vi.fn(),
    onRetry: vi.fn(),
    ...overrides,
  };
}

describe('DigestBatchPanel', () => {
  it('shows pending status when idle', () => {
    render(<DigestBatchPanel {...makeProps({ status: 'idle' })} />);
    expect(screen.getByText('digest.batch_status_pending')).toBeInTheDocument();
  });

  it('shows prefetch progress bar when prefetching', () => {
    render(
      <DigestBatchPanel
        {...makeProps({
          status: 'prefetching',
          progress: { done: 3, total: 10, errors: 1 },
        })}
      />,
    );
    expect(screen.getByText('digest.batch_status_prefetching')).toBeInTheDocument();
    expect(screen.getByText('3/10')).toBeInTheDocument();
  });

  it('shows generating status', () => {
    render(<DigestBatchPanel {...makeProps({ status: 'generating' })} />);
    expect(screen.getByText('digest.batch_status_generating')).toBeInTheDocument();
  });

  it('does not render action buttons while not done', () => {
    render(<DigestBatchPanel {...makeProps({ status: 'generating' })} />);
    expect(screen.queryByText('digest.batch_show')).not.toBeInTheDocument();
    expect(screen.queryByText('digest.batch_mark_read')).not.toBeInTheDocument();
  });

  it('renders Show Digest + Mark as Read buttons when done', () => {
    render(<DigestBatchPanel {...makeProps({ status: 'done' })} />);
    expect(screen.getByText('digest.batch_show')).toBeInTheDocument();
    expect(screen.getByText('digest.batch_mark_read')).toBeInTheDocument();
  });

  it('disables Mark as Read until digestOpened becomes true', () => {
    const { rerender } = render(<DigestBatchPanel {...makeProps({ status: 'done', digestOpened: false })} />);
    const markReadBtn = screen.getByText('digest.batch_mark_read').closest('button')!;
    expect(markReadBtn).toBeDisabled();

    rerender(<DigestBatchPanel {...makeProps({ status: 'done', digestOpened: true })} />);
    expect(screen.getByText('digest.batch_mark_read').closest('button')!).not.toBeDisabled();
  });

  it('fires onShow when Show Digest is clicked', () => {
    const onShow = vi.fn();
    render(<DigestBatchPanel {...makeProps({ status: 'done', onShow })} />);
    fireEvent.click(screen.getByText('digest.batch_show'));
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it('fires onMarkRead when Mark as Read is clicked (after digestOpened)', () => {
    const onMarkRead = vi.fn();
    render(<DigestBatchPanel {...makeProps({ status: 'done', digestOpened: true, onMarkRead })} />);
    fireEvent.click(screen.getByText('digest.batch_mark_read'));
    expect(onMarkRead).toHaveBeenCalledTimes(1);
  });

  it('shows Retry button on error and fires onRetry', () => {
    const onRetry = vi.fn();
    render(<DigestBatchPanel {...makeProps({ status: 'error', error: 'boom', onRetry })} />);
    expect(screen.getByText('digest.batch_status_error')).toBeInTheDocument();
    fireEvent.click(screen.getByText('digest.batch_retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders the correct item-range label', () => {
    render(<DigestBatchPanel {...makeProps({ fromItem: 51, toItem: 100 })} />);
    expect(screen.getByText('digest.batch_label:from=51,to=100')).toBeInTheDocument();
  });
});
