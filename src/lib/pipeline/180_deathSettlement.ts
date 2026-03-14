/**
 * Step ⑨ 死亡结算
 *
 * 职责：
 * - HP≤0 + lives>0 → 消耗一条命，HP=20，T→1，随机撤离到可达位置
 * - HP≤0 + lives===0 → gameOver
 * - 死亡撤离：收集可达位置（相邻 node + 当前 node 已知 house），
 *   按安全度排序选最安全的一批随机挑一个；house 直接进入，node 触发 transit
 * - 有 BOSS 的位置不排除，但安全分最低（防止卡关）
 */

import type { PipelineContext } from './types';
import type { SafetyLevel } from '../../types/game';
import { findNode, getVisibleHouses } from './helpers';
import { buildDeathReviveNarrative, buildGameOverNarrative } from './narratives';

// ── 撤离候选 ──

type EvacCandidate = {
  type: 'node' | 'house';
  id: string;
  name: string;
  safetyScore: number;
};

const SAFETY_SCORE: Record<SafetyLevel, number> = {
  safe: 0, low: 1, medium: 2, high: 3, deadly: 4,
};
const BOSS_PENALTY = 10;

function scoreSafety(safety: SafetyLevel, hasBoss: boolean): number {
  return SAFETY_SCORE[safety] + (hasBoss ? BOSS_PENALTY : 0);
}

/**
 * 收集所有可达撤离位置：相邻 node + 当前 node 的已揭盲 house（排除当前所在 house）
 */
function collectEvacCandidates(ctx: PipelineContext): EvacCandidate[] {
  const { state } = ctx;
  const candidates: EvacCandidate[] = [];
  const currentNode = findNode(state, state.currentNodeId);
  if (!currentNode || !state.worldData) return candidates;

  // 相邻 node
  for (const connId of currentNode.connections) {
    const neighbor = state.worldData.nodes.find(n => n.id === connId);
    if (neighbor) {
      candidates.push({
        type: 'node',
        id: neighbor.id,
        name: neighbor.name,
        safetyScore: scoreSafety(neighbor.safetyLevel, !!neighbor.activeBoss),
      });
    }
  }

  // 当前 node 的已揭盲 house（排除当前所在 house）
  for (const house of getVisibleHouses(currentNode)) {
    if (house.id === state.currentHouseId) continue;
    candidates.push({
      type: 'house',
      id: house.id,
      name: house.name,
      safetyScore: scoreSafety(house.safetyLevel, !!house.activeBoss),
    });
  }

  return candidates;
}

/**
 * 从候选列表中选出撤离目标：
 * 按 safetyScore 升序排序 → 取最安全的一批 → 打乱 → 选第一个
 */
function pickEvacTarget(candidates: EvacCandidate[]): EvacCandidate | null {
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => a.safetyScore - b.safetyScore);
  const minScore = candidates[0].safetyScore;
  const safest = candidates.filter(c => c.safetyScore === minScore);

  // Fisher-Yates 洗牌
  for (let i = safest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [safest[i], safest[j]] = [safest[j], safest[i]];
  }

  return safest[0];
}

export function stepDeathSettlement(ctx: PipelineContext): void {
  if (ctx.newHp > 0) return;

  if (ctx.state.lives > 0) {
    // ── 消耗复活币，锁血复活 ──
    ctx.newLives = ctx.state.lives - 1;
    ctx.newHp = 20;
    ctx.newTensionLevel = 1;
    ctx.deathEvacuated = true;

    const currentNodeId = ctx.newNodeId || ctx.state.currentNodeId;

    // ── 赶路中死亡：撤回出发点 ──
    if (ctx.state.transitState) {
      const fromId = ctx.state.transitState.fromNodeId;
      ctx.newTransitState = {
        fromNodeId: currentNodeId!,
        toNodeId: fromId,
        pathProgress: 50,
        lockedTheme: null,
      };
      ctx.newHouseId = null;
      ctx.newNodeId = currentNodeId;
      ctx.tensionChanged = ctx.newTensionLevel !== ctx.state.pacingState.tensionLevel;

      const evacNode = findNode(ctx.state, fromId);
      ctx.narrativeInstruction = buildDeathReviveNarrative(ctx.newLives)
        + `开始向【${evacNode?.name || '出发点'}】方向撤离…`
        + ctx.narrativeInstruction;
      return;
    }

    // ── 在节点/建筑中死亡：随机撤离到可达位置 ──
    const candidates = collectEvacCandidates(ctx);
    const target = pickEvacTarget(candidates);

    if (target) {
      if (target.type === 'house') {
        // 撤进建筑
        ctx.newHouseId = target.id;
        ctx.newNodeId = currentNodeId;
        ctx.newTransitState = null;
        ctx.tensionChanged = ctx.newTensionLevel !== ctx.state.pacingState.tensionLevel;
        ctx.narrativeInstruction = buildDeathReviveNarrative(ctx.newLives)
          + `慌忙逃进了【${target.name}】。`
          + ctx.narrativeInstruction;
      } else {
        // 撤往相邻节点：触发 transit
        ctx.newTransitState = {
          fromNodeId: currentNodeId!,
          toNodeId: target.id,
          pathProgress: 50,
          lockedTheme: null,
        };
        ctx.newHouseId = null;
        ctx.newNodeId = currentNodeId;
        ctx.tensionChanged = ctx.newTensionLevel !== ctx.state.pacingState.tensionLevel;
        ctx.narrativeInstruction = buildDeathReviveNarrative(ctx.newLives)
          + `开始向【${target.name}】方向撤离…`
          + ctx.narrativeInstruction;
      }
    } else {
      // 无可达位置：留在当前节点户外
      ctx.newHouseId = null;
      ctx.newTransitState = null;
      ctx.tensionChanged = ctx.newTensionLevel !== ctx.state.pacingState.tensionLevel;
      ctx.narrativeInstruction = buildDeathReviveNarrative(ctx.newLives)
        + '退到了户外。'
        + ctx.narrativeInstruction;
    }
  } else {
    // ── 彻底死亡 ──
    ctx.newIsGameOver = true;
    ctx.newHp = 0;
    ctx.narrativeInstruction = buildGameOverNarrative();
  }
}
