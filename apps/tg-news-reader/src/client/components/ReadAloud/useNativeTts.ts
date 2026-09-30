import { useCallback, useEffect, useRef, useState } from 'react';
import { detectTtsLang } from './detectTtsLang';

/**
 * Detects whether the runtime supports the Web Speech API.
 * In tests / SSR we return `false`.
 */
export function isNativeTtsSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export type NativeTtsStatus = 'idle' | 'playing' | 'paused';

export interface UseNativeTtsResult {
  supported: boolean;
  status: NativeTtsStatus;
  currentIndex: number;
  total: number;
  /** Start playback from the beginning (or `fromIndex`). */
  start: (fromIndex?: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  prev: () => void;
  next: () => void;
}

/**
 * Sequentially speaks an array of sentences through the Web Speech API.
 *
 * Notes:
 *  - `speechSynthesis.cancel()` fires `onend`; we use `manualCancelRef` to suppress auto-advance
 *    when the user clicks Prev/Next/Stop or the modal is closed.
 *  - We re-read `sentences` from a ref to avoid restarting playback when the parent re-renders.
 */
export function useNativeTts(sentences: string[]): UseNativeTtsResult {
  const [supported] = useState<boolean>(() => isNativeTtsSupported());
  const [status, setStatus] = useState<NativeTtsStatus>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);

  const sentencesRef = useRef(sentences);
  sentencesRef.current = sentences;
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  /** Detach handlers from the current utterance so any late-firing events become no-ops. */
  const detachCurrent = useCallback(() => {
    if (utteranceRef.current) {
      utteranceRef.current.onend = null;
      utteranceRef.current.onerror = null;
      utteranceRef.current = null;
    }
  }, []);

  const speakAt = useCallback(
    (index: number) => {
      if (!isNativeTtsSupported()) return;
      const list = sentencesRef.current;
      if (index < 0 || index >= list.length) {
        setStatus('idle');
        return;
      }

      detachCurrent();
      window.speechSynthesis.cancel();

      const utter = new SpeechSynthesisUtterance(list[index]);
      // Auto-detect language per sentence — without this the browser falls back to its default
      // voice (usually English) and reads Cyrillic text letter-by-letter as broken phonemes.
      utter.lang = detectTtsLang(list[index]);
      utter.onend = () => {
        // Guard: ignore late onend from a cancelled utterance
        if (utteranceRef.current !== utter) return;
        const nextIndex = index + 1;
        if (nextIndex < sentencesRef.current.length) {
          setCurrentIndex(nextIndex);
          speakAt(nextIndex);
        } else {
          utteranceRef.current = null;
          setStatus('idle');
        }
      };
      utter.onerror = () => {
        if (utteranceRef.current !== utter) return;
        utteranceRef.current = null;
        setStatus('idle');
      };

      utteranceRef.current = utter;
      setCurrentIndex(index);
      setStatus('playing');
      window.speechSynthesis.speak(utter);
    },
    [detachCurrent],
  );

  const start = useCallback(
    (fromIndex = 0) => {
      speakAt(fromIndex);
    },
    [speakAt],
  );

  const pause = useCallback(() => {
    if (!isNativeTtsSupported()) return;
    window.speechSynthesis.pause();
    setStatus('paused');
  }, []);

  const resume = useCallback(() => {
    if (!isNativeTtsSupported()) return;
    window.speechSynthesis.resume();
    setStatus('playing');
  }, []);

  const stop = useCallback(() => {
    if (!isNativeTtsSupported()) return;
    detachCurrent();
    window.speechSynthesis.cancel();
    setStatus('idle');
    setCurrentIndex(0);
  }, [detachCurrent]);

  const prev = useCallback(() => {
    const target = Math.max(0, currentIndex - 1);
    speakAt(target);
  }, [currentIndex, speakAt]);

  const next = useCallback(() => {
    const target = currentIndex + 1;
    if (target >= sentencesRef.current.length) {
      stop();
      return;
    }
    speakAt(target);
  }, [currentIndex, speakAt, stop]);

  // Safety net: always cancel on unmount so playback doesn't outlive the component.
  useEffect(() => {
    return () => {
      if (isNativeTtsSupported()) {
        detachCurrent();
        window.speechSynthesis.cancel();
      }
    };
  }, [detachCurrent]);

  return {
    supported,
    status,
    currentIndex,
    total: sentences.length,
    start,
    pause,
    resume,
    stop,
    prev,
    next,
  };
}
