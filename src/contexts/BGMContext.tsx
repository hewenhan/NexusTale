/**
 * BGMContext — 全局 BGM 管理
 *
 * 单一 Audio 元素存活于 Context 中，不随页面切换销毁。
 * 页面通过 useBGMControl(key) 声明式设置当前 BGM。
 * key 为 undefined 表示"不管 BGM，保持上一首继续播"。
 */

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react';

const STORAGE_KEY = 'ai_rpg_bgm_volume';

interface BGMContextValue {
  setBgmKey: (key: string | undefined) => void;
  volume: number;
  changeVolume: (v: number) => void;
}

const BGMContext = createContext<BGMContextValue | null>(null);

export function BGMProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeBgmKey = useRef<string | undefined>(undefined);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null ? parseFloat(saved) : 0.5;
  });

  // Persist volume & sync to audio element
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(volume));
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const setBgmKey = useCallback((key: string | undefined) => {
    if (key === undefined) return; // undefined = don't touch, keep current
    if (key === activeBgmKey.current) return; // same track — no-op

    activeBgmKey.current = key;

    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
    }

    const audio = audioRef.current;
    audio.src = key;
    audio.volume = volume;
    audio.loop = true;
    audio.play().catch(() => {
      const resume = () => {
        if (activeBgmKey.current === key) {
          audio.play().catch(() => {});
        }
        document.removeEventListener('click', resume);
        document.removeEventListener('touchstart', resume);
      };
      document.addEventListener('click', resume, { once: true });
      document.addEventListener('touchstart', resume, { once: true });
    });
  }, [volume]);

  const changeVolume = useCallback((v: number) => {
    setVolume(Math.max(0, Math.min(1, v)));
  }, []);

  return (
    <BGMContext.Provider value={{ setBgmKey, volume, changeVolume }}>
      {children}
    </BGMContext.Provider>
  );
}

/**
 * 页面级 hook：声明式设置当前页面的 BGM。
 * - 传入具体 key → 切换到该曲目
 * - 传入 undefined → 不干预，保持上一首继续播（用于 Chat 页面等待首条 bgmKey 的过渡期）
 */
export function useBGMControl(key: string | undefined) {
  const ctx = useContext(BGMContext);
  if (!ctx) throw new Error('useBGMControl must be used within BGMProvider');

  useEffect(() => {
    if (key !== undefined) {
      ctx.setBgmKey(key);
    }
  }, [key, ctx.setBgmKey]);

  return { volume: ctx.volume, changeVolume: ctx.changeVolume };
}
