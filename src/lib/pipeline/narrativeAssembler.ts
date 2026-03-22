/**
 * 叙事拼装器 (Narrative Assembler)
 *
 * 管线之后、LLM 调用之前的统一叙事指令生成入口。
 * 根据 snap_pre / snap_post 差异 + events + intent 拼装最终的 narrativeInstruction。
 *
 * 设计原则：
 *   1. 管线只做数值运算，不产生叙事文本
 *   2. 叙事拼装集中在此，便于维护和调试
 *   3. 优先使用 events 中的结构化数据而非 snap 差异猜测原因
 */

import type { PipelineResult, GameEvent, MoveTarget, RollTier } from './types';
import type { IntentResult, GameState } from '../../types/game';
import { findNode } from './helpers';
import {
  buildT0Narrative, buildT1ExploreNarrative, buildT1CombatNarrative,
  buildT2Narrative, buildT3MoveNarrative, buildT3CombatNarrative,
  buildT4Narrative, buildTransitNarrative, buildArrivalNarrative,
  buildSafeExploreNarrative, buildSafeIdleNarrative, buildProgressCapNarrative,
  buildDeathReviveNarrative, buildGameOverNarrative,
} from './narratives';

// ─── 工具函数 ───

function findEvent<T extends GameEvent['type']>(events: GameEvent[], type: T): Extract<GameEvent, { type: T }> | undefined {
  return events.find(e => e.type === type) as Extract<GameEvent, { type: T }> | undefined;
}

function hasEvent(events: GameEvent[], type: GameEvent['type']): boolean {
  return events.some(e => e.type === type);
}

// ─── 主函数 ───

export interface NarrativeAssemblerInput {
  result: PipelineResult;
  intent: IntentResult;
  state: GameState;
  /** move 目标解析结果（pipeline 内部产出，通过 ctx 传出不方便，暂存于此） */
  moveTarget: MoveTarget | null;
}

/**
 * 根据管线结果拼装叙事指令
 * 返回发给 LLM 的 narrativeInstruction 字符串
 */
export function assembleNarrative(input: NarrativeAssemblerInput): string {
  const { result, intent, state } = input;
  const { events, snapPre } = result;
  const tension = snapPre.tensionLevel;
  const roll = result.roll;
  const tier = determineTier(result);

  let narrative = '';

  // ── 优先级 1：死亡/游戏结束（挡住后续所有） ──
  if (hasEvent(events, 'game_over')) {
    return buildGameOverNarrative();
  }

  const deathEvt = findEvent(events, 'death_revive');
  if (deathEvt) {
    narrative = buildDeathReviveNarrative(deathEvt.livesRemaining)
      + `开始向【${deathEvt.evacTarget}】方向撤离…`;
  }

  // ── 优先级 2：BOSS 击败 ──
  const bossDefeated = findEvent(events, 'boss_defeated');
  if (bossDefeated) {
    return prependDeath(narrative, `【系统强制 - BOSS 击败】：${bossDefeated.locationName} 的首领被彻底击败！该区域威胁已被肃清，变为安全地带。主角可以安心休整。`);
  }

  // ── 优先级 3：BOSS 遭遇（首次进入 BOSS 区域） ──
  const bossEncounter = findEvent(events, 'boss_encounter');
  if (bossEncounter) {
    return prependDeath(narrative, `【系统强制 - BOSS 遭遇】：踏入 ${bossEncounter.locationName} 的瞬间，潜伏的首领现身！紧张度强制升至 ${bossEncounter.tensionLevel} 级，必须战斗或设法逃离！`);
  }

  // ── 优先级 4：里程碑 ──
  const milestoneSafe = findEvent(events, 'milestone_safe');
  if (milestoneSafe) {
    return prependDeath(narrative, `【系统强制 - 里程碑】：${milestoneSafe.locationName} 已被彻底搜索，确认安全无威胁。主角可安心休整。`);
  }
  const milestoneBoss = findEvent(events, 'milestone_boss_spawn');
  if (milestoneBoss) {
    return prependDeath(narrative, `【系统强制 - 里程碑 BOSS】：探索度满！${milestoneBoss.locationName} 深处蛰伏的首领被惊动，紧张度强制升至 ${milestoneBoss.bossTension} 级！必须击败首领才能将此处变为安全屋。逃离后首领不会消失，下次进入将再次遭遇。`);
  }

  // ── 优先级 5：退敌道具 ──
  const escapeEvt = findEvent(events, 'escape_item_used');
  if (escapeEvt) {
    const itemName = escapeEvt.item.name;
    if (escapeEvt.tier === 2) {
      return prependDeath(narrative, `【系统强制 - 退敌道具（大成功）】：玩家使用了【${itemName}】发出致命一击！道具爆发出惊人的威力，将敌人击退/重创，危机彻底解除！道具已消耗。请描写道具爆发威力、一击退敌的磅礴场面，危机解除后的如释重负。`);
    }
    if (escapeEvt.tier === 0) {
      return prependDeath(narrative, `【系统强制 - 退敌道具（大失败免伤）】：玩家使用了【${itemName}】！本来要遭受致命打击，但道具在关键时刻发挥了作用，勉强挡下了攻击！道具已消耗殆尽。请描写千钧一发之际道具救命的惊险过程。`);
    }
    return prependDeath(narrative, `【系统强制 - 退敌道具】：玩家使用了【${itemName}】对抗威胁！道具发挥了效果，成功抵挡了一轮攻势。道具已消耗。请描写使用道具退敌的过程。`);
  }

  // ── 优先级 6：进度熔断 ──
  if (hasEvent(events, 'progress_capped')) {
    return prependDeath(narrative, buildProgressCapNarrative());
  }

  // ── 优先级 7：常规叙事（基于 tension + action + tier） ──
  const mainNarrative = buildMainNarrative(result, intent, state, input.moveTarget, tier, roll, tension);

  // ── 附加：武器加成描述 ──
  let weaponSuffix = '';
  if (result.weaponName && result.weaponRollBonus > 0 && tension >= 2) {
    weaponSuffix = `\n（武器【${result.weaponName}】在战斗中发挥了作用，为检定提供了+${result.weaponRollBonus}点加成。请在叙事中自然地描写武器的战斗表现。）`;
  }

  // ── 附加：防具减伤描述 ──
  let armorSuffix = '';
  const hpEvt = findEvent(events, 'hp_change');
  if (hpEvt && hpEvt.armorReduction > 0 && hpEvt.armorName && hpEvt.rawDelta < 0) {
    armorSuffix = `\n（防具【${hpEvt.armorName}】发挥了作用，减伤${hpEvt.armorReduction}%，实际受到的伤害比预期更低。请在叙事中描写减伤的细节。）`;
  }

  return prependDeath(narrative, mainNarrative + weaponSuffix + armorSuffix);
}

