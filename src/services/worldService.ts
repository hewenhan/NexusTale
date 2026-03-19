/**
 * worldService — 世界初始化 / 地图生成 / 角色头像 / 加载消息
 */

import * as modelService from './modelService';
import type { WorldData, CharacterProfile } from '../types/game';
import { normalizeConnections } from '../types/game';
import { cleanJsonText } from './jsonRecovery';
import { handleError } from '../lib/errorPolicy';

export interface InitializeWorldResult {
  worldData: WorldData;
  artStylePrompt: string;
  companionProfile: CharacterProfile & { initialAffection?: number };
  playerProfile: CharacterProfile;
}

export async function initializeWorld(
  worldview: string,
  playerProfile: CharacterProfile,
  companionProfile: CharacterProfile,
  language: 'zh' | 'en' = 'zh',
  userInput?: string
): Promise<InitializeWorldResult> {
  const langInstruction = language === 'zh' ? 'All names, descriptions, and character fields MUST be in Chinese.' : 'All content MUST be in English.';
  const userInputSection = userInput ? `\nOriginal User Input (additional context): "${userInput}"` : '';
  const or = (v: string, fallback = 'Not specified (you decide)') => v || fallback;

  const formatCharInfo = (label: string, p: CharacterProfile) => `
  ${label}:
    - Name: ${or(p.name, 'Not specified (invent a fitting one for the worldview)')}
    - Age: ${or(p.age)}
    - Gender: ${or(p.gender)}
    - Orientation: ${or(p.orientation)}
    - Skin Color: ${or(p.skinColor)}
    - Height: ${or(p.height)}
    - Weight/Build: ${or(p.weight)}
    - Personality Description: ${or(p.personalityDesc)}
    - Specialties/Skills: ${or(p.specialties)}
    - Hobbies/Interests: ${or(p.hobbies)}
    - Dislikes: ${or(p.dislikes)}`;

  const prompt = `You are an expert world builder AND character designer for a text adventure RPG.

Worldview: "${worldview}"${userInputSection}

=== STRICT ENUM DICTIONARIES (output MUST be one of these exact values) ===
- gender: "Male" | "Female" | "Non-binary" | "Other"
- orientation: "Heterosexual" | "Homosexual" | "Bisexual" | "Pansexual" | "Asexual" | "Other"
- age: "14-16岁" | "17-19岁" | "20-25岁" | "26-30岁" | "31-40岁" | "41-55岁" | "56岁以上"
- skinColor: "白皙" | "象牙白" | "自然肤色" | "小麦色" | "蜜糖色" | "古铜色" | "棕褐色" | "深棕色" | "黝黑"
- height: "150cm以下" | "150-160cm" | "160-170cm" | "170-175cm" | "175-180cm" | "180-185cm" | "185-190cm" | "190cm以上"
- weight: "纤瘦" | "偏瘦" | "匀称" | "健壮" | "微胖" | "丰满" | "魁梧"
ALL 6 fields above MUST use EXACTLY one of the listed values for BOTH characters, whether user-specified or AI-generated. No synonyms, no rephrasing.

=== CHARACTERS ===
${formatCharInfo('Player Character', playerProfile)}
${formatCharInfo('AI Companion Character', companionProfile)}

=== TASKS (complete ALL in one response) ===

**Task 1: World Topology**
Generate a complete world map with EXACTLY 10 nodes (locations) and multiple houses (buildings) within each node.
Rules:
- Each node: 1-3 houses. Connected graph (every node reachable). Types: "city"/"town"/"village"/"wilderness". House types: "housing"/"shop"/"inn"/"facility". Safety: "safe"/"low"/"medium"/"high"/"deadly".
- Node n1 MUST be a safe starting village/camp. Last few nodes should be increasingly dangerous. Connections should form branching paths, not a straight line.

**Task 2: Art Style Prompt**
Generate a concise English art style prompt describing the ideal illustration style for this world (color palette, rendering technique, lighting, influences). This will be prepended to ALL image generation.

**Task 3: Flesh Out Player Character**
Fill in all "Not specified" fields with creative values fitting the worldview. Keep user-provided values EXACTLY as given — do NOT rephrase or translate them. For the 6 constrained fields (gender, orientation, age, skinColor, height, weight), you MUST pick EXACTLY one value from the STRICT ENUM DICTIONARIES section above — no synonyms allowed, even when generating for an empty field. Generate: name, age, gender, orientation, skinColor, height, weight, hairStyle, hairColor, personalityDesc, specialties, hobbies, dislikes, description, personality, background.
ALSO generate for the player:
- bodyPrompt: PERMANENT physical traits ONLY for image generation consistency (hair color/style, eye color, skin tone, facial features, body type/build, distinguishing marks). NO clothing, NO accessories. This NEVER changes.
- outfitPrompt: Current clothing/accessories/outfit description for image generation (garment types, colors, materials, accessories, footwear). This CAN change as the story progresses.

**Task 4: Flesh Out AI Companion Character**
Same rules as Task 3 (keep user-provided values exactly, constrained fields MUST match STRICT ENUM DICTIONARIES), PLUS generate:
- bodyPrompt: PERMANENT physical traits ONLY for image generation consistency (hair color/style, eye color, skin tone, facial features, body type/build, distinguishing marks). NO clothing, NO accessories. This NEVER changes.
- outfitPrompt: Current clothing/accessories/outfit description for image generation (garment types, colors, materials, accessories, footwear). This CAN change as the story progresses.
- initialAffection: number 0-100 (how warmly they'd feel toward a stranger. Cold/hostile: 10-30. Neutral/cautious: 35-55. Friendly/warm: 55-75. Rarely above 75.)

IMPORTANT: The two characters should feel like they BELONG in this world. Their names, appearances, backgrounds should be consistent with the worldview and with each other's existence in the same universe.

${langInstruction}

Return ONLY a JSON object with this EXACT structure (no markdown):
{
  "worldData": {
    "id": "w1",
    "name": "WorldName",
    "nodes": [
      {
        "id": "n1",
        "name": "Name",
        "type": "village",
        "safetyLevel": "safe",
        "connections": ["n2"],
        "houses": [
          { "id": "h1_1", "name": "HouseName", "type": "facility", "safetyLevel": "safe" }
        ]
      }
    ]
  },
  "artStylePrompt": "A concise English art style description...",
  "playerProfile": {
    "name": "string", "age": "string", "gender": "string", "orientation": "string",
    "skinColor": "string", "height": "string", "weight": "string",
    "hairStyle": "string", "hairColor": "string",
    "personalityDesc": "string", "specialties": "string", "hobbies": "string", "dislikes": "string",
    "description": "string", "personality": "string", "background": "string",
    "bodyPrompt": "string",
    "outfitPrompt": "string"
  },
  "companionProfile": {
    "name": "string", "age": "string", "gender": "string", "orientation": "string",
    "skinColor": "string", "height": "string", "weight": "string",
    "hairStyle": "string", "hairColor": "string",
    "personalityDesc": "string", "specialties": "string", "hobbies": "string", "dislikes": "string",
    "description": "string", "personality": "string", "background": "string",
    "bodyPrompt": "string",
    "outfitPrompt": "string",
    "initialAffection": 50
  }
}`;

  const text = await modelService.generateText('pro', prompt, { jsonMode: true });
  if (!text) throw new Error("Failed to initialize world");

  const cleaned = cleanJsonText(text);
  const parsed = JSON.parse(cleaned);

  if (!parsed.worldData?.nodes || !Array.isArray(parsed.worldData.nodes) || parsed.worldData.nodes.length === 0) {
    throw new Error("Invalid world data structure");
  }

  const normalizedWorld = normalizeConnections(parsed.worldData as WorldData);

  for (const node of normalizedWorld.nodes) {
    node.progress = node.progress ?? 0;
    for (const house of node.houses) {
      house.progress = house.progress ?? 0;
      house.revealed = house.revealed ?? false;
    }
  }

  return {
    worldData: normalizedWorld,
    artStylePrompt: parsed.artStylePrompt || '',
    playerProfile: { ...playerProfile, ...parsed.playerProfile, isFleshedOut: true },
    companionProfile: { ...companionProfile, ...parsed.companionProfile, isFleshedOut: true },
  };
}

