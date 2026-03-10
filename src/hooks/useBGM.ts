import { useEffect, useRef, useState, useCallback } from 'react';

const STORAGE_KEY = 'ai_rpg_bgm_volume';

export function useBGM(currentBgmKey: string | undefined) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const activeBgmKey = useRef<string | undefined>(undefined);
  const [volume, setVolume] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved !== null ? parseFloat(saved) : 0.5;
  });

  // Persist volume preference
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(volume));
    console.log("Volume set to:", volume);
    console.log("Audio element:", audioRef);
    console.log("Audio element:", audioRef.current);
    if (audioRef.current) {
      console.log("Setting audio volume to:", volume);
      audioRef.current.volume = volume;
    }
  }, [volume]);

  // Handle BGM switching
  useEffect(() => {
    if (!currentBgmKey) return;

    // Same track already playing — do nothing
    if (currentBgmKey === activeBgmKey.current) return;

    activeBgmKey.current = currentBgmKey;

    // console.log("audioRef", audioRef);
    if (!audioRef.current) {
      audioRef.current = new Audio();
      audioRef.current.loop = true;
      console.log("new audioRef", audioRef);
    }

    const audio = audioRef.current;
    audio.src = currentBgmKey;
    audio.volume = volume;
    audio.loop = true;
    // console.log("Playing BGM:", currentBgmKey, "with volume:", volume);
    // console.log("Audio element before play:", audioRef);
    audio.play().catch(() => {
      // Autoplay blocked — will play on next user interaction
      const resume = () => {
        if (activeBgmKey.current === currentBgmKey) {
          audio.play().catch(() => {});
        }
        document.removeEventListener('click', resume);
        document.removeEventListener('touchstart', resume);
      };
      document.addEventListener('click', resume, { once: true });
      document.addEventListener('touchstart', resume, { once: true });
    });
  }, [currentBgmKey]);

  // Cleanup on unmount
  useEffect(() => {
    // 这里 return 一个函数，这是在组件卸载时执行的
    return () => {
      // 停止当前播放（如果有）
      if (audioRef.current) {
        audioRef.current.pause();
        // 彻底销毁防止幽灵声音
        audioRef.current.removeAttribute('src'); 
        audioRef.current.load();
        audioRef.current = null;
      }
      // 重置记录的 Key，确保下次挂载时能重新触发播放逻辑
      activeBgmKey.current = undefined; 
    };
  }, []);

  const changeVolume = useCallback((v: number) => {
    console.log("Changing volume to:", v);
    setVolume(Math.max(0, Math.min(1, v)));
  }, []);

  return { volume, changeVolume };
}
