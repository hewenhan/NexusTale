/**
 * extractIntent 专用上下文构建工具函数
 * 从 GameState 提取各类 prompt 段落，供模板内联调用
 */

import type { GameState } from '../types/game';
import { findNode, getVisibleHouses } from '../lib/pipeline';

/** 相连节点信息 */
export function fmtConnectedNodes(state: GameState): string {
  const currentNode = findNode(state, state.currentNodeId!)!;
  return currentNode.connections.map(connId => {
    const connNode = state.worldData!.nodes.find(n => n.id === connId);
    return connNode ? `${connId} (${connNode.name} - ${connNode.type})` : connId;
  }).join(', ') || '无';
}

/** 可见建筑信息 */
export function fmtVisibleHouses(state: GameState): string {
  const currentNode = findNode(state, state.currentNodeId!)!;
  const list = getVisibleHouses(currentNode);
  return list.length > 0
    ? list.map(h => `${h.id} (${h.name} - ${h.type})`).join(', ')
    : 'None';
}

/** 最近 2 轮对话 */
export function fmtRecentConversation(state: GameState): string {
  const turns: string[] = [];
  let turnCount = 0;
  for (let i = state.history.length - 1; i >= 0 && turnCount < 2; i--) {
    turns.unshift(`${state.history[i].role}: ${state.history[i].text}`);
    if (state.history[i].role === 'user') turnCount++;
  }
  return turns.join('\n') || '没有之前的对话';
}

/** 从历史中提取上一次意图 */
export function getLastIntent(state: GameState): string | null {
  const msg = [...state.history].reverse().find(m => m.debugState?.lastIntent);
  return msg?.debugState?.lastIntent || null;
}

/** 中转状态规则段 */
export function fmtTransitRules(state: GameState): string {
  if (!state.transitState) {
    return '**中转状态:** 未活跃（忽略方向规则，将 direction 设置为 null）';
  }
  const fromNode = state.worldData!.nodes.find(n => n.id === state.transitState!.fromNodeId);
  const toNode = state.worldData!.nodes.find(n => n.id === state.transitState!.toNodeId);
  const fromName = fromNode?.name || state.transitState.fromNodeId;
  const toName = toNode?.name || state.transitState.toNodeId;
  return `**中转状态 (活跃):**
- 正从 [${fromName}] 前往[${toName}]，进度: ${state.transitState.pathProgress}%
- **方向规则**: 如果玩家明确希望撤退、掉头或放弃（例如 "回去", "掉头", "退回出发地"），请将 direction 设置为 "back"。对于正常的聊天、探索或继续旅程，请将 direction 设置为 "forward"`;
}

/** 求生本能规则段（tension >= 2 时注入） */
export function fmtSurvivalInstinct(state: GameState): string {
  const tensionLevel = state.pacingState.tensionLevel;
  if (tensionLevel < 2) return '';
  const lastIntent = getLastIntent(state);
  return `\n\n【求生本能 (Survival Instinct) - 绝对强制法则】：
当前紧张度 = ${tensionLevel}（${tensionLevel >= 3 ? '极度危险' : '危险'}状态）！上一次意图：${lastIntent || '无'}
在紧张度 >= 2 的危险状态下，玩家任何带有情绪宣泄、恐慌、反抗、惊叫、咒骂、呐喊的文本（如"卧槽！"、"你这怪物别碰我！"、"啊啊啊"、"救命"、"滚开"等），哪怕没有明确的动作动词，都必须被归类为 "combat"（挣扎求生）
只有当玩家极其明确地表示放弃抵抗（如"我放弃了"、"我坐下等死"、"我不动了"、"随便吧"）时，才能判定为 "idle"
任何模糊的、情绪化的、带有求生本能的表达 → 强制归类为 "combat"`;
}

/** 格式化背包物品列表 */
export function fmtInventory(state: GameState): string {
  if (!state.inventory || state.inventory.length === 0) return '无';
  return state.inventory.map(i => `${i.id} (${i.name})`).join(', ');
}

export function fmtCombatInstinct(state: GameState): string {
    const tensionLevel = state.pacingState.tensionLevel;
    if (tensionLevel < 2) return '';
    return `**step 2.75: 对抗**
- **条件**: 结合上下文玩家在对抗危机
- **intent**: "combat"
- **targetId**: null`;
}