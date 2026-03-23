/**
 * Step 1.6 + 3.5 + crisis anchoring + 7.5 + 9.6:
 * 任务链全生命周期管理
 *
 * 将散落在 useChatLogic 中的任务相关条件逻辑统一收口：
 *   - 任务链生成 (Step 1.6)
 *   - 任务道具使用 & 环节推进 (Step 3.5)
 *   - 任务目标抵达 & 危机锚定 (quest crisis anchoring)
 *   - 环节完成后的延迟状态写入 (Step 7.5)
 */

import type { GameState, QuestStage, QuestCompletionCeremony, InventoryItem, IntentResult } from '../../types/game';
import { bossTensionFromSafety } from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';
import { withHouseRevealed } from '../../lib/pipeline';
import { handleError } from '../../lib/errorPolicy';
import type { GrandNotificationData } from '../../components/GrandNotification';
import type { DirectorResult } from './directorSystem';
import { advanceQuestChain } from './directorSystem';
import { generateQuestChain, generateQuestCompletionNarration } from '../../services/questService';
import {
  narrativeQuestDispatch, narrativeQuestItemInBossFight,
  narrativeQuestChainComplete, narrativeQuestStageAdvance,
  narrativeQuestItemUsed, narrativeQuestItemCannotUse,
  narrativeQuestArrival, narrativeQuestAreaOnlyArrival,
} from '../../lib/narrativeRegistry';

// ─── Types ────────────────────────────────────────────────────

export interface QuestChainGenResult {
  pendingQuestItem: InventoryItem | null;
}

export interface QuestResolutionResult {
  narrativeInstruction: string;
  questCeremony: QuestCompletionCeremony | null;
  questStageCompleted: boolean;
  questChainCompleted: boolean;
  questNextObjective: { targetNodeId: string; targetHouseId: string; targetLocationName: string; description: string } | null;
  deferredQuestBagItems: InventoryItem[];
  deferredQuestNotifications: Omit<GrandNotificationData, 'id'>[];
}

export interface QuestDeferredWriteInput {
  questStageCompleted: boolean;
  questChainCompleted: boolean;
  questCeremony: QuestCompletionCeremony | null;
  questNextObjective: QuestResolutionResult['questNextObjective'];
  deferredQuestBagItems: InventoryItem[];
  deferredQuestNotifications: Omit<GrandNotificationData, 'id'>[];
}

// ─── Step 1.6: Quest Chain Generation ─────────────────────────

