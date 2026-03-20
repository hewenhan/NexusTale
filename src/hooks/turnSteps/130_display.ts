/**
 * Step 130: 图片生成 + 打字机显示编排
 */

import type { TurnContext } from './types';
import { launchImageGen } from './handleImageGen';
import { runDisplaySequence } from './displaySequencer';
import { getLastSceneVisuals } from './helpers';

export async function stepDisplay(ctx: TurnContext): Promise<void> {
  const {
    deps: {
      state, isAuthenticated, accessToken,
      addMessage, updateState, setIsProcessing, setPendingNotificationsRef,
      waitForTypewriter, typewriterReadyRef, typewriterResolveRef,
    },
    responseJson, messages, debugState, finalBgmKey, pendingNotifications,
  } = ctx;

  const { image_prompt, image_characters, scene_visuals_update } = responseJson;
  const lastVisuals = getLastSceneVisuals(state);

  // ── 图片生成（异步） ──
  const imagePromise = launchImageGen({
    imagePrompt: image_prompt,
    imageCharacters: image_characters,
    isAuthenticated, accessToken, state,
    debugState: debugState!,
  });

  // ── 打字机排队显示 ──
  await runDisplaySequence({
    messages, debugState: debugState!,
    sceneVisuals: scene_visuals_update,
    lastVisuals, selectedBgmKey: finalBgmKey,
    imagePromise, pendingNotifications,
    addMessage, updateState, setIsProcessing,
    setPendingNotificationsRef, waitForTypewriter,
    typewriterReadyRef, typewriterResolveRef,
  });
}
