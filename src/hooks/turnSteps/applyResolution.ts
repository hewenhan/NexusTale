/**
 * Step 2.5+: 管线结果 + Debug 覆写 → 统一写入 GameState
 */

import type { GameState, DebugOverrides } from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';
import { applyProgressAndReveals } from '../../lib/pipeline';
import type { DirectorResult } from './directorSystem';
import { narrativeRetreat, narrativeAffectionAid, narrativeAffectionSabotage, narrativeBuildingReveal } from '../../lib/narrativeRegistry';

/**
 * 消费 Debug 覆写，修改 resolution（mutate in place）
 */
export function applyDebugOverrides(resolution: PipelineResult, debugOv: DebugOverrides): void {
  if (debugOv.tensionLevel !== undefined) {
    resolution.tensionChanged = resolution.newTensionLevel !== debugOv.tensionLevel;
    resolution.newTensionLevel = debugOv.tensionLevel;
  }
  if (debugOv.hp !== undefined) resolution.newHp = Math.max(0, Math.min(100, debugOv.hp));
  if (debugOv.lives !== undefined) resolution.newLives = Math.max(0, debugOv.lives);
  if (debugOv.teleportNodeId) {
    resolution.newNodeId = debugOv.teleportNodeId;
    resolution.newHouseId = debugOv.teleportHouseId ?? null;
    resolution.newTransitState = null;
  }
  if (debugOv.progressOverride) {
    resolution.newProgressMap = {
      ...resolution.newProgressMap,
      [debugOv.progressOverride.key]: Math.max(0, Math.min(100, debugOv.progressOverride.value))
    };
  }
  if (debugOv.forceGameOver) {
    resolution.newIsGameOver = true;
    resolution.newHp = 0;
    resolution.newLives = 0;
  }
  console.log('[DEBUG] Overrides applied:', debugOv);
}

/**
 * 注入导演系统、掉头返程、好感度检定的叙事覆盖
 * 返回最终的 narrativeInstruction 字符串（不再 mutate resolution）
 */
export function applyNarrativeOverrides(
  narrativeInstruction: string,
  resolution: PipelineResult,
  state: GameState,
  directorResult: DirectorResult,
  isRetreatIntent: boolean,
): string {
  let result = narrativeInstruction;

  // 导演系统叙事覆盖
  if (directorResult.narrativeOverride) {
    result = directorResult.narrativeOverride;
  }

  // 掉头返程叙事注入
  if (isRetreatIntent && state.transitState) {
    const origFromNode = state.worldData?.nodes.find(n => n.id === state.transitState!.fromNodeId);
    const returnToName = origFromNode?.name || state.transitState.fromNodeId || '来时的方向';
    result = narrativeRetreat({ returnToName, currentProgress: resolution.newTransitState?.pathProgress ?? 0 }) + '\n' + result;
  }

  // 好感度检定叙事注入
  if (resolution.affectionTriggered === 'aid') {
    result += narrativeAffectionAid({ affection: state.affection, specialties: state.companionProfile.specialties });
  } else if (resolution.affectionTriggered === 'sabotage') {
    result += narrativeAffectionSabotage(state.affection);
  }

  // 建筑揭盲事实拼接
  if (state.worldData && !resolution.newTransitState) {
    const updatedWorldData = applyProgressAndReveals(
      state.worldData, resolution.newProgressMap, resolution.houseSafetyUpdate,
    );
    const updatedNode = updatedWorldData.nodes.find(n => n.id === resolution.newNodeId);
    const oldNode = state.worldData.nodes.find(n => n.id === resolution.newNodeId);
    if (updatedNode && oldNode) {
      const oldRevealedIds = new Set(oldNode.houses.filter(h => h.revealed).map(h => h.id));
      const newlyRevealed = updatedNode.houses.filter(h => h.revealed && !oldRevealedIds.has(h.id));
      if (newlyRevealed.length > 0) {
        result += narrativeBuildingReveal(newlyRevealed.map(h => ({ name: h.name, type: h.type })));
      }
    }
  }

  return result;
}

/**
 * 将 resolution 结果写入 GameState（构建 updateState 回调所需的 partial）
 * additionalRevealHouseIds: 本回合需要额外揭盲的建筑（如任务目标）
 */
export function buildStateUpdate(
  resolution: PipelineResult,
  additionalRevealHouseIds?: string[],
): (prev: GameState) => Partial<GameState> {
  return (prev: GameState) => {
    const worldData = prev.worldData
      ? applyProgressAndReveals(
          prev.worldData,
          resolution.newProgressMap,
          resolution.houseSafetyUpdate,
          additionalRevealHouseIds,
          resolution.bossSpawn,
          resolution.bossDefeatedKey,
        )
      : prev.worldData;

    return {
      hp: resolution.newHp,
      lives: resolution.newLives,
      isGameOver: resolution.newIsGameOver,
      inventory: resolution.newInventory,
      currentNodeId: resolution.newNodeId,
      currentHouseId: resolution.newHouseId,
      transitState: resolution.newTransitState,
      worldData,
      pacingState: {
        tensionLevel: resolution.newTensionLevel,
        turnsInCurrentLevel: resolution.tensionChanged ? 1 : (prev.pacingState.turnsInCurrentLevel + 1)
      }
    };
  };
}

/**
 * 应用 Debug 覆写中的直写字段（任务/好感度）
 */
export function applyDebugDirectWrites(
  debugOv: DebugOverrides,
  updateState: (u: Partial<GameState>) => void,
): void {
  if (debugOv.forceQuest) updateState({ currentObjective: debugOv.forceQuest });
  if (debugOv.clearQuest) updateState({ currentObjective: null });
  if (debugOv.affection !== undefined) updateState({ affection: Math.max(0, Math.min(100, debugOv.affection)) });
}
