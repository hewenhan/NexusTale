/**
 * usePortraitRegeneration — 头像再生成回调
 *
 * 将角色头像再生成逻辑从 Chat.tsx 提取，消除内联 async 回调。
 */

import { useCallback } from 'react';
import { GameState } from '../types/game';
import { generateCharacterPortrait } from '../services/worldService';
import { uploadImageToDrive } from '../lib/drive';

interface UsePortraitRegenerationDeps {
  state: GameState;
  accessToken: string | null;
  updateState: (patch: Partial<GameState>) => void;
}

export function usePortraitRegeneration({ state, accessToken, updateState }: UsePortraitRegenerationDeps) {
  const regenerateCompanionPortrait = useCallback(async () => {
    const appearance = [state.companionProfile.bodyPrompt, state.companionProfile.outfitPrompt].filter(Boolean).join('; ');
    if (!appearance || !accessToken) return;
    const base64 = await generateCharacterPortrait(appearance, state.worldview, state.artStylePrompt);
    if (base64 && accessToken) {
      const fileName = `ai_rpg_portrait_${Date.now()}.png`;
      await uploadImageToDrive(accessToken, base64, fileName);
      updateState({ characterPortraitFileName: fileName });
    }
  }, [state.companionProfile.bodyPrompt, state.companionProfile.outfitPrompt, state.worldview, state.artStylePrompt, accessToken, updateState]);

  const regeneratePlayerPortrait = useCallback(async () => {
    const appearance = [state.playerProfile.bodyPrompt, state.playerProfile.outfitPrompt].filter(Boolean).join('; ');
    if (!appearance || !accessToken) return;
    const base64 = await generateCharacterPortrait(appearance, state.worldview, state.artStylePrompt);
    if (base64 && accessToken) {
      const fileName = `ai_rpg_player_portrait_${Date.now()}.png`;
      await uploadImageToDrive(accessToken, base64, fileName);
      updateState({ playerPortraitFileName: fileName });
    }
  }, [state.playerProfile.bodyPrompt, state.playerProfile.outfitPrompt, state.worldview, state.artStylePrompt, accessToken, updateState]);

  return { regenerateCompanionPortrait, regeneratePlayerPortrait };
}
