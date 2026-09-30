import type { DownloadTask } from '@shared/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskList } from './DownloadTaskList';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const task: DownloadTask = {
  id: 1,
  newsId: 10,
  type: 'media',
  status: 'failed',
  priority: 10,
  createdAt: 0,
};

describe('download queue actions', () => {
  afterEach(cleanup);

  it.each([false, true])('shows image downloads with an image label in mixed queues: %s', (mixed) => {
    const image: DownloadTask = { ...task, id: 3, type: 'image', newsText: 'Image preview' };
    render(
      <TaskList
        tasks={mixed ? [task, { ...task, id: 2, type: 'article' }, image] : [image]}
        cancelDownload={{ mutate: vi.fn() }}
        prioritizeDownload={{ mutate: vi.fn() }}
      />,
    );
    expect(screen.getByText('Image preview')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'downloads.typeImage' })).toBeInTheDocument();
    expect(screen.queryAllByText('downloads.typeImage')).toHaveLength(mixed ? 1 : 0);
  });

  it('keeps retained completed image tasks out of the visible queue', () => {
    render(
      <TaskList
        tasks={[{ ...task, type: 'image', status: 'done' }]}
        cancelDownload={{ mutate: vi.fn() }}
        prioritizeDownload={{ mutate: vi.fn() }}
      />,
    );
    expect(screen.getByText('downloads.empty')).toBeInTheDocument();
    expect(screen.queryByText('downloads.status_priority')).not.toBeInTheDocument();
  });

  it('lets a failed manual download be retried', () => {
    const prioritize = vi.fn();
    render(
      <TaskList tasks={[task]} cancelDownload={{ mutate: vi.fn() }} prioritizeDownload={{ mutate: prioritize }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'downloads.boost_tooltip' }));
    expect(prioritize).toHaveBeenCalledWith(task.id);
  });

  it('shows cancellation errors instead of silently ignoring them', () => {
    const cancel = { mutate: vi.fn(), error: new Error('Task is already processing') };
    render(<TaskList tasks={[task]} cancelDownload={cancel} prioritizeDownload={{ mutate: vi.fn() }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Task is already processing');
  });

  it('shows prioritization errors', () => {
    render(
      <TaskList
        tasks={[task]}
        cancelDownload={{ mutate: vi.fn() }}
        prioritizeDownload={{ mutate: vi.fn(), error: new Error('Task not found') }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Task not found');
  });

  it('deletes a pending task and disables both actions while its request is pending', () => {
    const cancel = { mutate: vi.fn(), isPending: false, variables: 1 };
    const props = {
      tasks: [{ ...task, priority: 0, status: 'pending' as const }],
      cancelDownload: cancel,
      prioritizeDownload: { mutate: vi.fn() },
    };
    const { rerender } = render(<TaskList {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'downloads.cancel_tooltip' }));
    expect(cancel.mutate).toHaveBeenCalledWith(1);
    rerender(<TaskList {...props} cancelDownload={{ ...cancel, isPending: true }} />);
    expect(screen.getByRole('button', { name: 'downloads.cancel_tooltip' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'downloads.boost_tooltip' })).toBeDisabled();
  });

  it('does not offer cancellation or priority changes for an active download', () => {
    render(
      <TaskList
        tasks={[{ ...task, status: 'processing' }]}
        cancelDownload={{ mutate: vi.fn() }}
        prioritizeDownload={{ mutate: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('does not offer a redundant boost for an already prioritized pending task', () => {
    render(
      <TaskList
        tasks={[{ ...task, status: 'pending' }]}
        cancelDownload={{ mutate: vi.fn() }}
        prioritizeDownload={{ mutate: vi.fn() }}
      />,
    );
    expect(screen.queryByRole('button', { name: 'downloads.boost_tooltip' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'downloads.cancel_tooltip' })).toBeInTheDocument();
  });
});
