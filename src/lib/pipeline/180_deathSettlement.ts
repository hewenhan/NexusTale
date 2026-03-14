/**
 * Step ⑨ 死亡结算
 *
 * 职责：
 * - HP≤0 + lives>0 → 消耗一条命，HP=20，T→1，进入 transit 撤离
 * - HP≤0 + lives===0 → gameOver
 * - 死亡撤离：通过 transit 前往最近的安全相邻节点（排除有 BOSS 的节点）
 * - 在同一节点（如建筑内死亡）时直接退到户外，不进入 transit
 * - 死亡后覆盖里程碑结果（不会复活在 boss 战里）
 */

import type { PipelineContext } from './types';
import { findNode } from './helpers';
import { buildDeathReviveNarrative, buildGameOverNarrative } from './narratives';

/**
 * 寻找最近的安全撤离节点（用于 transit）
 * 优先级：
 *   ① transit.fromNodeId（如果在赶路中）
 *   ② 相邻节点中无 BOSS 且 safetyLevel='safe' 的
 *   ③ 相邻节点中无 BOSS 的第一个
 *   ④ 兜底：null（留在原地退到户外）
 */
function findEvacuationNodeId(ctx: PipelineContext): string | null {
  const { state } = ctx;

  // 如果在赶路中，撤回出发点
  if (state.transitState) {
    return state.transitState.fromNodeId;
  }

  // 查找相邻节点（排除有 BOSS 的）
  const currentNode = findNode(state, state.currentNodeId);
  if (currentNode && state.worldData) {
    const neighbors = currentNode.connections
      .map(id => state.worldData!.nodes.find(n => n.id === id))
      .filter((n): n is NonNullable<typeof n> => !!n && !n.activeBoss);

    // 优先选安全节点
    const safeNeighbor = neighbors.find(n => n.safetyLevel === 'safe');
    if (safeNeighbor) return safeNeighbor.id;

    // 没有安全的，选第一个无 BOSS 的
    if (neighbors.length > 0) return neighbors[0].id;

    // 所有相邻都有 BOSS → 退回到任意相邻（不能留在 BOSS 区域死循环）
    if (currentNode.connections.length > 0) {
      return currentNode.connections[0];
    }
  }

  // 兜底：null（留在原节点户外）
  return null;
}

export function stepDeathSettlement(ctx: PipelineContext): void {
  if (ctx.newHp > 0) return;

  if (ctx.state.lives > 0) {
    // ── 消耗复活币，锁血复活 ──
    ctx.newLives = ctx.state.lives - 1;
    ctx.newHp = 20;
    ctx.newTensionLevel = 1;
    ctx.deathEvacuated = true;

    // ── 撤离 ──
    const currentNodeId = ctx.newNodeId || ctx.state.currentNodeId;
    const evacNodeId = findEvacuationNodeId(ctx);

    if (evacNodeId && evacNodeId !== currentNodeId) {
      // 跨节点撤离：进入 transit（已走一半，1-2 回合到达）
      ctx.newTransitState = {
        fromNodeId: currentNodeId!,
        toNodeId: evacNodeId,
        pathProgress: 50,
        lockedTheme: null,
      };
      ctx.newHouseId = null;
      // 留在当前节点（transit 中 nodeId 不变直到抵达）
      ctx.newNodeId = currentNodeId;
    } else {
      // 同节点撤离（建筑内死亡→退到户外）
      ctx.newHouseId = null;
      ctx.newTransitState = null;
    }

    ctx.tensionChanged = ctx.newTensionLevel !== ctx.state.pacingState.tensionLevel;

    // 叙事
    const evacNode = evacNodeId ? findNode(ctx.state, evacNodeId) : null;
    const evacName = evacNode?.name || '附近安全地带';
    const transitNote = evacNodeId && evacNodeId !== currentNodeId
      ? `开始向【${evacName}】方向撤离…`
      : '退到了户外。';
    ctx.narrativeInstruction = buildDeathReviveNarrative(ctx.newLives)
      + transitNote
      + ctx.narrativeInstruction;
  } else {
    // ── 彻底死亡 ──
    ctx.newIsGameOver = true;
    ctx.newHp = 0;
    ctx.narrativeInstruction = buildGameOverNarrative();
  }
}
