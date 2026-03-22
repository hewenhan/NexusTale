import * as modelService from './modelService';
import type { IntentResult, IntentExtractionResult, ConfuseData, ConfuseCandidate, NodeData, GameState } from '../types/game';
import { getLastIntent } from './intentHelpers';
import { buildIntentPrompt } from './intentPromptTemplate';
import { handleError } from '../lib/errorPolicy';

/**
 * 宏观寻路：BFS 找到从当前位置到目标的下一步微操。
 * - 若玩家在屋内 → 先退出建筑
 * - 若已在目标节点 → 进入目标建筑（若有）
 * - 否则 BFS 找最短路径的下一个相邻节点
 */
export function resolveObjectivePathfinding(
  currentNodeId: string,
  currentHouseId: string | null,
  objective: NonNullable<GameState['currentObjective']>,
  nodes: NodeData[]
): IntentResult {
  const { targetNodeId, targetHouseId } = objective;

  // 1. 已经在目标节点
  if (currentNodeId === targetNodeId) {
    if (currentHouseId) {
      if (currentHouseId === targetHouseId) {
        // 已经在目标建筑里了，explore
        return { intent: 'explore', targetId: null };
      }
      // 在同节点的其他建筑里 → 先退出
      return { intent: 'move', targetId: null };
    }
    // 在目标节点野外 → 进入目标建筑
    if (targetHouseId) {
      return { intent: 'move', targetId: targetHouseId };
    }
    // 目标节点无特定建筑，explore
    return { intent: 'explore', targetId: null };
  }

  // 2. 不在目标节点，但在屋内 → 先退出建筑
  if (currentHouseId) {
    return { intent: 'move', targetId: null };
  }

  // 3. BFS 寻路到目标节点
  const adjMap = new Map<string, string[]>();
  for (const n of nodes) {
    adjMap.set(n.id, n.connections);
  }

  const visited = new Set<string>([currentNodeId]);
  // queue: [nodeId, firstStepNodeId]
  const queue: [string, string][] = [];
  for (const neighbor of adjMap.get(currentNodeId) || []) {
    visited.add(neighbor);
    queue.push([neighbor, neighbor]);
  }

  while (queue.length > 0) {
    const [nodeId, firstStep] = queue.shift()!;
    if (nodeId === targetNodeId) {
      return { intent: 'move', targetId: firstStep };
    }
    for (const neighbor of adjMap.get(nodeId) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push([neighbor, firstStep]);
      }
    }
  }

  // 无路可达（不应出现），fallback
  return { intent: 'idle', targetId: null };
}

export async function generateSummary(currentSummary: string, messagesToSummarize: any[], language: 'zh' | 'en' = 'zh'): Promise<string | undefined> {
  const textToSummarize = messagesToSummarize.map(m => `${m.role}: ${m.text}`).join('\n');
  const langInstruction = language === 'zh' ? '用中文输出。' : 'Write in English.';
  const summaryPrompt = `
Current Summary (older events):
"${currentSummary}"

New Conversation to Incorporate (HIGHER PRIORITY — preserve more detail):
${textToSummarize}

Task:
1. Merge the current summary with the new conversation into a single updated summary.
2. The new conversation events are MORE RECENT and should receive MORE DETAIL (2-3 sentences each key event).
3. Older events from the current summary should be COMPRESSED more aggressively (1 sentence or combine related events).
4. Always retain: critical plot turning points, character deaths/revivals, key NPC encounters, quest progress, major inventory changes, and location transitions.
5. STRICT LENGTH LIMIT: The total summary must NOT exceed 1500 characters. If it would exceed, compress the oldest events further or drop trivial details.
6. Return ONLY the updated summary text, no extra formatting.
${langInstruction}
  `;

  try {
    return await modelService.generateText('text', summaryPrompt);
  } catch (e) {
    handleError('silent', 'Summary generation failed', e);
    return undefined;
  }
}

export async function generateTurn(fullPrompt: string): Promise<any> {
  const responseText = await modelService.generateText('text', fullPrompt, { jsonMode: true, novelty: true, thinkLevel: 'medium' });
  if (!responseText) throw new Error("No text response");
  
  let responseJson;
  try {
    const cleanedText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
    responseJson = JSON.parse(cleanedText);
  } catch (e) {
    handleError('silent', 'JSON Parse Error', e);
    // Try to extract the first valid JSON object by matching balanced braces
    const start = responseText.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < responseText.length; i++) {
        if (responseText[i] === '{') depth++;
        else if (responseText[i] === '}') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end !== -1) {
        try {
          responseJson = JSON.parse(responseText.slice(start, end + 1));
        } catch (e2) {
          // Fall through to plain text degradation
        }
      }
    }
    // Plain text degradation: wrap raw text as narration
    if (!responseJson) {
      handleError('degraded', 'JSON recovery failed, falling back to plain text', e);
      responseJson = {
        text_sequence: [{ type: 'narration', content: responseText.slice(0, 2000) }],
        image_prompt: '',
        scene_visuals_update: '',
        hp_description: '',
        affection_change: 0,
      };
    }
  }
  // Unwrap if model returned a single-element array instead of an object
  if (Array.isArray(responseJson) && responseJson.length > 0) {
    responseJson = responseJson[0];
  }
  return responseJson;
}

