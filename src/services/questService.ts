/**
 * questService — 任务链生成 / 任务完成庆典叙述
 */

import * as modelService from './modelService';
import type { WorldData, CharacterProfile, SafetyLevel, QuestStage, QuestCompletionCeremony, ChatMessage, WorldviewUpdate } from '../types/game';
import { cleanJsonText } from './jsonRecovery';
import { handleError } from '../lib/errorPolicy';
import { buildQuestCeremonyPrompt } from './questCeremonyPrompt';

/**
 * 生成任务链（3-5 环）+ 每环所需道具
 */
export async function generateQuestChain(
  worldview: string,
  worldData: WorldData,
  currentNodeId: string,
  language: 'zh' | 'en' = 'zh',
  worldviewUpdates: WorldviewUpdate[] = [],
  recentHistory: ChatMessage[] = [],
): Promise<{ stages: Array<{ description: string; requiredItems: { name: string; id: string }[] }>, targetLocations: { nodeId: string; houseId: string; locationName: string }[] }> {
  const langInstruction = language === 'zh' ? 'All text MUST be in Chinese.' : 'All content MUST be in English.';

  // Pick 3-5 target locations (TS side, no adjacent repeats)
  // Include both node-level (outdoors) and house-level targets
  const stageCount = 3 + Math.floor(Math.random() * 3); // 3-5

  const allTargets: { nodeId: string; houseId: string; locationName: string; nodeName: string; locationType: string; safety: SafetyLevel }[] = [];

  for (const n of worldData.nodes) {
    if (n.id === currentNodeId) continue;
    // Node-level target (outdoors)
    allTargets.push({
      nodeId: n.id, houseId: '', locationName: n.name,
      nodeName: n.name, locationType: n.type, safety: n.safetyLevel,
    });
    // House-level targets
    for (const h of n.houses) {
      allTargets.push({
        nodeId: n.id, houseId: h.id, locationName: `${n.name} · ${h.name}`,
        nodeName: n.name, locationType: h.type, safety: n.safetyLevel,
      });
    }
  }

  const targetLocations: typeof allTargets = [];
  for (let i = 0; i < stageCount && allTargets.length > 0; i++) {
    const candidates = allTargets.filter(t =>
      targetLocations.length === 0 || t.nodeId !== targetLocations[targetLocations.length - 1].nodeId
    );
    const pool = candidates.length > 0 ? candidates : allTargets;
    const pick = pool[Math.floor(Math.random() * pool.length)];
    targetLocations.push(pick);
  }

  const locationDesc = targetLocations.map((t, i) =>
    `Stage ${i + 1}: ${t.locationName} (${t.locationType}, danger: ${t.safety})`
  ).join('\n');

  const worldviewUpdatesSection = worldviewUpdates.length > 0
    ? `\nWorld Changes So Far:\n${worldviewUpdates.map((u, i) => `[${i + 1}] ${u.brief}`).join('\n')}`
    : '';

  const recentConversation = recentHistory.length > 0
    ? `\nRecent Conversation (for plot context):\n${recentHistory.map(m => `${m.role}: ${m.text}`).join('\n')}`
    : '';

  const prompt = `You are a quest designer for an RPG text adventure.

Worldview: "${worldview}"${worldviewUpdatesSection}${recentConversation}

The player needs a quest chain with ${targetLocations.length} stages. For each stage, the player must travel to a specific location and use the correct quest item there.

IMPORTANT: The quest chain MUST be closely related to the current story progression shown in the world changes and recent conversation. Do NOT generate generic quests — tie the objectives tightly to the evolving narrative.

Target Locations (pre-assigned):
${locationDesc}

For each stage, generate:
1. description: A vivid, specific quest objective description (2-3 sentences explaining WHY the player needs to go there and WHAT they need to accomplish)
2. requiredItem: EXACTLY ONE quest item needed for this stage. The item has a name and a brief description.

IMPORTANT: Each stage must have EXACTLY ONE required item, no more, no less.

Make the quest chain tell a coherent escalating story across all stages.

${langInstruction}

Return ONLY a JSON object (no markdown):
{
  "stages": [
    {
      "description": "stage objective description...",
      "requiredItem": { "name": "item name", "description": "item description" }
    }
  ]
}`;

  const text = await modelService.generateText('text', prompt, { jsonMode: true, novelty: true });
  if (!text) throw new Error('Failed to generate quest chain');

  const cleaned = cleanJsonText(text);
  const parsed = JSON.parse(cleaned);

  let itemIdCounter = 0;
  const stages = (parsed.stages || []).map((s: any, i: number) => {
    // Support both requiredItem (single) and requiredItems (array) from AI
    const item = s.requiredItem || (s.requiredItems && s.requiredItems[0]) || { name: `任务道具 ${i + 1}` };
    return {
      description: s.description || `前往目标地点 ${i + 1}`,
      requiredItems: [{
        name: item.name || `任务道具 ${itemIdCounter}`,
        id: `quest_item_${itemIdCounter++}`,
      }],
    };
  });

  return {
    stages,
    targetLocations: targetLocations.map(t => ({ nodeId: t.nodeId, houseId: t.houseId, locationName: t.locationName })),
  };
}