// ─── 死亡前缀 ──
function prependDeath(deathNarrative: string, mainNarrative: string): string {
  if (!deathNarrative) return mainNarrative;
  return deathNarrative + '\n' + mainNarrative;
}

// ─── 从 result 推断 tier ──
function determineTier(result: PipelineResult): RollTier {
  // 从 formulaBreakdown 中提取 tier 信息
  const match = result.formulaBreakdown.match(/→ T(\d)/);
  if (match) return parseInt(match[1]) as RollTier;
  return 1;
}

// ─── 常规叙事构建 ──
function buildMainNarrative(
  result: PipelineResult,
  intent: IntentResult,
  state: GameState,
  moveTarget: MoveTarget | null,
  tier: RollTier,
  roll: number,
  tension: number,
): string {
  const action = intent.intent;

  // ── 赶路场景 ──
  if (state.transitState) {
    if (!result.newTransitState) {
      // 抵达目的地（transit 存在 → newTransitState=null 即为到达）
      const destId = result.newNodeId ?? state.transitState.toNodeId;
      const toNode = findNode(state, destId);
      const toName = toNode?.name || destId || '未知地点';
      return buildArrivalNarrative(toName, roll);
    }
    // 赶路中
    const transit = state.transitState;
    const fromNode = findNode(state, transit.fromNodeId);
    const toNode = findNode(state, transit.toNodeId);
    const pathProgress = result.newTransitState.pathProgress;
    return buildTransitNarrative(
      tier, roll, pathProgress,
      fromNode?.name || transit.fromNodeId,
      toNode?.name || transit.toNodeId,
      tension, result.newHp
    );
  }

  // ── 安全区（非 move） ──
  if (result.snapPost.tensionLevel === 0 && action !== 'move' && !hasMovedLocation(state, result)) {
    // 判断是否在安全区
    if (action === 'explore') {
      const activeProgressKey = result.newHouseId
        ? `house_${result.newHouseId}`
        : `node_${result.newNodeId}`;
      const progress = result.newProgressMap[activeProgressKey] || 0;
      const progressGain = tier === 2 ? 40 : 15;
      return buildSafeExploreNarrative(roll, progressGain, progress, tier);
    }
    return buildSafeIdleNarrative();
  }

  // ── T0 ──
  if (tension === 0) {
    return buildT0Narrative(action, tier, roll, result.newHp);
  }

  // ── move ──
  if (action === 'move') {
    return buildMoveNarrative(moveTarget, tier, roll, result.newHp, tension, state);
  }

  // ── T1 ──
  if (tension === 1) {
    if (action === 'explore') {
      const activeProgressKey = result.newHouseId
        ? `house_${result.newHouseId}`
        : `node_${result.newNodeId}`;
      const progress = result.newProgressMap[activeProgressKey] || 0;
      return buildT1ExploreNarrative(tier, roll, progress);
    }
    return buildT1CombatNarrative(tier, roll);
  }

  // ── T2 ──
  if (tension === 2) {
    return buildT2Narrative(action, tier, roll, result.newHp);
  }

  // ── T3 ──
  if (tension === 3) {
    if (action === 'idle' || action === 'suicidal_idle') {
      return `【系统大失败 - 找死】：面对精英威胁居然发呆！惨遭重击，HP -25，被逼入绝境，紧张度升至 4 级（死斗）。请描写极度惨烈的受击场面。`;
    }
    return buildT3CombatNarrative(tier, roll);
  }

  // ── T4 ──
  if (tension === 4) {
    return buildT4Narrative(action, tier, roll, result.newHp);
  }

  return '';
}