export type ImageResult =
  | { ok: true; base64: string }
  | { ok: false; reason: 'prohibited' | 'error'; error?: unknown };

export async function generateImage(finalPrompt: string): Promise<ImageResult> {
  try {
    return await modelService.generateImage('image', finalPrompt, { aspectRatio: '9:16', size: '512px' });
  } catch (e) {
    handleError('silent', 'Image generation failed', e);
    return { ok: false, reason: 'error', error: e };
  }
}

/**
 * Step 1 of the two-step pipeline: Intent Router.
 * Uses a fast model to classify the user's action into an intent category.
 * Internally builds all context from GameState — no pre-processing needed.
 */
export async function extractIntent(
  userInput: string,
  state: GameState,
): Promise<IntentExtractionResult> {
  const lastIntent = getLastIntent(state);


  const prompt = buildIntentPrompt(userInput, state);

  const text = await modelService.generateText('lite', prompt, { jsonMode: true });
  if (!text) return { intent: { intent: 'idle', targetId: null }, confuse: null };

  // 多级 JSON 解析：完整清洗 → 正则提取首个 {} → 放弃
  let parsed: any = null;
  try {
    parsed = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());
  } catch {
    const braceMatch = text.match(/\{[^}]*\}/);
    if (braceMatch) {
      try { parsed = JSON.parse(braceMatch[0]); } catch { /* give up */ }
    }
  }

  const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest', 'use_item'];

  if (parsed && validIntents.includes(parsed.intent)) {
    const direction = parsed.direction === 'back' ? 'back' as const : parsed.direction === 'forward' ? 'forward' as const : undefined;
    const intent: IntentResult = { intent: parsed.intent, targetId: parsed.targetId || null, direction, itemId: parsed.itemId || undefined };

    // Parse confuse data if present
    let confuse: ConfuseData | null = null;
    if (parsed.confuse?.sure === true && Array.isArray(parsed.confuse.type)) {
      const candidates: ConfuseCandidate[] = parsed.confuse.type
        .filter((c: any) => c && validIntents.includes(c.intent))
        .map((c: any) => ({
          intent: c.intent,
          confidence: typeof c.confidence === 'number' ? Math.max(0, Math.min(1, c.confidence)) : 0,
          targetId: c.targetId || null,
          direction: c.direction === 'forward' ? 'forward' as const : c.direction === 'back' ? 'back' as const : null,
          itemId: c.itemId || null,
        }));
      if (candidates.length > 0) {
        confuse = {
          sure: true,
          reason: typeof parsed.confuse.reason === 'string' ? parsed.confuse.reason : null,
          type: candidates.sort((a, b) => b.confidence - a.confidence),
        };
      }
    }

    return { intent, confuse };
  }

  // 解析全败，用上轮意图兜底
  if (lastIntent && validIntents.includes(lastIntent)) {
    console.warn("Intent parse failed, using lastIntent fallback:", lastIntent);
    return { intent: { intent: lastIntent as IntentResult['intent'], targetId: null }, confuse: null };
  }

  return { intent: { intent: 'idle', targetId: null }, confuse: null };
}

// ─── 不耻下问：自动生成玩家行动 ──────────────────────────────

interface AutoStoryContext {
  worldview: string;
  currentLocation: string;
  currentQuest: string | null;
  inventory: string[];
  companionName: string;
  recentHistory: string[];
}

/**
 * 使用 Lite 模型根据当前游戏上下文，生成一段像玩家自己输入的第一人称行动文本。
 */
export async function generateAutoUserAction(ctx: AutoStoryContext): Promise<string> {
  const prompt = `你是一个文字冒险游戏的玩家助手。根据以下游戏上下文，替玩家写一句简短的第一人称行动指令（就像玩家自己打字输入的那样）。

要求：
- 只输出一句话，不超过30个字
- 第一人称视角，口语化
- 要合理、符合当前情境，推动剧情发展
- 不要重复最近已做过的行动
- 不要加引号、不要加任何前缀说明

【世界观】${ctx.worldview.slice(0, 300)}
【当前位置】${ctx.currentLocation}
【当前任务】${ctx.currentQuest || '无特定任务'}
【携带物品】${ctx.inventory.length > 0 ? ctx.inventory.join('、') : '无'}
【同伴】${ctx.companionName}
【最近行动】${ctx.recentHistory.slice(-3).join(' → ') || '刚开始冒险'}

请直接输出玩家行动：`;

  const text = await modelService.generateText('lite', prompt);
  if (!text) throw new Error('Auto story generation returned empty');
  // 清理：去除引号、换行、多余空白
  return text.replace(/["""''「」『』]/g, '').replace(/\n/g, '').trim().slice(0, 50);
}

