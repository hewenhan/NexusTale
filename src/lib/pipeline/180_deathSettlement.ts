/**
 * Step ⑨ 死亡结算
 *
 * 职责：
 * - HP≤0 + lives>0 → 消耗一条命，HP=20，T→1，随机撤离到可达位置
 * - HP≤0 + lives===0 → gameOver
 * - 死亡撤离：收集可达位置，按安全度排序选最安全的一批随机挑一个
 *
 * 纯计算 + 事件发射，不生成叙事。
 */

import type { PipelineContext } from './types';
import type { SafetyLevel } from '../../types/game';
import { findNode, getVisibleHouses } from './helpers';
import { GAME_CONFIG } from '../gameConfig';

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

function collectEvacCandidates(ctx: PipelineContext): EvacCandidate[] {
  const { state } = ctx;
  const candidates: EvacCandidate[] = [];
  const currentNode = findNode(state, state.currentNodeId);
  if (!currentNode || !state.worldData) return candidates;

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

function pickEvacTarget(candidates: EvacCandidate[]): EvacCandidate | null {
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.safetyScore - b.safetyScore);
  const minScore = candidates[0].safetyScore;
  const safest = candidates.filter(c => c.safetyScore === minScore);

  for (let i = safest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [safest[i], safest[j]] = [safest[j], safest[i]];
  }

  return safest[0];
}

export function stepDeathSettlement(ctx: PipelineContext): void {
  if (ctx.newHp > 0) return;

  if (ctx.state.lives > 0) {
    ctx.newLives = ctx.state.lives - 1;
    ctx.newHp = GAME_CONFIG.hp.revivalHp;
    ctx.newTensionLevel = GAME_CONFIG.tension.revivalLevel;

    const currentNodeId = ctx.newNodeId || ctx.state.currentNodeId;

    if (ctx.state.transitState) {
      const fromNode = findNode(ctx.state, ctx.state.transitState.fromNodeId);
      const transitCandidates: EvacCandidate[] = [];
      if (fromNode && ctx.state.worldData) {
        for (const connId of fromNode.connections) {
          const neighbor = ctx.state.worldData.nodes.find(n => n.id === connId);
          if (neighbor) {
            transitCandidates.push({
              type: 'node',
              id: neighbor.id,
              name: neighbor.name,
              safetyScore: scoreSafety(neighbor.safetyLevel, !!neighbor.activeBoss),
            });
          }
        }
      }
      const transitTarget = pickEvacTarget(transitCandidates);
      const evacId = transitTarget?.id || ctx.state.transitState.fromNodeId;
      const evacName = transitTarget?.name || fromNode?.name || '附近';
      ctx.newTransitState = {
        fromNodeId: ctx.state.transitState.fromNodeId,
        toNodeId: evacId,
        pathProgress: 50,
        lockedTheme: null,
      };
      ctx.newHouseId = null;
      ctx.newNodeId = ctx.state.transitState.fromNodeId;
      ctx.tensionChanged = ctx.newTensionLevel !== ctx.state.pacingState.tensionLevel;
      ctx.events.push({ type: 'death_revive', livesRemaining: ctx.newLives, evacTarget: evacName });
      return;
    }

    const candidates = collectEvacCandidates(ctx);
    const target = pickEvacTarget(candidates);

    if (target) {
      if (target.type === 'house') {
        ctx.newHouseId = target.id;
        ctx.newNodeId = currentNodeId;
        ctx.newTransitState = null;
      } else {
        ctx.newTransitState = {
          fromNodeId: currentNodeId!,
          toNodeId: target.id,
          pathProgress: 50,
          lockedTheme: null,
        };
        ctx.newHouseId = null;
        ctx.newNodeId = currentNodeId;
      }
      ctx.tensionChanged = ctx.newTensionLevel !== ctx.state.pacingState.tensionLevel;
      ctx.events.push({ type: 'death_revive', livesRemaining: ctx.newLives, evacTarget: target.name });
    } else {
      ctx.newHouseId = null;
      ctx.newTransitState = null;
      ctx.tensionChanged = ctx.newTensionLevel !== ctx.state.pacingState.tensionLevel;
      ctx.events.push({ type: 'death_revive', livesRemaining: ctx.newLives, evacTarget: '户外' });
    }
  } else {
    ctx.newIsGameOver = true;
    ctx.newHp = 0;
    ctx.events.push({ type: 'game_over' });
  }
}
