/**
 * Step ⑥½ BOSS 检测
 *
 * 职责：
 * - 检测当前位置（step ④ 确定后）是否存在持久 BOSS
 * - 存在 BOSS → 强制拉高紧张度到 BOSS 等级
 * - 检测 BOSS 是否在本回合被击败（combat 大成功导致紧张度骤降）
 * - BOSS 击败 → 清除标记、位置变为 safe、emit boss_defeated 事件
 * - 首次进入 BOSS 区域 → emit boss_encounter 事件
 *
 * 纯计算，不生成叙事文本。
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

  const wasCombat = intent.intent === 'combat';
  const wasCrit = ctx.tier === 2;
  const tensionDropped = ctx.newTensionLevel < boss.tensionLevel;

  if (wasCombat && wasCrit && tensionDropped) {
    // BOSS 击败
    ctx.bossDefeatedKey = bossLocationKey;
    ctx.inBossZone = false;
    ctx.guaranteedDrop = 'boss';

    if (ctx.newHouseId) {
      ctx.houseSafetyUpdate = { houseId: ctx.newHouseId, newSafetyLevel: 'safe' };
    }

    ctx.newTensionLevel = 0;
    ctx.isInSafeZone = true;
    ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;

    const locationName = ctx.newHouseId
      ? (findHouse(node, ctx.newHouseId)?.name || ctx.newHouseId)
      : node.name;
    ctx.events.push({ type: 'boss_defeated', locationName });
    return;
  }

  // BOSS 存活：强制拉高紧张度
  if (ctx.newTensionLevel < boss.tensionLevel) {
    ctx.newTensionLevel = boss.tensionLevel;
  }
  ctx.tensionChanged = ctx.newTensionLevel !== state.pacingState.tensionLevel;
  ctx.isInSafeZone = false;

  // 首次进入 BOSS 区域
  const wasHere = ctx.newHouseId
    ? state.currentHouseId === ctx.newHouseId
    : state.currentNodeId === ctx.newNodeId && !state.currentHouseId;

  if (!wasHere) {
    const locationName = ctx.newHouseId
      ? (findHouse(node, ctx.newHouseId)?.name || ctx.newHouseId)
      : node.name;
    ctx.events.push({ type: 'boss_encounter', locationName, tensionLevel: boss.tensionLevel });
  }
}
