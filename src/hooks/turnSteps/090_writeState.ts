/**
 * Step 090: 状态写入
 *
 * 将管线 resolution 结果写入 GameState，处理 debug 直写、主题疲劳。
 */

import type { TurnContext } from './types';
import { buildStateUpdate, applyDebugDirectWrites } from './applyResolution';

export function stepWriteState(ctx: TurnContext): void {
  const { deps: { state, updateState }, directorResult, resolution } = ctx;

  const additionalRevealIds = directorResult.newObjective?.targetHouseId
    ? [directorResult.newObjective.targetHouseId]
    : undefined;

  updateState(buildStateUpdate(resolution!, additionalRevealIds));

  const debugOv = state.debugOverrides;
  if (debugOv) {
    applyDebugDirectWrites(debugOv, updateState);
  }

  // 旅途主题疲劳：transit 结束时将 lockedTheme 加入已用列表
  if (!resolution!.newTransitState && state.transitState?.lockedTheme) {
    updateState(prev => {
      const updated = [...prev.exhaustedThemes, state.transitState!.lockedTheme!];
      return { exhaustedThemes: updated.length > 20 ? updated.slice(-20) : updated };
    });
  }
}
