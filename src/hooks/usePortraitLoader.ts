/**
 * usePortraitLoader — 通用头像 URL 加载 hook
 * 消除 Chat.tsx / StatusSidebar.tsx 中三处重复的头像加载逻辑
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getImageUrlByName } from '../lib/drive';

export function usePortraitLoader(fileName: string | null | undefined): { url: string | null; reload: () => void } {
  const { accessToken } = useAuth();
  const [url, setUrl] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!fileName || !accessToken) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    getImageUrlByName(accessToken, fileName).then(result => {
      if (!cancelled && result) setUrl(result);
    });
    return () => { cancelled = true; };
  }, [fileName, accessToken, reloadKey]);

  const reload = () => setReloadKey(k => k + 1);

  return { url, reload };
}
