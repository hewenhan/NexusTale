/**
 * 将 ChatMessage[] 转为 RagDocument[]（不含 embedding）
 *
 * 分块策略（控制文档量增长速度）：
 * - 同一轮 AI 回复的连续 model 消息 → 合并为 1 条文档
 *   （单轮 5-8 段 model 消息 → 1 条 RagDocument，大幅减少向量数）
 * - user 消息：每条独立一个文档
 * - narrator 消息：添加 [旁白] 前缀增强语义区分
 * - 过短消息（<10 字符）：跳过（"嗯"、"好"等无语义价值）
 * - 地名前缀：注入 [地点名] 前缀，提升关键词检索精度
 *
 * 每轮预期产出：1 条 user + 1 条合并 model + 0-1 条 narrator ≈ 2-3 条 RagDocument
 */
import type { ChatMessage } from '../../types/game';
import type { RagDocument } from './types';

const MIN_TEXT_LENGTH = 10;

/** 解析地点前缀 */
function locPrefix(msg: ChatMessage, nodeNameMap: Map<string, string>): string {
  const house = msg.currentHouseId ? nodeNameMap.get(msg.currentHouseId) : undefined;
  const node = msg.currentNodeId ? nodeNameMap.get(msg.currentNodeId) : undefined;
  const loc = house || node;
  return loc ? `[${loc}] ` : '';
}

export function chunkMessages(
  messages: ChatMessage[],
  startIndex: number,
  nodeNameMap?: Map<string, string>,
): Omit<RagDocument, 'embedding'>[] {
  const docs: Omit<RagDocument, 'embedding'>[] = [];
  const names = nodeNameMap ?? new Map<string, string>();
  let i = startIndex;

  while (i < messages.length) {
    const msg = messages[i];

    if (msg.role === 'user') {
      if (msg.text.length >= MIN_TEXT_LENGTH) {
        docs.push({
          id: msg.id,
          text: `${locPrefix(msg, names)}${msg.text}`,
          metadata: {
            role: 'user',
            nodeId: msg.currentNodeId,
            houseId: msg.currentHouseId,
            tensionLevel: msg.pacingState?.tensionLevel,
            timestamp: msg.timestamp,
            turnIndex: i,
          },
        });
      }
      i++;
      continue;
    }

    if (msg.role === 'narrator') {
      if (msg.text.length >= MIN_TEXT_LENGTH) {
        docs.push({
          id: msg.id,
          text: `[旁白] ${locPrefix(msg, names)}${msg.text}`,
          metadata: {
            role: 'narrator',
            nodeId: msg.currentNodeId,
            houseId: msg.currentHouseId,
            tensionLevel: msg.pacingState?.tensionLevel,
            timestamp: msg.timestamp,
            turnIndex: i,
          },
        });
      }
      i++;
      continue;
    }

    // role === 'model'：合并连续 model 消息
    const mergedTexts: string[] = [];
    const firstModelMsg = msg;
    const firstIndex = i;

    while (i < messages.length && messages[i].role === 'model') {
      if (messages[i].text.length >= MIN_TEXT_LENGTH) {
        mergedTexts.push(messages[i].text);
      }
      i++;
    }

    if (mergedTexts.length > 0) {
      docs.push({
        id: firstModelMsg.id,
        text: `${locPrefix(firstModelMsg, names)}${mergedTexts.join('\n')}`,
        metadata: {
          role: 'model',
          nodeId: firstModelMsg.currentNodeId,
          houseId: firstModelMsg.currentHouseId,
          tensionLevel: firstModelMsg.pacingState?.tensionLevel,
          timestamp: firstModelMsg.timestamp,
          turnIndex: firstIndex,
        },
      });
    }
  }

  return docs;
}