/**
 * 任务完成大典：由 AI 生成结构化的多段式庆典叙述
 */
export async function generateQuestCompletionNarration(
  worldview: string,
  questChain: QuestStage[],
  playerProfile: CharacterProfile,
  companionProfile: CharacterProfile,
  affection: number,
  recentMessages: ChatMessage[],
  summary: string,
  language: 'zh' | 'en' = 'zh'
): Promise<QuestCompletionCeremony> {
  const prompt = buildQuestCeremonyPrompt({
    worldview, questChain, playerProfile, companionProfile,
    affection, recentMessages, summary, language,
  });

  try {
    const text = await modelService.generateText('text', prompt, { jsonMode: true, novelty: true });
    if (!text) throw new Error('Empty response');
    const cleaned = cleanJsonText(text);
    const parsed = JSON.parse(cleaned);

    return {
      recap: Array.isArray(parsed.recap) ? parsed.recap.map(String) : questChain.map((_, i) => `第 ${i + 1} 环已完成。`),
      climax: typeof parsed.climax === 'string' ? parsed.climax : '冒险者完成了这段艰辛的旅程。',
      companionReaction: typeof parsed.companionReaction === 'string' ? parsed.companionReaction : `${companionProfile.name}默默点了点头。`,
      reward: {
        title: parsed.reward?.title || '任务完成',
        description: parsed.reward?.description || '一段传奇就此落幕，新的篇章即将展开。',
      },
      epilogue: typeof parsed.epilogue === 'string' ? parsed.epilogue : '这段传奇将永远铭刻于这片土地的记忆之中，而新的篇章正悄然翻开。',
      affectionDelta: Math.max(5, Math.min(15, Number(parsed.affectionDelta) || 10)),
      worldviewUpdate: parsed.worldviewUpdate && typeof parsed.worldviewUpdate.full === 'string'
        ? { full: parsed.worldviewUpdate.full, brief: typeof parsed.worldviewUpdate.brief === 'string' ? parsed.worldviewUpdate.brief : parsed.worldviewUpdate.full.slice(0, 50) }
        : undefined,
    };
  } catch (e) {
    handleError('degraded', 'Quest completion ceremony generation failed', e);
    return {
      recap: questChain.map((s, i) => `第 ${i + 1} 环：${s.targetLocationName}的挑战已被征服。`),
      climax: '经历了重重险阻，冒险者终于站在了胜利的终点。',
      companionReaction: `${companionProfile.name}露出了一丝不易察觉的微笑。`,
      reward: { title: '任务链完成', description: '这段旅程永远改变了这片土地的命运。新的冒险即将开始。' },
      epilogue: '这段传奇将永远铭刻于这片土地的记忆之中，而新的篇章正悄然翻开。',
      affectionDelta: 10,
    };
  }
}