// ─── move 叙事构建 ──
function buildMoveNarrative(
  moveTarget: MoveTarget | null,
  tier: RollTier,
  roll: number,
  hpAfter: number,
  tension: number,
  state: GameState,
): string {
  const mt = moveTarget;
  const currentNode = findNode(state, state.currentNodeId);
  const currentHouse = currentNode?.houses.find(h => h.id === state.currentHouseId) || null;

  if (tension <= 1) {
    if (mt?.type === 'cross-node') {
      if (mt.fromBuilding) {
        return `【系统指令】：玩家走出当前建筑，准备前往【${mt.targetName}】。请描写走出建筑来到街区的场景。`;
      }
      if (state.pacingState.tensionLevel === 0) {
        return `【系统强制】：玩家选择离开安全区，踏入外部世界${mt.targetName}。当前紧张度强制升至1级（探索态）。请描写出发踏上旅途的场景。`;
      }
      return `【系统指令】：玩家踏上旅途，正在赶往新区域${mt.targetName}。请描写动身离开与旅途初段的见闻。`;
    }
    if (mt?.type === 'enter-house') {
      return `【系统指令】：玩家进入${mt.house.name}。请描写进入该建筑的场景。`;
    }
    if (mt?.type === 'exit-to-house') {
      return `【系统指令】：玩家从${currentNode?.name || '街区'}回到${mt.house.name}。请描写走出建筑的场景。`;
    }
    if (mt?.type === 'exit-building') {
      return `【系统指令】：玩家退出当前建筑${currentHouse ? ` ${currentHouse.name}` : ''}，回到街区野外。请描写走出建筑的场景。`;
    }
    if (mt?.type === 'unreachable') {
      return `【系统指令】：目标位置未揭盲或不可达。请描写找不到出路的场景。`;
    }
    return `【系统指令】：玩家想移动但未指定明确方向。请询问玩家要去哪里。`;
  }

  if (tension === 2) {
    if (mt?.type === 'cross-node') {
      if (mt.fromBuilding) {
        return `【系统强制 - 战术撤退】：玩家冲出当前建筑，准备朝【${mt.targetName}】方向撤离！Roll=${roll}，请描写冲出建筑的过程。`;
      }
      return `【系统强制 - 战术撤退】：玩家朝【${mt.targetName}】方向有序撤出！紧张度降回 1 级。Roll=${roll}，请描写安全撤离危机区域并踏上旅途的过程。`;
    }
    if (mt?.type === 'enter-house') {
      return `【系统强制 - 战术撤退】：玩家冲入【${mt.house.name}】躲避！紧张度降回 1 级。Roll=${roll}，请描写逃入建筑的过程。`;
    }
    if (mt?.type === 'exit-to-house' || mt?.type === 'exit-building') {
      return `【系统强制 - 战术撤退】：玩家冲出建筑逃到街区！紧张度降回 1 级。Roll=${roll}，请描写逃出建筑的过程。`;
    }
    return buildT2Narrative('move', tier, roll, hpAfter);
  }

  if (tension === 3) {
    if (state.currentHouseId) {
      if (tier === 0) {
        return `【系统指令 - 逃跑受阻】：试图冲出建筑，却被堵在了门口！遭受重击，HP降至${hpAfter}。被逼退回建筑内部，维持 3 级紧张度。`;
      }
      return `【系统指令 - 破门而出】：玩家拼命冲出了建筑来到街区！Roll=${roll}，请描写慌不择路冲出建筑的惊险场面。`;
    }
    const canMove = mt?.type === 'cross-node' || mt?.type === 'enter-house' || mt?.type === 'exit-to-house';
    if (!canMove) {
      return `【系统指令 - 慌不择路】：试图逃跑，却在恐慌中冲向了死胡同或无法到达的区域！遭到敌人背后猛击，HP-20（当前${hpAfter}）。被逼回原地，维持 3 级紧张度。`;
    }
    const targetName = mt?.type === 'cross-node' ? mt.targetName
      : (mt?.type === 'enter-house' || mt?.type === 'exit-to-house') ? mt.house.name
      : '安全地带';
    return buildT3MoveNarrative(tier, roll, hpAfter, targetName);
  }

  if (tension === 4) {
    return buildT4Narrative('move', tier, roll, hpAfter);
  }

  return '';
}

// ─── 工具：是否移动了位置 ──
function hasMovedLocation(state: GameState, result: PipelineResult): boolean {
  return result.newNodeId !== state.currentNodeId || result.newHouseId !== state.currentHouseId;
}
