/**
 * 图片生成：根据 image_characters 动态注入角色外貌 + generateImage + uploadToDrive
 */

import { generateImage, IMAGE_PROHIBITED_SENTINEL } from '../../services/aiService';
import { uploadImageToDrive } from '../../lib/drive';
import type { GameState } from '../../types/game';

export interface ImageGenDeps {
  imagePrompt: string | undefined;
  /** LLM 输出的 image_characters: { "角色名": true } */
  imageCharacters?: Record<string, boolean>;
  isAuthenticated: boolean;
  accessToken: string | null;
  state: GameState;
  /** 用于写回图片错误的 mutable 对象 */
  debugState: { lastImageError?: string };
}

export function launchImageGen(deps: ImageGenDeps): Promise<string | undefined> {
  const { imagePrompt, imageCharacters, isAuthenticated, accessToken, state, debugState } = deps;

  if (!imagePrompt || !isAuthenticated || !accessToken) {
    return Promise.resolve(undefined);
  }

  // 根据 image_characters 动态注入在场角色的外貌锁定
  const chars = imageCharacters && typeof imageCharacters === 'object' ? imageCharacters : {};
  const appearanceParts: string[] = [];

  const companionName = state.companionProfile.name;
  const companionBody = state.companionProfile.bodyPrompt;
  const companionOutfit = state.companionProfile.outfitPrompt;
  if (companionName && chars[companionName] && companionBody) {
    const parts = [`[${companionName}] body: ${companionBody}`];
    if (companionOutfit) parts.push(`[${companionName}] outfit: ${companionOutfit}`);
    appearanceParts.push(...parts);
  }

  const playerName = state.playerProfile.name;
  const playerBody = state.playerProfile.bodyPrompt;
  const playerOutfit = state.playerProfile.outfitPrompt;
  if (playerName && chars[playerName] && playerBody) {
    const parts = [`[${playerName}] body: ${playerBody}`];
    if (playerOutfit) parts.push(`[${playerName}] outfit: ${playerOutfit}`);
    appearanceParts.push(...parts);
  }

  const appearanceBlock = appearanceParts.length > 0
    ? `\n\nCHARACTER APPEARANCE LOCK:\n${appearanceParts.join('\n')}`
    : '';

  const artStyle = state.artStylePrompt || 'cinematic realistic';
  const finalPrompt = `${imagePrompt}${appearanceBlock}\n\nArt style: ${artStyle}`;

  return (async () => {
    try {
      const base64Data = await generateImage(finalPrompt);
      if (base64Data === IMAGE_PROHIBITED_SENTINEL) {
        debugState.lastImageError = 'PROHIBITED_CONTENT';
        return IMAGE_PROHIBITED_SENTINEL;
      }
      if (base64Data) {
        const fileName = `ai_rpg_${Date.now()}.png`;
        await uploadImageToDrive(accessToken, base64Data, fileName);
        return fileName;
      }
    } catch (e) {
      console.error("Image generation/upload failed", e);
      debugState.lastImageError = e instanceof Error ? e.message : String(e);
    }
    return undefined;
  })();
}
