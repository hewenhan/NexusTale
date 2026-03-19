/**
 * 管线编排器 (Pipeline Orchestrator)
 *
 * 按照固定顺序依次执行管线步骤，输出最终结算结果 + 结构化事件。
 * 每个步骤只读取和写入 PipelineContext，不直接修改 GameState。
 * 叙事文本拼装由外部 narrativeAssembler 根据 events + snap 差异完成。
 *
 * 执行顺序：
 *   ① 探索/赶路进度计算    → 确定活跃进度键、熔断检查
 *   ② D20 判定 + 好感度修正 → tier / effectiveRoll
 *   ③ 行为覆写              → 区域已满时屏蔽大失败 / 退敌道具视为combat
 *   ④ 位置解析与应用         → move/transit 位置变化
 *   ⑤ 紧张度升降            → 查表 tensionDelta
 *   ⑥ 安全区覆写            → safe zone T→0 / 非safe T≥1
 *   ⑥½ BOSS 检测            → BOSS 存在时拉高紧张度
 *   ⑦ 里程碑判定            → house→safe / node→boss T4
 *   ⑧ HP 结算               → 查表 hpDelta / safe 回血 / 退敌道具
 *   ⑨ 死亡结算              → 复活撤离 / gameOver
 */

import type { GameState, IntentResult, InventoryItem } from '../../types/game';
import type { PipelineContext, PipelineResult, PipelineSnapshot } from './types';
import { extractProgressMap } from './helpers';

import { stepProgressCalc } from './020_progressCalc';
import { stepD20Roll } from './040_d20Roll';
import { stepBehaviorOverride } from './060_behaviorOverride';
import { stepMoveResolve } from './080_moveResolve';
import { stepTensionDelta } from './100_tensionDelta';
import { stepSafeZoneOverride } from './120_safeZoneOverride';
import { stepBossCheck } from './130_bossCheck';
import { stepMilestone } from './140_milestone';
import { stepHpSettlement } from './160_hpSettlement';
import { stepDeathSettlement } from './180_deathSettlement';

interface SnapshotSource {
  hp: number;
  tensionLevel: PipelineSnapshot['tensionLevel'];
  nodeId: string | null;
  houseId: string | null;
  inTransit: boolean;
  transitProgress: number;
  inventory: readonly InventoryItem[];
  intent: IntentResult['intent'];
  targetId: IntentResult['targetId'];
  itemId?: string;
  tier?: PipelineSnapshot['tier'];
  roll?: number;
  isSuccess?: boolean;
}

function buildSnapshot(src: SnapshotSource): PipelineSnapshot {
  return {
    hp: src.hp,
    tensionLevel: src.tensionLevel,
    nodeId: src.nodeId,
    houseId: src.houseId,
    inTransit: src.inTransit,
    transitProgress: src.transitProgress,
    inventory: src.inventory.map(i => ({ ...i })),
    intent: src.intent,
    targetId: src.targetId,
    itemId: src.itemId,
    tier: src.tier,
    roll: src.roll,
    isSuccess: src.isSuccess,
  };
}

function createContext(state: GameState, intent: IntentResult, d20Roll: number): PipelineContext {
  return {
    state,
    intent,
    events: [],
    activeProgressKey: '',
    newProgressMap: state.worldData ? extractProgressMap(state.worldData) : {},
    newTransitState: state.transitState,
    progressJustHit100: false,
    progressCapped: false,
    rawRoll: d20Roll,
    effectiveRoll: d20Roll,
    tier: 1,
    affectionTriggered: null,
    formulaBreakdown: '',
    moveTarget: null,
    moveSucceeded: false,
    newNodeId: state.currentNodeId,
    newHouseId: state.currentHouseId,
    newTensionLevel: state.pacingState.tensionLevel,
    tensionChanged: false,
    isInSafeZone: false,
    houseSafetyUpdate: null,
    bossSpawn: null,
    bossDefeatedKey: null,
    inBossZone: false,
    guaranteedDrop: null,
    newHp: state.hp,
    armorReduction: 0,
    escapeItemUsed: null,
    newLives: state.lives,
    newIsGameOver: false,
    newInventory: state.inventory.map(item => ({ ...item })),
    isSuccess: false,
    weaponBuff: 0,
    weaponName: null,
    weaponRollBonus: 0,
    debugFormula: '',
  };
}