export async function fetchCustomLoadingMessages(worldview: string, language: 'zh' | 'en' = 'zh'): Promise<string[]> {
  const langInstruction = language === 'zh' ? 'Translate to Chinese.' : 'Translate to English.';
  const prompt = `
    Current Worldview: "${worldview}"
    
    Task: Generate 50 short, humorous, immersive "loading screen" messages related to this world theme. 
    Examples: "Connecting to neural net...", "Polishing slime...", "Calibrating gravity...". 
    Make them creative and relevant to the specific world theme.
    
    Return ONLY a JSON array of strings. No markdown formatting.
    ${langInstruction}
  `;

  const text = await modelService.generateText('text', prompt, { jsonMode: true, novelty: true });
  if (text) {
    const jsonStr = cleanJsonText(text);
    const messages = JSON.parse(jsonStr);
    if (Array.isArray(messages) && messages.length > 0) {
      return messages;
    }
  }
  throw new Error("Failed to generate loading messages");
}

export async function generateMapImage(worldData: WorldData, worldview: string, artStylePrompt?: string): Promise<string | undefined> {
  const nodeDescriptions = worldData.nodes.map(n => {
    const connNames = n.connections.map(connId => {
      const connNode = worldData.nodes.find(nn => nn.id === connId);
      return connNode?.name || '';
    }).filter(Boolean).join(', ');
    return `${n.name}(${n.type}, 危险度:${n.safetyLevel}) 连接到: ${connNames}`;
  }).join('\n');

  const styleBlock = artStylePrompt
    ? `\n\nMANDATORY ART STYLE (apply this style to the entire illustration):\n${artStylePrompt}`
    : '';

  const prompt = `Generate a highly detailed, top-down RPG world map illustration perfectly adapted to this specific universe:

World Name: "${worldData.name}"
Core Worldview & Lore: "${worldview}"

Geographical Nodes & Connections:
${nodeDescriptions}

Art Style & Rendering Instructions:
1. STRICT AESTHETIC MATCH: The visual style MUST strictly reflect the "Core Worldview". (e.g., If the lore is Sci-Fi, use holographic/neon blueprint aesthetics; if Post-Apocalyptic, use a gritty, weathered survivalist paper style; if Dark Fantasy, use ancient, worn parchment with gothic ink).
2. TOPOLOGY & ICONS: Clearly depict the locations as distinct nodes. Use specific architectural markers based on their types (dense buildings for 'city', scattered structures for 'town/village', terrain hazards/nature for 'wilderness'). 
3. CONNECTIVITY: Draw clear, stylized routes, roads, or paths connecting the connected nodes.
4. VIEWPOINT & VIBE: Bird's-eye view, atmospheric, immersive. Designed as a functional UI map screen for a sandbox RPG. Include stylized map pins/markers for locations.${styleBlock}`;

  try {
    const result = await modelService.generateImage('map', prompt, { aspectRatio: '16:9', size: '2K' });
    if (result.ok) return result.base64;
  } catch (e) {
    handleError('retryable', 'Map image generation failed', e);
  }
  return undefined;
}

export async function generateCharacterPortrait(appearancePrompt: string, worldview: string, artStylePrompt?: string): Promise<string | undefined> {
  const styleBlock = artStylePrompt
    ? `\n\nMANDATORY ART STYLE (apply this style to the portrait):\n${artStylePrompt}`
    : '';

  const prompt = `Generate a high-quality character portrait ID photo (bust shot, facing forward, neutral background).

Character Visual Description: ${appearancePrompt}

World Setting: ${worldview}

Style: Semi-realistic anime/illustration style. Clean lighting, sharp details. The character should look directly at the camera. Background should be simple and non-distracting.${styleBlock}`;

  try {
    const result = await modelService.generateImage('portrait', prompt, { aspectRatio: '1:1', size: '512px' });
    if (result.ok) return result.base64;
  } catch (e) {
    handleError('retryable', 'Character portrait generation failed', e);
  }
  return undefined;
}
