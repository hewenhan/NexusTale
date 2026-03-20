import { useState, useEffect, useRef, useCallback } from 'react';
import { BG_LIST } from '../types/game';

function pickRandom(exclude?: string): string {
  const pool = exclude ? BG_LIST.filter(b => b !== exclude) : BG_LIST;
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Full-screen background image with crossfade transition.
 * Non-interactive — purely decorative.
 *
 * @param trigger - increment this number to swap to a new random image
 */
export function BackgroundImage({ trigger }: { trigger: number }) {
  const [layers, setLayers] = useState<{ src: string; opacity: number }[]>(
    () => [{ src: pickRandom(), opacity: 1 }]
  );
  const prevTrigger = useRef(trigger);

  const swap = useCallback(() => {
    setLayers(prev => {
      const current = prev[prev.length - 1].src;
      const next = pickRandom(current);
      return [...prev, { src: next, opacity: 0 }];
    });
    // Fade in new layer on next frame
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setLayers(prev => prev.map((l, i) =>
          i === prev.length - 1 ? { ...l, opacity: 1 } : l
        ));
      });
    });
  }, []);

  // Remove old layers after transition
  useEffect(() => {
    if (layers.length <= 1) return;
    const timer = setTimeout(() => {
      setLayers(prev => [prev[prev.length - 1]]);
    }, 700);
    return () => clearTimeout(timer);
  }, [layers.length]);

  // React to trigger changes
  useEffect(() => {
    if (trigger !== prevTrigger.current) {
      prevTrigger.current = trigger;
      swap();
    }
  }, [trigger, swap]);

  const imgStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    objectPosition: 'center',
    pointerEvents: 'none',
    userSelect: 'none',
  };

  return (
    <>
      {layers.map((layer, i) => (
        <img
          key={layer.src + i}
          src={layer.src}
          alt=""
          draggable={false}
          style={{
            ...imgStyle,
            zIndex: i,
            opacity: layer.opacity,
            transition: 'opacity 600ms ease-in-out',
          }}
        />
      ))}
      {/* Dark overlay for readability */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.55)',
          pointerEvents: 'none',
          zIndex: layers.length,
        }}
      />
    </>
  );
}
