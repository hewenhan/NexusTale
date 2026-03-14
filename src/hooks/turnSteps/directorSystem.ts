/**
 * Step 1.5b: 导演系统 — seek_quest 任务派发与叙事覆盖
 */

import type { GameState, IntentResult } from '../../types/game';
import type { GrandNotificationData } from '../../components/GrandNotification';

export interface DirectorResult {
  narrativeOverride: string | null;
  questNotification: Omit<GrandNotificationData, 'id'> | null;
  questDiscoveryNotification: Omit<GrandNotificationData, 'id'> | null;
  /** 如果导演分支 B 派发了新任务，存在此字段 */
  newObjective: { targetNodeId: string; targetHouseId: string; description: string } | null;
}

/**
 * 检查是否应自动升级为 seek_quest（idle + T0 + 无目标 + 闲聊 ≥3 回合）
 */
export function maybeEscalateToSeekQuest(intent: IntentResult, state: GameState): void {
  if (intent.intent === 'idle' && state.pacingState.tensionLevel === 0
    && !state.currentObjective && state.pacingState.turnsInCurrentLevel >= 3) {
    intent.intent = 'seek_quest';
  }
}

/**
 * 执行导演系统逻辑，返回叙事覆盖和通知
 */
export function runDirector(intent: IntentResult, state: GameState): DirectorResult {
  const result: DirectorResult = {
    narrativeOverride: null,
    questNotification: null,
    questDiscoveryNotification: null,
    newObjective: null,
  };

  if (intent.intent !== 'seek_quest') return result;

  if (state.currentObjective !== null) {
    // 分支 A：玩家已有目标却在瞎折腾
    result.narrativeOverride = `【系统强制】：玩家当前已有明确主线任务（${state.currentObjective.description}），却漫无目的或提出去别的无关地点。请伴游 NPC 立刻严厉打断玩家，提醒玩家不要节外生枝，赶紧打开地图寻找前往目标的路线！`;
  } else {
    // 分支 B：玩家确实没有目标，TS 充当发牌员
    const availableNodes = state.worldData!.nodes.filter(n => n.id !== state.currentNodeId && n.houses.length > 0);
    if (availableNodes.length > 0) {
      const targetNode = availableNodes[Math.floor(Math.random() * availableNodes.length)];
      const targetHouse = targetNode.houses[Math.floor(Math.random() * targetNode.houses.length)];

      const newObjective = {
        targetNodeId: targetNode.id,
        targetHouseId: targetHouse.id,
        description: `前往【${targetNode.name}】调查【${targetHouse.name}】`
      };
      result.newObjective = newObjective;

      result.questNotification = {
        type: 'quest',
        title: '新任务！',
        description: newObjective.description,
      };

      result.questDiscoveryNotification = {
        type: 'discovery',
        title: '发现新地点！',
        description: `目标地点【${targetNode.name} · ${targetHouse.name}】已在地图上标记`,
      };

      result.narrativeOverride = `【系统强制派发任务】：玩家目前漫无目的。请伴游 NPC 立刻抛出一个极其紧急的新目标：极力劝说玩家前往【${targetNode.name}】寻找【${targetHouse.name}】(这是一个 ${targetHouse.type} 类型的建筑)。\n请你根据该建筑的类型，现场编造一个极其合理的动机（例如：NPC 截获了求救信号、或者想起那里藏有关乎性命的物资）。绝不要提玩家刚才瞎编的地点！敦促玩家看地图找路过去！`;
    }
  }

  return result;
}
