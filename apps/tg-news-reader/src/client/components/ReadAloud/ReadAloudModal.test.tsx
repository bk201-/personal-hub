import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../__tests__/renderWithProviders';
import { ReadAloudModal } from './ReadAloudModal';

interface MockUtterance {
  text: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

let speakCalls: MockUtterance[];

beforeEach(() => {
  speakCalls = [];
  class MockUtteranceCtor {
    text: string;
    onend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }
  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    configurable: true,
    writable: true,
    value: MockUtteranceCtor,
  });
  Object.defineProperty(window, 'speechSynthesis', {
    configurable: true,
    writable: true,
    value: {
      speak: (u: MockUtterance) => speakCalls.push(u),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ReadAloudModal', () => {
  const onClose = vi.fn();

  beforeEach(() => onClose.mockReset());

  it('shows character count in the meta line', () => {
    const text = 'Hello world.';
    renderWithProviders(<ReadAloudModal open text={text} onClose={onClose} />);
    // The i18n mock returns "tts.char_count:{...}" — count goes in the opts payload
    expect(screen.getByText(/tts\.char_count.*"count":12/)).toBeInTheDocument();
  });

  it('renders both Native and AI choice buttons in initial state', () => {
    renderWithProviders(<ReadAloudModal open text="Hello." onClose={onClose} />);
    expect(screen.getByRole('button', { name: /tts\.choice_native/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tts\.choice_ai/ })).toBeInTheDocument();
  });

  it('keeps the AI button disabled (Phase 1)', () => {
    renderWithProviders(<ReadAloudModal open text="Hello." onClose={onClose} />);
    const aiBtn = screen.getByRole('button', { name: /tts\.choice_ai/ });
    expect(aiBtn).toBeDisabled();
  });

  it('clicking Native starts speech and reveals the player controls', () => {
    renderWithProviders(<ReadAloudModal open text="One. Two." onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /tts\.choice_native/ }));

    expect(speakCalls).toHaveLength(1);
    expect(speakCalls[0].text).toBe('One.');

    // Stop button is part of the player view
    expect(screen.getByRole('button', { name: /tts\.stop/ })).toBeInTheDocument();
    // Position label shows 1/2
    expect(screen.getByText(/tts\.position.*"current":1.*"total":2/)).toBeInTheDocument();
  });

  it('Stop button returns the modal to the choice state', () => {
    renderWithProviders(<ReadAloudModal open text="One. Two." onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /tts\.choice_native/ }));
    fireEvent.click(screen.getByRole('button', { name: /tts\.stop/ }));
    // Native + AI buttons should be back
    expect(screen.getByRole('button', { name: /tts\.choice_native/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /tts\.choice_ai/ })).toBeInTheDocument();
  });

  it('shows a warning when the text is empty', () => {
    renderWithProviders(<ReadAloudModal open text="   " onClose={onClose} />);
    expect(screen.getByText(/tts\.empty_text/)).toBeInTheDocument();
    const nativeBtn = screen.getByRole('button', { name: /tts\.choice_native/ });
    expect(nativeBtn).toBeDisabled();
  });

  it('shows a warning when speechSynthesis is unavailable', () => {
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    renderWithProviders(<ReadAloudModal open text="Hello." onClose={onClose} />);
    expect(screen.getByText(/tts\.native_unsupported/)).toBeInTheDocument();
    const nativeBtn = screen.getByRole('button', { name: /tts\.choice_native/ });
    expect(nativeBtn).toBeDisabled();
  });

  it('displays the title in the modal header when provided', () => {
    renderWithProviders(<ReadAloudModal open text="X." title="Hello article" onClose={onClose} />);
    // Header is "tts.modal_title — Hello article"
    expect(screen.getByText(/Hello article/)).toBeInTheDocument();
  });
});
