/**
 * Quest Ceremony Prompt 模板
 * 从 questService.ts 提取的任务完成庆典 LLM 提示词
 */

import type { CharacterProfile, QuestStage, ChatMessage } from '../types/game';

export interface QuestCeremonyPromptParams {
  worldview: string;
  questChain: QuestStage[];
  playerProfile: CharacterProfile;
  companionProfile: CharacterProfile;
  affection: number;
  recentMessages: ChatMessage[];
  summary: string;
  language: 'zh' | 'en';
}

export function buildQuestCeremonyPrompt(p: QuestCeremonyPromptParams): string {
  const langInstruction = p.language === 'zh' ? 'All text MUST be in Chinese.' : 'All content MUST be in English.';

  const stagesDesc = p.questChain.map((s, i) =>
    `Stage ${i + 1}: [${s.targetLocationName}] ${s.description} (items: ${s.requiredItems.map(r => r.name).join(', ')})`
  ).join('\n');

  const affectionLabel = p.affection < 30 ? 'cold/distant' : p.affection < 60 ? 'neutral/warming' : 'close/trusting';

  const recentLog = p.recentMessages.slice(-15).map(m => `${m.role}: ${m.text}`).join('\n');

  return `You are a veteran storyteller recounting a completed quest to an audience that cares about THESE specific characters. Your job is to make them relive it — not through grand words, but through concrete scenes they can picture.

=== WORLD ===
Worldview: "${p.worldview}"

=== CHARACTERS ===
Player: ${p.playerProfile.name} — ${p.playerProfile.personality || p.playerProfile.personalityDesc || 'adventurer'}. Background: ${p.playerProfile.background || 'unknown'}. Specialties: ${p.playerProfile.specialties || 'various'}.
Companion: ${p.companionProfile.name} — ${p.companionProfile.personality || p.companionProfile.personalityDesc || 'companion'}. Background: ${p.companionProfile.background || 'unknown'}.
Current Relationship: affection ${p.affection}/100 (${affectionLabel})

=== QUEST CHAIN (all stages, now ALL completed) ===
${stagesDesc}

=== STORY SUMMARY (earlier events) ===
${p.summary || '(no earlier summary)'}

=== RECENT CONVERSATION (vivid details to reference) ===
${recentLog || '(no recent logs)'}

=== YOUR TASK ===
Generate a structured JSON recounting this quest completion. All text is third-person narration (NO dialogue, no quotes).

1. "recap": An array with EXACTLY ${p.questChain.length} strings. Each string is 2-3 sentences recapping that stage. Name the location, describe what happened there, and why it mattered to the characters. Write like a sharp summary — factual, vivid, no padding.

2. "climax": 5-8 sentences. The final act of this quest. Describe what the player actually DID — the place, the obstacle, how they handled it given who they are. Build tension, then release it. Focus on action and sensory detail, not declarations.

3. "companionReaction": 2-3 sentences. How ${p.companionProfile.name} reacts, consistent with their personality (${p.companionProfile.personalityDesc || p.companionProfile.personality || 'their nature'}) and affection level (${affectionLabel}). Describe what they DO — a gesture, a look, a shift in posture. Not what they "felt deep inside."

4. "reward": { "title": a memorable title for this achievement — sharp and specific, not generic, "description": 3-5 sentences on the concrete consequences: what changed in the world, who gained/lost power, what's different now. Reference specific places, factions, or objects from the worldview. }

5. "epilogue": 3-5 sentences. The characters are STILL at ${p.questChain[p.questChain.length - 1].targetLocationName} — the scene MUST stay in this location. Do NOT teleport them elsewhere or mention traveling to new places. Describe what happens RIGHT HERE, RIGHT NOW: an unresolved thread surfacing, a quiet moment between the two characters, or a new problem revealing itself in this very spot.

6. "affectionDelta": a number 5-15 representing how much this shared experience should boost the companion's affection.

7. "worldviewUpdate": { "full": 3-8 sentences on what PERMANENTLY changed in the world — be specific: which faction, which region, which balance of power shifted and how. A reader should learn new facts about this world from reading this. , "brief": A single concise sentence (under 50 chars) summarizing the key change. }

=== WRITING RULE ===
Write every sentence so that it can ONLY belong to THIS story. If you could copy-paste a sentence into any other fantasy/sci-fi story and it would still fit, that sentence is worthless — delete it and write one that names a specific person, place, or event from this quest. Plain language. Short sentences. No filler. The reader is smart; trust them to feel the weight without you announcing it.

${langInstruction}

Return ONLY a JSON object (no markdown):
{
  "recap": ["stage 1 recap...", "stage 2 recap...", ...],
  "climax": "dramatic final act...",
  "companionReaction": "companion's reaction...",
  "reward": { "title": "achievement title", "description": "world impact..." },
  "epilogue": "forward-looking closing...",
  "affectionDelta": 10,
  "worldviewUpdate": { "full": "detailed world change...", "brief": "one-line summary" }
}`;
}
