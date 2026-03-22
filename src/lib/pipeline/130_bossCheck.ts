/**
 * Step ⑥½ BOSS 检测
 *
 * 职责：
 * - 检测当前位置是否存在持久 BOSS
 * - 首次进入 BOSS 区域 → 强制拉高紧张度 + emit boss_encounter
 * - 后续回合完全尊重 TENSION_ROUTE 配置表的 tensionDelta 结果：
 *   - tensionDelta 将紧张度降至 boss 等级以下 → BOSS 击败
 *   - 否则 → 不覆写，维持配置表结果
 * - BOSS 击败 → 清除标记、位置变为 safe、T→0、emit boss_defeated
 */

import type { PipelineContext } from './types';
import { findNode, findHouse } from './helpers';

export function stepBossCheck(ctx: PipelineContext): void {
  const { state, intent } = ctx;

  if (ctx.newTransitState || state.transitState) return;

  const node = findNode(state, ctx.newNodeId);
  if (!node) return;

  let boss: { tensionLevel: 2 | 3 | 4 } | null = null;
  let bossLocationKey: string | null = null;

  if (ctx.newHouseId) {
    const house = findHouse(node, ctx.newHouseId);
    if (house?.activeBoss) {
      boss = house.activeBoss;
      bossLocationKey = `house_${house.id}`;
    }
  } else if (node.activeBoss) {
    boss = node.activeBoss;
    bossLocationKey = `node_${node.id}`;
  }

  if (!boss || !bossLocationKey) {
    ctx.inBossZone = false;
    return;
  }

  ctx.inBossZone = true;

  const locationName = ctx.newHouseId
    ? (findHouse(node, ctx.newHouseId)?.name || ctx.newHouseId)
    : node.name;

  // ── 首次进入判定 ──
  const wasHere = ctx.newHouseId
    ? state.currentHouseId === ctx.newHouseId
    : state.currentNodeId === ctx.newNodeId && !state.currentHouseId;

  // ── BOSS 击败：tensionDelta 将紧张度降至 boss 等级以下 ──
  if (intent.intent === 'combat' && ctx.newTensionLevel < boss.tensionLevel) {
    ctx.bossDefeatedKey = bossLocationKey;
    ctx.inBossZone = false;
    ctx.guaranteedDrop = 'boss';

    if (ctx.newHouseId) {
      ctx.houseSafetyUpdate = { houseId: ctx.newHouseId, newSafetyLevel: 'safe' };
    }

    ctx.newTensionLevel = 0;
    ctx.isInSafeZone = true;
    ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
    ctx.events.push({ type: 'boss_defeated', locationName });
    return;
  }

  // ── 首次进入 BOSS 区域 → 强制拉高紧张度 ──
  if (!wasHere) {
    if (ctx.newTensionLevel < boss.tensionLevel) {
      ctx.newTensionLevel = boss.tensionLevel;
    }
    ctx.events.push({ type: 'boss_encounter', locationName, tensionLevel: boss.tensionLevel });
  }

  // ── 后续回合：不覆写 tensionDelta 结果，完全尊重配置表 ──
  ctx.isInSafeZone = false;
  ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
}
