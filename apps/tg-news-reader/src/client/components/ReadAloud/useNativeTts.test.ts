import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNativeTts } from './useNativeTts';

interface MockUtterance {
  text: string;
  lang: string;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

let speakCalls: MockUtterance[] = [];
let cancelCalls = 0;
let pauseCalls = 0;
let resumeCalls = 0;

beforeEach(() => {
  speakCalls = [];
  cancelCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;

  class MockUtteranceCtor {
    text: string;
    lang: string = '';
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
      speak: (utter: MockUtterance) => speakCalls.push(utter),
      cancel: () => {
        cancelCalls += 1;
      },
      pause: () => {
        pauseCalls += 1;
      },
      resume: () => {
        resumeCalls += 1;
      },
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useNativeTts', () => {
  const sentences = ['One.', 'Two.', 'Three.'];

  it('reports supported=true when speechSynthesis is available', () => {
    const { result } = renderHook(() => useNativeTts(sentences));
    expect(result.current.supported).toBe(true);
    expect(result.current.total).toBe(3);
    expect(result.current.status).toBe('idle');
    expect(result.current.currentIndex).toBe(0);
  });

  it('start() calls speak() with the first sentence and flips status to playing', () => {
    const { result } = renderHook(() => useNativeTts(sentences));
    act(() => result.current.start());
    expect(speakCalls).toHaveLength(1);
    expect(speakCalls[0].text).toBe('One.');
    expect(result.current.status).toBe('playing');
    expect(result.current.currentIndex).toBe(0);
  });

  it('auto-advances on utterance onend', () => {
    const { result } = renderHook(() => useNativeTts(sentences));
    act(() => result.current.start());
    act(() => {
      speakCalls[0].onend?.();
    });
    expect(speakCalls).toHaveLength(2);
    expect(speakCalls[1].text).toBe('Two.');
    expect(result.current.currentIndex).toBe(1);
  });

  it('stops at the last sentence', () => {
    const { result } = renderHook(() => useNativeTts(sentences));
    act(() => result.current.start(2));
    act(() => {
      speakCalls[0].onend?.();
    });
    expect(result.current.status).toBe('idle');
    // No new speak call after the last sentence ends
    expect(speakCalls).toHaveLength(1);
  });

  it('pause() and resume() proxy to speechSynthesis', () => {
    const { result } = renderHook(() => useNativeTts(sentences));
    act(() => result.current.start());
    act(() => result.current.pause());
    expect(pauseCalls).toBe(1);
    expect(result.current.status).toBe('paused');
    act(() => result.current.resume());
    expect(resumeCalls).toBe(1);
    expect(result.current.status).toBe('playing');
  });

  it('prev() jumps to the previous sentence and does not go below 0', () => {
    const { result } = renderHook(() => useNativeTts(sentences));
    act(() => result.current.start(2));
    act(() => result.current.prev());
    expect(result.current.currentIndex).toBe(1);
    act(() => result.current.prev());
    act(() => result.current.prev());
    expect(result.current.currentIndex).toBe(0);
    // The last speak() call should be the first sentence
    expect(speakCalls[speakCalls.length - 1].text).toBe('One.');
  });

  it('next() advances to the next sentence and stops past the end', () => {
    const { result } = renderHook(() => useNativeTts(sentences));
    act(() => result.current.start(0));
    act(() => result.current.next());
    expect(result.current.currentIndex).toBe(1);
    act(() => result.current.next());
    expect(result.current.currentIndex).toBe(2);
    act(() => result.current.next());
    expect(result.current.status).toBe('idle');
    expect(result.current.currentIndex).toBe(0);
  });

  it('stop() cancels and resets state', () => {
    const { result } = renderHook(() => useNativeTts(sentences));
    act(() => result.current.start(1));
    const cancelsBefore = cancelCalls;
    act(() => result.current.stop());
    expect(cancelCalls).toBe(cancelsBefore + 1);
    expect(result.current.status).toBe('idle');
    expect(result.current.currentIndex).toBe(0);
  });

  it('does not auto-advance when cancel was triggered manually (e.g. by next/stop)', () => {
    const { result } = renderHook(() => useNativeTts(sentences));
    act(() => result.current.start());
    act(() => result.current.next()); // cancels current, starts next
    const speaksBefore = speakCalls.length;
    // Simulate the cancelled utterance firing its onend belatedly
    act(() => {
      speakCalls[0].onend?.();
    });
    // No new speak should fire from that stale onend
    expect(speakCalls.length).toBe(speaksBefore);
  });

  it('cancels playback on unmount', () => {
    const { result, unmount } = renderHook(() => useNativeTts(sentences));
    act(() => result.current.start());
    const cancelsBefore = cancelCalls;
    unmount();
    expect(cancelCalls).toBeGreaterThan(cancelsBefore);
  });

  it('reports supported=false when speechSynthesis is missing', () => {
    // Remove the API for this test
    delete (window as unknown as { speechSynthesis?: unknown }).speechSynthesis;
    delete (window as unknown as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;
    const { result } = renderHook(() => useNativeTts(sentences));
    expect(result.current.supported).toBe(false);
    // start() should be a no-op
    act(() => result.current.start());
    expect(result.current.status).toBe('idle');
  });

  describe('language detection', () => {
    it('sets utterance.lang to ru-RU for Cyrillic sentences', () => {
      const { result } = renderHook(() => useNativeTts(['Привет, как дела?']));
      act(() => result.current.start());
      expect(speakCalls[0].lang).toBe('ru-RU');
    });

    it('sets utterance.lang to en-US for Latin sentences', () => {
      const { result } = renderHook(() => useNativeTts(['Hello, how are you?']));
      act(() => result.current.start());
      expect(speakCalls[0].lang).toBe('en-US');
    });

    it('detects language per sentence in a mixed-language playlist', () => {
      const { result } = renderHook(() => useNativeTts(['First in English.', 'А это уже по-русски.']));
      act(() => result.current.start(0));
      expect(speakCalls[0].lang).toBe('en-US');
      // Trigger natural advance
      act(() => {
        speakCalls[0].onend?.();
      });
      expect(speakCalls[1].lang).toBe('ru-RU');
    });
  });
});
