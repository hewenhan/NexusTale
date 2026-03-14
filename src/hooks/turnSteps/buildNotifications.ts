/**
 * 构建本回合待显示的通知列表（抵达/揭盲/发现建筑）
 */

import { getVisibleHouses } from '../../lib/pipeline';
import type { GameState } from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';
import type { GrandNotificationData } from '../../components/GrandNotification';
import type { DirectorResult } from './directorSystem';

export function buildNotifications(
  state: GameState,
  resolution: PipelineResult,
  directorResult: DirectorResult,
): Omit<GrandNotificationData, 'id'>[] {
  const notifications: Omit<GrandNotificationData, 'id'>[] = [];

  // 抵达新节点
  if (!resolution.newTransitState && state.transitState && resolution.newNodeId !== state.currentNodeId) {
    const arrivedNode = state.worldData?.nodes.find(n => n.id === resolution.newNodeId);
    if (arrivedNode) {
      notifications.push({
        type: 'discovery',
        title: '抵达地点！',
        description: `你抵达了【${arrivedNode.name}】`,
      });
    }
  }

  // 任务目标地点揭盲
  if (state.currentObjective && resolution.newNodeId === state.currentObjective.targetNodeId
    && resolution.newNodeId !== state.currentNodeId) {
    notifications.push({
      type: 'discovery',
      title: '目标地点已揭盲！',
      description: `任务目标所在区域已进入视野`,
    });
  }

  // 探索进度提升导致的建筑揭盲通知
  const revealNode = state.worldData?.nodes.find(n => n.id === resolution.newNodeId);
  if (revealNode && !resolution.newTransitState) {
    const oldVisible = getVisibleHouses(revealNode, state.progressMap, state.currentObjective);
    const newVisible = getVisibleHouses(revealNode, resolution.newProgressMap, state.currentObjective);
    const oldIds = new Set(oldVisible.map(h => h.id));
    const newlyRevealed = newVisible.filter(h => !oldIds.has(h.id));
    for (const house of newlyRevealed) {
      notifications.push({
        type: 'discovery',
        title: '发现新建筑！',
        description: `在【${revealNode.name}】发现了【${house.name}】`,
      });
    }
  }

  // 合并导演系统的任务通知（quest + discovery）
  if (directorResult.questNotification) {
    notifications.unshift(directorResult.questNotification);
    if (directorResult.questDiscoveryNotification) {
      notifications.splice(1, 0, directorResult.questDiscoveryNotification);
    }
  }

  return notifications;
}
