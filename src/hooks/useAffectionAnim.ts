/**
 * useAffectionAnim — 好感度变化动画逻辑
 */

import { useEffect, useRef, useState } from 'react';

export function useAffectionAnim(affection: number) {
  const [affectionDelta, setAffectionDelta] = useState<number | null>(null);
  const [affectionAnimKey, setAffectionAnimKey] = useState(0);
  const prevAffectionRef = useRef(affection);
  const affectionInitRef = useRef(false);

  useEffect(() => {
    if (!affectionInitRef.current) {
      affectionInitRef.current = true;
      prevAffectionRef.current = affection;
      return;
    }
    const delta = affection - prevAffectionRef.current;
    prevAffectionRef.current = affection;
    if (delta !== 0) {
      setAffectionDelta(delta);
      setAffectionAnimKey(k => k + 1);
      const timer = setTimeout(() => setAffectionDelta(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [affection]);

  return { affectionDelta, affectionAnimKey };
}
