/**
 * Step ⑦ 里程碑判定
 *
 * 职责：
 * - 检测探索度是否在本轮首次跨过 100%
 * - safe 区域：不触发 BOSS，直接变安全
 * - house 100% → 根据 safetyLevel 创建持久 BOSS（或直接标记 safe）
 * - node 100% → 根据 safetyLevel 创建持久 BOSS（或直接标记完成）
 * - BOSS 映射: safe→无, low→null, medium→T2, high→T3, deadly→T4
 *
 * 纯计算 + 事件发射，不生成叙事。
 */

import type { PipelineContext } from './types';
import { findNode, findHouse } from './helpers';
import { bossTensionFromSafety } from '../../types/game';

export function stepMilestone(ctx: PipelineContext): void {
  if (!ctx.progressJustHit100) return;
  if (ctx.newTransitState || ctx.state.transitState) return;

  const { state } = ctx;
  const node = findNode(state, ctx.newNodeId);

  if (state.currentHouseId) {
    const house = findHouse(node, state.currentHouseId);
    const safety = house?.safetyLevel || 'safe';
    const bossTension = bossTensionFromSafety(safety);
    const locationName = house?.name || state.currentHouseId;

    if (!bossTension) {
      ctx.newTensionLevel = 0;
      ctx.houseSafetyUpdate = { houseId: state.currentHouseId, newSafetyLevel: 'safe' };
      ctx.isInSafeZone = true;
      ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
      ctx.guaranteedDrop = 'milestone';
      ctx.events.push({ type: 'milestone_safe', locationName });
    } else {
      ctx.bossSpawn = {
        locationKey: `house_${state.currentHouseId}`,
        boss: { tensionLevel: bossTension },
      };
      ctx.newTensionLevel = bossTension;
      ctx.inBossZone = true;
      ctx.isInSafeZone = false;
      ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
      ctx.events.push({ type: 'milestone_boss_spawn', locationName, bossTension });
    }
  } else {
    const safety = node?.safetyLevel || 'safe';
    const bossTension = bossTensionFromSafety(safety);
    const locationName = node?.name || state.currentNodeId || '未知区域';

    if (!bossTension) {
      ctx.newTensionLevel = 0;
      ctx.isInSafeZone = true;
      ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
      ctx.guaranteedDrop = 'milestone';
      ctx.events.push({ type: 'milestone_safe', locationName });
    } else {
      ctx.bossSpawn = {
        locationKey: `node_${state.currentNodeId}`,
        boss: { tensionLevel: bossTension },
      };
      ctx.newTensionLevel = bossTension;
      ctx.inBossZone = true;
      ctx.isInSafeZone = false;
      ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
      ctx.events.push({ type: 'milestone_boss_spawn', locationName, bossTension });
    }
  }
}
