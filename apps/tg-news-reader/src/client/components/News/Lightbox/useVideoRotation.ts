import { useCallback, useState } from 'react';

export function useVideoRotation(mediaKey: string) {
  const [trackedKey, setTrackedKey] = useState(mediaKey);
  const [angle, setAngle] = useState(0);
  if (trackedKey !== mediaKey) {
    setTrackedKey(mediaKey);
    setAngle(0);
  }
  const rotate = useCallback((direction: -1 | 1) => setAngle((old) => (old + direction * 90 + 360) % 360), []);
  return { angle, rotate };
}
