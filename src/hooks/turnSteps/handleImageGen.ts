/**
 * 图片生成：prompt 增强 + generateImage + uploadToDrive
 */

import { generateImage, IMAGE_PROHIBITED_SENTINEL } from '../../services/aiService';
import { uploadImageToDrive } from '../../lib/drive';
import type { GameState } from '../../types/game';

export interface ImageGenDeps {
  imagePrompt: string | undefined;
  isAuthenticated: boolean;
  accessToken: string | null;
  state: GameState;
  /** 用于写回图片错误的 mutable 对象 */
  debugState: { lastImageError?: string };
}

export function launchImageGen(deps: ImageGenDeps): Promise<string | undefined> {
  const { imagePrompt, isAuthenticated, accessToken, state, debugState } = deps;

  if (!imagePrompt || !isAuthenticated || !accessToken) {
    return Promise.resolve(undefined);
  }

  // 注入角色外貌提词
  const characterAppearance = state.companionProfile.appearancePrompt;
  const enrichedImagePrompt = characterAppearance
    ? `${imagePrompt}\n\nIMPORTANT - The companion character in this scene has the following fixed appearance: ${characterAppearance}`
    : imagePrompt;

  // 构建物理特征锁定字符串
  const cp = state.companionProfile;
  const physicalTraitsLock = [
    cp.skinColor && `Skin: ${cp.skinColor}`,
    cp.height && `Height: ${cp.height}`,
    cp.weight && `Build: ${cp.weight}`,
    cp.age && `Age: ${cp.age}`,
    cp.hairStyle && `Hair Style: ${cp.hairStyle}`,
    cp.hairColor && `Hair Color: ${cp.hairColor}`,
  ].filter(Boolean).join(', ') || undefined;

  return (async () => {
    try {
      const base64Data = await generateImage(enrichedImagePrompt, state.artStylePrompt || undefined, physicalTraitsLock);
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