export async function runQuestChainGeneration(
  directorResult: DirectorResult,
  state: GameState,
  updateState: (patch: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => void,
): Promise<QuestChainGenResult> {
  let pendingQuestItem: InventoryItem | null = null;

  if (!directorResult.needsQuestChainGeneration || !state.worldData || !state.currentNodeId) {
    return { pendingQuestItem };
  }

  try {
    const recentHistory = state.history.slice(-4); // 最近两轮对话
    const chainResult = await generateQuestChain(
      state.worldview, state.worldData, state.currentNodeId, state.language,
      state.worldviewUpdates, recentHistory,
    );

    const questStages: QuestStage[] = chainResult.stages.map((s, i) => ({
      stageIndex: i,
      targetNodeId: chainResult.targetLocations[i]?.nodeId ?? '',
      targetHouseId: chainResult.targetLocations[i]?.houseId ?? '',
      targetLocationName: chainResult.targetLocations[i]?.locationName ?? '',
      description: s.description,
      requiredItems: s.requiredItems,
      completed: false,
      arrivedAtTarget: false,
    }));

    if (questStages.length > 0) {
      const firstStage = questStages[0];
      const firstObjective = {
        targetNodeId: firstStage.targetNodeId,
        targetHouseId: firstStage.targetHouseId,
        targetLocationName: firstStage.targetLocationName,
        description: firstStage.description,
      };

      if (firstStage.requiredItems.length > 0) {
        const ri = firstStage.requiredItems[0];
        pendingQuestItem = {
          id: ri.id,
          name: ri.name,
          type: 'quest' as const,
          description: `任务道具 - ${firstStage.description}`,
          rarity: 'common' as const,
          icon: '📜',
          quantity: 1,
          buff: null,
        };
      }

      updateState(prev => ({
        questChain: questStages,
        currentQuestStageIndex: 0,
        currentObjective: firstObjective,
        worldData: prev.worldData ? withHouseRevealed(prev.worldData, firstObjective.targetHouseId) : prev.worldData,
      }));

      directorResult.questNotification = {
        type: 'quest',
        title: '新任务链！',
        description: firstStage.description,
      };
      directorResult.questDiscoveryNotification = {
        type: 'discovery',
        title: '目标地点',
        description: `前往【${firstStage.targetLocationName}】`,
      };

      const questItemName = pendingQuestItem?.name ?? '一件关键道具';
      directorResult.narrativeOverride = narrativeQuestDispatch({
        stageDescription: firstStage.description,
        targetLocationName: firstStage.targetLocationName,
        questItemName,
      });

      console.log('[QuestChain] Generated', questStages.length, 'stages, first item:', pendingQuestItem?.name);
    }
  } catch (e) {
    handleError('degraded', 'QuestChain generation failed', e);
  }

  return { pendingQuestItem };
}

// ─── Step 3.5: Quest Item Usage & Stage Resolution ────────────

export async function resolveQuestItemUsage(
  narrativeInstruction: string,
  intent: IntentResult,
  resolution: PipelineResult,
  state: GameState,
  setIsCeremonyGenerating: (v: boolean) => void,
): Promise<QuestResolutionResult> {
  const result: QuestResolutionResult = {
    narrativeInstruction,
    questCeremony: null,
    questStageCompleted: false,
    questChainCompleted: false,
    questNextObjective: null,
    deferredQuestBagItems: [],
    deferredQuestNotifications: [],
  };

  if (intent.intent !== 'use_item' || !intent.itemId || !state.questChain) {
    return result;
  }

  const currentStage = state.questChain[state.currentQuestStageIndex];
  if (!currentStage || currentStage.completed) return result;

  const matchedItem = currentStage.requiredItems.find(ri => ri.id === intent.itemId);
  if (!matchedItem) return result;

  // Boss 战中使用任务道具 → 不消耗，视为发呆被打
  if (resolution.newTensionLevel >= 2) {
    result.narrativeInstruction = narrativeQuestItemInBossFight(matchedItem.name);
    return result;
  }

  const atTargetLocation = resolution.newNodeId === currentStage.targetNodeId
    && (resolution.newHouseId || '') === (currentStage.targetHouseId || '');

  if (!atTargetLocation) {
    result.narrativeInstruction = narrativeQuestItemCannotUse(matchedItem.name) + '\n' + narrativeInstruction;
    return result;
  }

  // At target location → consume quest item
  resolution.newInventory = resolution.newInventory.filter(i => i.id !== matchedItem.id);

  const remainingRequired = currentStage.requiredItems.filter(
    ri => ri.id !== matchedItem.id && resolution.newInventory.some(inv => inv.id === ri.id)
  );

  if (remainingRequired.length > 0) {
    result.narrativeInstruction = narrativeQuestItemUsed(matchedItem.name) + '\n' + narrativeInstruction;
    return result;
  }

  // ── 环节完成 ──
  result.questStageCompleted = true;
  const { nextObjective, questCompleted } = advanceQuestChain(state);

  if (questCompleted) {
    result.questChainCompleted = true;
    setIsCeremonyGenerating(true);
    try {
      result.questCeremony = await generateQuestCompletionNarration(
        state.worldview, state.questChain, state.playerProfile,
        state.companionProfile, state.affection, state.history,
        state.summary, state.language
      );
    } catch {
      result.questCeremony = {
        recap: state.questChain.map((s, i) => `第 ${i + 1} 环：${s.targetLocationName}的挑战已被征服。`),
        climax: '经历了重重险阻，冒险者终于站在了胜利的终点。',
        companionReaction: `${state.companionProfile.name}露出了一丝不易察觉的微笑。`,
        reward: { title: '任务链完成', description: '这段旅程永远改变了这片土地的命运。新的冒险即将开始。' },
        epilogue: '这段传奇将永远铭刻于这片土地的记忆之中，而新的篇章正悄然翻开。',
        affectionDelta: 10,
      };
    }
    const ceremonySummary = result.questCeremony!.reward.title + '——' + result.questCeremony!.reward.description.slice(0, 100);
    result.narrativeInstruction = narrativeQuestChainComplete({ itemName: matchedItem.name, ceremonySummary }) + '\n' + narrativeInstruction;
  } else if (nextObjective) {
    result.questNextObjective = nextObjective;
    const nextStageData = state.questChain[state.currentQuestStageIndex + 1];
    if (nextStageData?.requiredItems?.[0]) {
      const questNextItem: InventoryItem = {
        id: nextStageData.requiredItems[0].id,
        name: nextStageData.requiredItems[0].name,
        type: 'quest' as const,
        description: `任务道具 - ${nextStageData.description}`,
        rarity: 'common' as const,
        icon: '📜',
        quantity: 1,
        buff: null,
      };
      result.deferredQuestBagItems.push(questNextItem);
      result.deferredQuestNotifications.push({
        type: 'quest',
        title: `下一任务${state.currentQuestStageIndex + 2}！`,
        description: nextObjective.description,
      });
      result.narrativeInstruction = narrativeQuestStageAdvance({
        usedItemName: matchedItem.name,
        nextItemName: questNextItem.name,
      }) + '\n' + narrativeInstruction;
    }
  }

  return result;
}

// ─── Quest Crisis Anchoring (抵达任务目标时提升紧张度) ─────────

export function applyQuestCrisisAnchoring(
  narrativeInstruction: string,
  resolution: PipelineResult,
  state: GameState,
  updateState: (patch: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => void,
): string {
  if (!state.questChain || resolution.newTransitState) return narrativeInstruction;

  const currentStage = state.questChain[state.currentQuestStageIndex];
  if (!currentStage || currentStage.arrivedAtTarget || resolution.newNodeId !== currentStage.targetNodeId) {
    return narrativeInstruction;
  }

  const targetNode = state.worldData?.nodes.find(n => n.id === currentStage.targetNodeId);
  const targetHouse = targetNode?.houses.find(h => h.id === currentStage.targetHouseId);
  const atTargetLocation = resolution.newNodeId === currentStage.targetNodeId
    && (resolution.newHouseId || '') === (currentStage.targetHouseId || '');

  // 宏观区域到达但微观建筑未进入 — 引导玩家进屋
  if (!atTargetLocation && currentStage.targetHouseId) {
    const houseName = targetHouse?.name || currentStage.targetLocationName;
    return narrativeQuestAreaOnlyArrival({ areaName: targetNode?.name || '目标区域', houseName }) + '\n' + narrativeInstruction;
  }

  if (!atTargetLocation) return narrativeInstruction;

  const crisisTension = bossTensionFromSafety(targetHouse?.safetyLevel ?? targetNode?.safetyLevel);
  if (crisisTension && crisisTension > resolution.newTensionLevel) {
    resolution.newTensionLevel = crisisTension;
    resolution.tensionChanged = true;
  }

  updateState(prev => {
    if (!prev.questChain) return {};
    const updated = [...prev.questChain];
    updated[prev.currentQuestStageIndex] = { ...updated[prev.currentQuestStageIndex], arrivedAtTarget: true };
    return { questChain: updated };
  });

  const finalTension = crisisTension ?? resolution.newTensionLevel;
  const locationName = `${targetNode!.name} ${targetHouse ? `- ${targetHouse.name}` : ''}`;
  return narrativeQuestArrival({ locationName, finalTension });
}

// ─── Step 7.5: Quest Deferred State Writes ────────────────────

export function applyQuestDeferredWrites(
  input: QuestDeferredWriteInput,
  state: GameState,
  updateState: (patch: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => void,
  pendingNotifications: Omit<GrandNotificationData, 'id'>[],
  pendingBagItems: InventoryItem[],
): void {
  if (!input.questStageCompleted || !state.questChain) return;

  const stageIdx = state.currentQuestStageIndex;

  if (input.questChainCompleted && input.questCeremony) {
    const ceremony = input.questCeremony;
    updateState(prev => ({
      questChain: (prev.questChain || []).map((s, i) => i === stageIdx ? { ...s, completed: true } : s),
      currentObjective: null,
      affection: Math.min(100, prev.affection + (ceremony.affectionDelta ?? 10)),
      worldviewUpdates: ceremony.worldviewUpdate
        ? [...prev.worldviewUpdates, ceremony.worldviewUpdate]
        : prev.worldviewUpdates,
    }));
  } else if (input.questNextObjective) {
    const nextObj = input.questNextObjective;
    updateState(prev => ({
      questChain: (prev.questChain || []).map((s, i) => i === stageIdx ? { ...s, completed: true } : s),
      currentQuestStageIndex: stageIdx + 1,
      currentObjective: nextObj,
      worldData: prev.worldData ? withHouseRevealed(prev.worldData, nextObj.targetHouseId) : prev.worldData,
    }));
    for (const n of input.deferredQuestNotifications) {
      pendingNotifications.push(n);
    }
    for (const item of input.deferredQuestBagItems) {
      pendingBagItems.push(item);
    }
  }
}
