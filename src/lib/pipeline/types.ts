/**
 * 管线共享类型定义
 *
 * 设计原则：管线只做数值运算，不生成叙事文本。
 * 每个 step 通过 ctx.events.push() 记录"发生了什么"，
 * 叙事拼装由外部 narrativeAssembler 根据 events + snap 差异完成。
 */

import type { GameState, IntentResult, SafetyLevel, HouseData, ActiveBoss, InventoryItem } from '../../types/game';

// ─── D20 掷骰结果档位 ───
export type RollTier = 0 | 1 | 2; // 0=大失败, 1=普通, 2=大成功

// ─── 移动目标解析结果 ───
export type MoveTarget =
  | { type: 'cross-node'; targetNodeId: string; targetName: string; fromBuilding: boolean }
  | { type: 'enter-house'; house: HouseData }
  | { type: 'exit-to-house'; house: HouseData }
  | { type: 'exit-building' }
  | { type: 'unreachable' }
  | { type: 'no-target' };

// ─── 结构化事件：管线步骤产出的"发生了什么" ───
export type GameEvent =
  | { type: 'progress_capped' }
  | { type: 'safe_explore'; roll: number; progressGain: number; currentProgress: number }
  | { type: 'safe_idle' }
  | { type: 'transit_arrive'; toName: string; roll: number }
  | { type: 'transit_progress'; fromName: string; toName: string; progress: number; roll: number; tier: RollTier; tension: number; hpAfter: number }
  | { type: 'move_resolved'; moveTarget: MoveTarget; succeeded: boolean; tension: number; tier: RollTier; roll: number; hpAfter: number }
  | { type: 'explore_t1'; tier: RollTier; roll: number; progress: number }
  | { type: 'combat_t1'; tier: RollTier; roll: number }
  | { type: 't0_action'; action: string; tier: RollTier; roll: number; hpAfter: number }
  | { type: 't2_action'; action: string; tier: RollTier; roll: number; hpAfter: number }
  | { type: 't3_combat'; tier: RollTier; roll: number }
  | { type: 't3_idle'; hpAfter: number }
  | { type: 't4_action'; action: string; tier: RollTier; roll: number; hpAfter: number }
  | { type: 'escape_item_used'; item: InventoryItem; tier: RollTier }
  | { type: 'hp_change'; from: number; to: number; rawDelta: number; finalDelta: number; armorName: string | null; armorReduction: number }
  | { type: 'boss_encounter'; locationName: string; tensionLevel: number }
  | { type: 'boss_defeated'; locationName: string }
  | { type: 'milestone_safe'; locationName: string }
  | { type: 'milestone_boss_spawn'; locationName: string; bossTension: number }
  | { type: 'death_revive'; livesRemaining: number; evacTarget: string }
  | { type: 'game_over' }
  | { type: 'behavior_override'; description: string };

// ─── 快照：进入管线前 / 管线完成后的关键数据 ───
export interface PipelineSnapshot {
  hp: number;
  tensionLevel: 0 | 1 | 2 | 3 | 4;
  nodeId: string | null;
  houseId: string | null;
  inTransit: boolean;
  transitProgress: number;
  inventory: InventoryItem[];
  // 意图 & 判定信息
  intent: string;
  targetId: string | null;
  itemName?: string;
  tier?: RollTier;
  roll?: number;
  isSuccess?: boolean;
}

// ─── 管线上下文：所有 step 共享的可变状态 ───
export interface PipelineContext {
  /** 只读：当前游戏快照（不可变异） */
  readonly state: GameState;
  /** 只读：本轮意图判定结果 */
  readonly intent: IntentResult;

  /** 结构化事件流 */
  events: GameEvent[];

  // ── ① 进度计算结果 ──
  activeProgressKey: string;
  newProgressMap: Record<string, number>;
  newTransitState: GameState['transitState'];
  progressJustHit100: boolean;
  progressCapped: boolean;

  // ── ② D20 判定结果 ──
  rawRoll: number;
  effectiveRoll: number;
  tier: RollTier;
  affectionTriggered: 'aid' | 'sabotage' | null;
  formulaBreakdown: string;

  // ── ④ 位置解析 ──
  moveTarget: MoveTarget | null;
  moveSucceeded: boolean;
  newNodeId: string | null;
  newHouseId: string | null;

  // ── ⑤ 紧张度 ──
  newTensionLevel: 0 | 1 | 2 | 3 | 4;
  tensionChanged: boolean;

  // ── ⑥ 安全区覆写 ──
  isInSafeZone: boolean;

  // ── ⑦ 里程碑 / BOSS ──
  houseSafetyUpdate: { houseId: string; newSafetyLevel: SafetyLevel } | null;
  bossSpawn: { locationKey: string; boss: ActiveBoss } | null;
  bossDefeatedKey: string | null;
  inBossZone: boolean;
  guaranteedDrop: 'milestone' | 'boss' | null;

  // ── ⑧ HP 结算 ──
  newHp: number;
  armorReduction: number;

  // ── ⑧½ 退敌道具 ──
  escapeItemUsed: InventoryItem | null;

  // ── ⑨ 死亡结算 ──
  newLives: number;
  newIsGameOver: boolean;

  // ── ⑩ 输出 ──
  newInventory: InventoryItem[];
  isSuccess: boolean;
  weaponBuff: number;

  // ── 调试信息 ──
  debugFormula: string;
}

/**
 * 管线最终输出：useChatLogic 消费的结果
 *
 * 不再包含 narrativeInstruction / selectedBgmKey，
 * 叙事拼装和 BGM 选择由调用方根据 events + snapshots 完成。
 */
export interface PipelineResult {
  newHp: number;
  newLives: number;
  newTensionLevel: 0 | 1 | 2 | 3 | 4;
  newNodeId: string | null;
  newHouseId: string | null;
  newProgressMap: Record<string, number>;
  newInventory: InventoryItem[];
  newIsGameOver: boolean;
  newTransitState: GameState['transitState'];
  roll: number;
  isSuccess: boolean;
  houseSafetyUpdate: { houseId: string; newSafetyLevel: SafetyLevel } | null;
  bossSpawn: { locationKey: string; boss: ActiveBoss } | null;
  bossDefeatedKey: string | null;
  inBossZone: boolean;
  guaranteedDrop: 'milestone' | 'boss' | null;
  affectionTriggered: 'aid' | 'sabotage' | null;
  formulaBreakdown: string;
  tensionChanged: boolean;
  armorReduction: number;
  /** move 解析结果 */
  moveTarget: import('./types').MoveTarget | null;
  /** 管线产出的结构化事件流 */
  events: GameEvent[];
  /** 管线运行前快照 */
  snapPre: PipelineSnapshot;
  /** 管线运行后快照 */
  snapPost: PipelineSnapshot;
}
