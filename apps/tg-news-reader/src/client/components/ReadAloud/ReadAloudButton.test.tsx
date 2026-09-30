import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../__tests__/renderWithProviders';
import { ReadAloudButton } from './ReadAloudButton';

beforeEach(() => {
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: { speak: vi.fn(), cancel: vi.fn(), pause: vi.fn(), resume: vi.fn() },
  });
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: class {
      constructor(public text: string) {}
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
    },
  });
});

afterEach(() => vi.restoreAllMocks());

describe('ReadAloudButton', () => {
  it('renders an enabled button when text is non-empty', () => {
    renderWithProviders(<ReadAloudButton text="Hello." />);
    const btn = screen.getByRole('button', { name: /tts\.button/ });
    expect(btn).toBeInTheDocument();
    expect(btn).not.toBeDisabled();
  });

  it('disables the button when text is empty or whitespace', () => {
    renderWithProviders(<ReadAloudButton text="   " />);
    const btn = screen.getByRole('button', { name: /tts\.button/ });
    expect(btn).toBeDisabled();
  });

  it('opens the modal on click and shows the title', () => {
    renderWithProviders(<ReadAloudButton text="Hello." title="My Article" />);
    fireEvent.click(screen.getByRole('button', { name: /tts\.button/ }));
    // The modal header includes the title text
    expect(screen.getByText(/My Article/)).toBeInTheDocument();
  });

  it('does not open the modal initially', () => {
    renderWithProviders(<ReadAloudButton text="Hello." />);
    // The Native choice button only appears once the modal opens
    expect(screen.queryByRole('button', { name: /tts\.choice_native/ })).toBeNull();
  });
});
