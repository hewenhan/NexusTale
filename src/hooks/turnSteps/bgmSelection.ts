/**
 * Step 7.1: BGM 选择
 *
 * 根据最终紧张度选择 BGM，或沿用上一轮 BGM。
 */

import type { GameState } from '../../types/game';
import { BGM_LIST } from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';

export function selectBgm(
  resolution: PipelineResult,
  state: GameState,
): string | undefined {
  let finalBgmKey: string | undefined;

  if (resolution.tensionChanged) {
    const candidates = BGM_LIST[resolution.newTensionLevel as keyof typeof BGM_LIST] || [];
    finalBgmKey = candidates.length > 0
      ? candidates[Math.floor(Math.random() * candidates.length)]
      : undefined;
  } else {
    for (let i = state.history.length - 1; i >= 0; i--) {
      if (state.history[i].bgmKey) {
        finalBgmKey = state.history[i].bgmKey;
        break;
      }
    }
  }

  // Fallback：历史为空时按当前紧张度选
  if (!finalBgmKey) {
    const fallback = BGM_LIST[resolution.newTensionLevel as keyof typeof BGM_LIST] || [];
    finalBgmKey = fallback.length > 0
      ? fallback[Math.floor(Math.random() * fallback.length)]
      : undefined;
  }

  return finalBgmKey;
}
