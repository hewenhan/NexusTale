import * as modelService from './modelService';
import type { IntentResult, IntentExtractionResult, ConfuseData, ConfuseCandidate, WorldData, CharacterProfile, NodeData, GameState, InventoryItem, Rarity, SafetyLevel } from '../types/game';
import { normalizeConnections, EQUIPMENT_BUFF_TABLE } from '../types/game';
import { fmtConnectedNodes, fmtVisibleHouses, fmtRecentConversation, getLastIntent, fmtTransitRules, fmtSurvivalInstinct, fmtInventory, fmtCombatInstinct } from './intentHelpers';

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
    console.error("Summary generation failed", e);
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
    console.error("JSON Parse Error:", e);
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
          throw new Error("Failed to parse JSON response from model.");
        }
      } else {
        throw new Error("Failed to parse JSON response from model.");
      }
    } else {
      throw new Error("Invalid JSON format from model.");
    }
  }
  // Unwrap if model returned a single-element array instead of an object
  if (Array.isArray(responseJson) && responseJson.length > 0) {
    responseJson = responseJson[0];
  }
  return responseJson;
}

export const IMAGE_PROHIBITED_SENTINEL = '__PROHIBITED_CONTENT__';

export async function generateImage(finalPrompt: string): Promise<string | undefined> {
  try {
    const result = await modelService.generateImage('image', finalPrompt, { aspectRatio: '9:16', size: '512px' });
    if (result.prohibited) return IMAGE_PROHIBITED_SENTINEL;
    if (result.base64) return result.base64;
  } catch (e) {
    console.error("Image generation failed", e);
  }
  return undefined;
}

export interface InitializeWorldResult {
  worldData: WorldData;
  artStylePrompt: string;
  companionProfile: CharacterProfile & { initialAffection?: number };
  playerProfile: CharacterProfile;
}

/**
 * Unified world initialization: generates world topology, art style, and fleshes out
 * both player and companion profiles in a single PRO_MODEL request.
 */
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

  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate world data
  if (!parsed.worldData?.nodes || !Array.isArray(parsed.worldData.nodes) || parsed.worldData.nodes.length === 0) {
    throw new Error("Invalid world data structure");
  }

  const normalizedWorld = normalizeConnections(parsed.worldData as WorldData);

  // Ensure progress/revealed defaults for newly generated worldData
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
    playerProfile: {
      ...playerProfile,
      ...parsed.playerProfile,
      isFleshedOut: true,
    },
    companionProfile: {
      ...companionProfile,
      ...parsed.companionProfile,
      isFleshedOut: true,
    },
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
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const messages = JSON.parse(jsonStr);
    if (Array.isArray(messages) && messages.length > 0) {
      return messages;
    }
  }
  throw new Error("Failed to generate loading messages");
}

/**
 * 生成装备预设池：25 武器 + 25 防具（每稀有度各 5 件）
 * buff 值来自 EQUIPMENT_BUFF_TABLE
 */
export async function generateEquipmentPresets(
  worldview: string,
  language: 'zh' | 'en' = 'zh'
): Promise<InventoryItem[]> {
  const langInstruction = language === 'zh' ? 'All names and descriptions MUST be in Chinese.' : 'All content MUST be in English.';
  const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  const prompt = `You are an expert RPG item designer.

Worldview: "${worldview}"

Generate equipment items for this world. You need to create:
- 25 WEAPONS (5 per rarity tier)
- 25 ARMOR pieces (5 per rarity tier)

Rarity tiers: common, uncommon, rare, epic, legendary

For each item, provide:
- name: A creative, worldview-fitting name
- description: A short 1-sentence description of the item's lore/appearance
- icon: A single emoji that represents the weapon or armor piece

IMPORTANT: Items must feel like they belong in this specific world. A cyberpunk world should have plasma rifles and nano-armor, not medieval swords.

${langInstruction}

Return ONLY a JSON object with this structure (no markdown):
{
  "weapons": {
    "common": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "uncommon": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "rare": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "epic": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "legendary": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items]
  },
  "armors": {
    "common": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "uncommon": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "rare": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "epic": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "legendary": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items]
  }
}`;

  const text = await modelService.generateText('text', prompt, { jsonMode: true, novelty: true });
  if (!text) throw new Error('Failed to generate equipment presets');

  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  const items: InventoryItem[] = [];
  let idCounter = 0;

  for (const equipType of ['weapons', 'armors'] as const) {
    const itemType: 'weapon' | 'armor' = equipType === 'weapons' ? 'weapon' : 'armor';
    for (const rarity of rarities) {
      const buffValues = EQUIPMENT_BUFF_TABLE[rarity];
      const rawItems = parsed[equipType]?.[rarity] || [];
      for (let i = 0; i < Math.min(5, rawItems.length); i++) {
        const raw = rawItems[i];
        items.push({
          id: `eq_${itemType}_${rarity}_${idCounter++}`,
          name: raw.name || `Unknown ${itemType}`,
          type: itemType,
          description: raw.description || '',
          rarity,
          icon: raw.icon || (itemType === 'weapon' ? '⚔️' : '🛡️'),
          quantity: 1,
          buff: buffValues[i] ?? buffValues[0],
        });
      }
    }
  }

  return items;
}

/**
 * 生成任务链（3-5 环）+ 每环所需道具
 */