function extractResult(ctx: PipelineContext, snapPre: PipelineSnapshot): PipelineResult {
  return {
    newHp: ctx.newHp,
    newLives: ctx.newLives,
    newTensionLevel: ctx.newTensionLevel,
    newNodeId: ctx.newNodeId,
    newHouseId: ctx.newHouseId,
    newProgressMap: ctx.newProgressMap,
    newInventory: ctx.newInventory,
    newIsGameOver: ctx.newIsGameOver,
    newTransitState: ctx.newTransitState,
    roll: ctx.rawRoll,
    isSuccess: ctx.isSuccess,
    progressCapped: ctx.progressCapped,
    houseSafetyUpdate: ctx.houseSafetyUpdate,
    bossSpawn: ctx.bossSpawn,
    bossDefeatedKey: ctx.bossDefeatedKey,
    inBossZone: ctx.inBossZone,
    guaranteedDrop: ctx.guaranteedDrop,
    affectionTriggered: ctx.affectionTriggered,
    formulaBreakdown: ctx.formulaBreakdown,
    tensionChanged: ctx.tensionChanged,
    armorReduction: ctx.armorReduction,
    weaponName: ctx.weaponName,
    weaponRollBonus: ctx.weaponRollBonus,
    moveTarget: ctx.moveTarget,
    events: ctx.events,
    snapPre,
    snapPost: buildSnapshot({
      hp: ctx.newHp,
      tensionLevel: ctx.newTensionLevel,
      nodeId: ctx.newNodeId,
      houseId: ctx.newHouseId,
      inTransit: !!ctx.newTransitState,
      transitProgress: ctx.newTransitState?.pathProgress ?? 0,
      inventory: ctx.newInventory,
      intent: ctx.intent.intent,
      targetId: ctx.intent.targetId,
      itemId: ctx.intent.itemId,
      tier: ctx.tier as PipelineSnapshot['tier'],
      roll: ctx.effectiveRoll,
      isSuccess: ctx.isSuccess,
    }),
  };
}

export function runPipeline(state: GameState, intent: IntentResult, d20Roll: number): PipelineResult {
  const snapPre = buildSnapshot({
    hp: state.hp,
    tensionLevel: state.pacingState.tensionLevel,
    nodeId: state.currentNodeId,
    houseId: state.currentHouseId,
    inTransit: !!state.transitState,
    transitProgress: state.transitState?.pathProgress ?? 0,
    inventory: state.inventory,
    intent: intent.intent,
    targetId: intent.targetId,
    itemId: intent.itemId,
  });
  const ctx = createContext(state, intent, d20Roll);

  // ── 纯计算管线，不含叙事 ──
  stepProgressCalc(ctx);
  stepD20Roll(ctx);
  stepBehaviorOverride(ctx);
  stepMoveResolve(ctx);
  stepTensionDelta(ctx);
  stepSafeZoneOverride(ctx);
  stepBossCheck(ctx);
  stepMilestone(ctx);
  stepHpSettlement(ctx);
  stepDeathSettlement(ctx);

  const result = extractResult(ctx, snapPre);

  console.log('[Pipeline] snap_pre:', snapPre);
  console.log('[Pipeline] snap_post:', result.snapPost);
  console.log('[Pipeline] events:', result.events.map(e => e.type));
  console.log('[Pipeline] 完成', {
    tier: ctx.tier,
    tension: `${snapPre.tensionLevel} → ${result.newTensionLevel}`,
    hp: `${snapPre.hp} → ${result.newHp}`,
    location: `${snapPre.nodeId}/${snapPre.houseId} → ${result.newNodeId}/${result.newHouseId}`,
    transit: result.newTransitState ? `${result.newTransitState.pathProgress}%` : 'null',
  });

  return result;
}