export async function generateQuestChain(
  worldview: string,
  worldData: WorldData,
  currentNodeId: string,
  language: 'zh' | 'en' = 'zh'
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

  const prompt = `You are a quest designer for an RPG text adventure.

Worldview: "${worldview}"

The player needs a quest chain with ${targetLocations.length} stages. For each stage, the player must travel to a specific location and use the correct quest item there.

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

  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
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
 * 任务完成旁白：由 AI 生成一段颁奖式的任务完成叙述
 */
export async function generateQuestCompletionNarration(
  worldview: string,
  questDescription: string,
  companionName: string,
  language: 'zh' | 'en' = 'zh'
): Promise<string> {
  const langInstruction = language === 'zh' ? '用中文回复。' : 'Reply in English.';
  const prompt = `You are the narrator of an RPG text adventure. The player and their companion ${companionName} have just completed a multi-stage quest chain.

Worldview: "${worldview}"
Completed Quest: "${questDescription}"

Write a short (2-3 sentences), dramatic, third-person narrator passage celebrating the completion of this quest chain. Be poetic but concise. Do NOT use dialogue — it's pure narration.

${langInstruction}

Return ONLY the narrator text, no JSON, no markdown.`;

  try {
    const text = await modelService.generateText('text', prompt, { novelty: true });
    return text?.trim() || '任务链已完成。新的冒险即将开始。';
  } catch (e) {
    console.error('Quest completion narration failed:', e);
    return '任务链已完成。新的冒险即将开始。';
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

  const prompt = `你是一个顶级文本冒险游戏的 DM (地下城主)。
抛弃一切机械式的规则匹配、IF-ELSE判断和关键字绑定！
你的唯一任务是：基于当前世界的氛围（和平、无聊或生死危机），像真正的人类一样，看破玩家花哨的表层动作，直击其背后的【真实动机】。

**当前世界状态:**
- 当前位置: 节点 "${state.currentNodeId!}", 室内 "${state.currentHouseId || 'outdoors'}"
- 相连节点: ${fmtConnectedNodes(state)}, current_objective (任务目标)
- 可见室内: ${fmtVisibleHouses(state)}
- 当前目标: ${state.currentObjective?.description || '无'}
- 可使用物品: ${fmtInventory(state)}

${fmtTransitRules(state)}

**近期上下文 (用于感知当前氛围是和平、无聊还是生死危机):**
${true && fmtRecentConversation(state) ? fmtRecentConversation(state) : ''}
${false && fmtSurvivalInstinct(state) ? fmtSurvivalInstinct(state) : ''}
${false && fmtCombatInstinct(state) ? fmtCombatInstinct(state) : ''}

**系统支持的 7 种核心意图 (原汁原味的概念定义):**
- idle: 闲聊
- explore: 探索/搜刮
- use_item: 使用背包物品
- seek_quest: 如果玩家看起来极度无聊/要找点事儿干
- combat: 对抗危机的行为，可能是闪转腾挪，等待寻找攻击位置，伺机而动都可以
- move: 空间移动需求，战斗时的危机撤退行为
- suicidal_idle: 危机时刻的发呆行为，类似危险关头还在说笑，闲聊

**DM 的裁决哲学 (如何保持自信与怀疑):**
1. 【情境张力法则】：永远把动作放进“氛围”里去衡量！在激烈的战斗/高危上下文中，玩家去“摸、拽、打开”危险源或怪物，这往往不是平静的 explore，而是带有极高风险的暴力互动或终结技(combat)！
2. 【合理的极度自信】：只有当玩家的动机与当前的氛围【完全吻合且毫无杂念】时，才极度自信（例如：平时纯跑路就是 move；打架时纯挥拳就是 combat；闲着没事纯翻垃圾桶就是 explore）。
3. 【必须触发 Confuse 的红线】：如果当前是高危/战斗上下文，而玩家的动作在字面上却像是在“和平探索(explore)”、“随意走动(move)”或“闲聊(idle)”，这种【氛围与动作的错位】往往意味着动机撕裂！你必须触发 confuse.sure = true，并诚实地给出 combat 与其他意图的权重对比！

=== 玩家输入 ===
"${userInput}"

请只输出纯 JSON，不要带 markdown 标记：
{
  "intent": "<从上述 7 种分类中选择最核心的一个>",
  "targetId": "<确切的 ID，无则填 null>",
  "direction": "<'forward', 'back', 或 null>",
  "itemId": "<确切的 ID，无则填 null>",
  "confuse": {
    "sure": <只要核心动机清晰唯一就填 false；若遇到诉求撕裂、严重歧义、表意破碎，填 true>,
    "reason": "<如果 sure 为 true，用人类大白话解释动机哪里冲突了；否则填 null>",
    "type":[{
      "confidence": <0到1之间的置信度>,
      "intent": "<可能的意图>",
      "targetId": "<ID 或 null>",
      "direction": "<方向 或 null>",
      "itemId": "<ID 或 null>"
    }]
  }
}`;

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

/**
 * Generate a world map image based on the topology data.
 * Returns base64-encoded PNG data.
 */
export async function generateMapImage(worldData: WorldData, worldview: string, artStylePrompt?: string): Promise<string | undefined> {
  // 只保留有意义的名称和类型信息，去掉 n1, h1 等抽象 ID
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
    if (result.base64) return result.base64;
  } catch (e) {
    console.error("Map image generation failed", e);
  }
  return undefined;
}

/**
 * Generate a 1:1 512px portrait photo for the AI character.
 */
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
    if (result.base64) return result.base64;
  } catch (e) {
    console.error("Character portrait generation failed", e);
  }
  return undefined;
}
