import { ai, TEXT_MODEL, PRO_MODEL, PRO_IMAGE_MODEL, IMAGE_MODEL, LITE_MODEL } from '../lib/gemini';
import { HarmCategory, HarmBlockThreshold } from '@google/genai';
import type { IntentResult, WorldData, CharacterProfile } from '../types/game';
import { normalizeConnections } from '../types/game';

export async function generateSummary(currentSummary: string, messagesToSummarize: any[], language: 'zh' | 'en' = 'zh'): Promise<string | undefined> {
  const textToSummarize = messagesToSummarize.map(m => `${m.role}: ${m.text}`).join('\n');
  const langInstruction = language === 'zh' ? 'Translate to Chinese.' : 'Translate to English.';
  const summaryPrompt = `
    Current Summary: "${currentSummary}"
    
    New Conversation to Append:
    ${textToSummarize}
    
    Task: Update the summary to include the key events from the new conversation. Keep it concise but retain important plot points, inventory changes, and current status.
    Return ONLY the new summary text.
    ${langInstruction}
  `;

  try {
    const summaryResult = await ai.models.generateContent({
      model: TEXT_MODEL,
      contents: [{ role: 'user', parts: [{ text: summaryPrompt }] }]
    });
    return summaryResult.text;
  } catch (e) {
    console.error("Summary generation failed", e);
    return undefined;
  }
}

export async function generateTurn(fullPrompt: string): Promise<any> {
  const textResult = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
    config: {
      responseMimeType: 'application/json',
      
      // ⬇️ ====== 首席架构师的炼丹参数区 ====== ⬇️
      
      // 1. 创造力控制 (Temperature)：默认通常是 0.7 左右。
      // 调到 0.85 ~ 0.9 是跑团游戏的甜点区。文案会变得极其生动、比喻丰富，
      // 但又没有高到让它胡言乱语或者破坏 JSON 结构的程度。
      temperature: 0.85, 

      // 2. 逻辑兜底 (Top-P)：核采样。
      // 限制模型只能从累计概率达到 0.9 的候选词中选择。
      // 作用：配合较高的 temperature，它能“砍掉最离谱/不合逻辑的废话”，保证剧情发展不脱轨。
      topP: 0.9,

      // 3. 词汇多样性 (Top-K)：
      // 扩大候选词汇库（默认通常是 40）。调高到 60 能让 AI 使用更罕见、更具文学性的词汇，
      // 比如用“逼仄”代替“狭窄”，用“斑驳”代替“破旧”，大幅提升文本的高级感。
      topK: 60,

      // 4. 话题推进引擎 (Presence Penalty - 存在惩罚)：0.0 到 2.0
      // 设置为 0.3 可以轻微惩罚已经出现过的话题。
      // 作用：逼迫 AI 推进剧情，引导它发现新事物，而不是一直跟你扯皮“这里很危险”。
      // presencePenalty: 0.3,

      // 5. 反复读机神器 (Frequency Penalty - 频率惩罚)：0.0 到 2.0
      // 极其关键！跑团游戏最怕 AI 词穷（比如动不动就“空气中弥漫着XX”）。
      // 设置为 0.4 会惩罚它用过的形容词，逼它换个说法，完美配合咱们之前的“防雷同”策略！
      // frequencyPenalty: 0.4,
      safetySettings: [
        {
          category: HarmCategory.HARM_CATEGORY_HARASSMENT,
          threshold: HarmBlockThreshold.OFF
        },
        {
          category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
          threshold: HarmBlockThreshold.OFF
        },
        {
          category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
          threshold: HarmBlockThreshold.OFF
        },
        {
          category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
          threshold: HarmBlockThreshold.OFF
        },
      ]
    }
  });

  const responseText = textResult.text;
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
  return responseJson;
}

export const IMAGE_PROHIBITED_SENTINEL = '__PROHIBITED_CONTENT__';

export async function generateImage(imagePrompt: string, artStylePrompt?: string, physicalTraitsLock?: string): Promise<string | undefined> {
  // Prepend locked physical traits to ensure character consistency
const traitPrefix = physicalTraitsLock
    ? `### SUBJECT CHARACTER (The Companion - [COMPANION]) ###\nAppearance: ${physicalTraitsLock}\n\n`
    : '';
  const finalPrompt = `
    ${traitPrefix}
    ### SCENE DESCRIPTION ###
    ${imagePrompt} (Note: Whenever the companion appears, use the reference [COMPANION])
    ### MANDATORY ART STYLE ###
    ${artStylePrompt}
    `.trim();

  try {
    const imageResult = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: finalPrompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "9:16",
          imageSize: "512px"
        },
        safetySettings: [
          {
            category: HarmCategory.HARM_CATEGORY_HARASSMENT,
            threshold: HarmBlockThreshold.OFF
          },
          {
            category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
            threshold: HarmBlockThreshold.OFF
          },
          {
            category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
            threshold: HarmBlockThreshold.OFF
          },
          {
            category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
            threshold: HarmBlockThreshold.OFF
          },
        ]
      }
    });

    const finishReason = imageResult.candidates?.[0]?.finishReason;
    if (finishReason === 'PROHIBITED_CONTENT') {
      console.error('Image generation blocked: PROHIBITED_CONTENT', imageResult.candidates?.[0]?.finishMessage);
      return IMAGE_PROHIBITED_SENTINEL;
    }

    for (const part of imageResult.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
  } catch (e) {
    console.error("Image generation failed", e);
  }
  return undefined;
}

export async function fleshOutProfile(worldview: string, profile: CharacterProfile, language: 'zh' | 'en' = 'zh'): Promise<CharacterProfile & { initialAffection?: number }> {
  const langInstruction = language === 'zh' ? 'Translate all content to Chinese.' : 'Translate all content to English.';
  const or = (v: string, fallback = 'Not specified (you decide)') => v || fallback;

  const prompt = `
    You are an expert character designer for a roleplay game.
    
    Worldview: "${worldview}"
    Character Info:
    - Name: ${or(profile.name, 'Not specified (invent a fitting one for the worldview)')}
    - Age: ${or(profile.age)}
    - Gender: ${or(profile.gender)}
    - Orientation: ${or(profile.orientation)}
    - Skin Color: ${or(profile.skinColor)}
    - Height: ${or(profile.height)}
    - Weight/Build: ${or(profile.weight)}
    - Personality Description: ${or(profile.personalityDesc)}
    - Specialties/Skills: ${or(profile.specialties)}
    - Hobbies/Interests: ${or(profile.hobbies)}
    - Dislikes: ${or(profile.dislikes)}
    
    Task: Flesh out this character to fit perfectly into the worldview. If any fields are "Not specified", use your creativity to invent appropriate values that fit the worldview. Keep all user-provided values and expand upon them.
    
    Return ONLY a JSON object with ALL fields filled:
    {
      "name": "string",
      "age": "string (e.g. '24岁')",
      "gender": "string",
      "orientation": "string",
      "skinColor": "string",
      "height": "string",
      "weight": "string",
      "hairStyle": "string (specific, e.g. 'long wavy hair', 'short pixie cut')",
      "hairColor": "string (specific, e.g. 'jet black', 'platinum blonde')",
      "personalityDesc": "string (brief personality summary from user, expand if provided)",
      "specialties": "string (practical skills, combat abilities. Expand user input if provided.)",
      "hobbies": "string (leisure interests. Expand user input if provided.)",
      "dislikes": "string (things they hate. Expand user input if provided.)",
      "description": "string (a short summary of who they are)",
      "personality": "string (detailed traits, quirks, how they act)",
      "background": "string (past experiences, how they got here)",
      "appearancePrompt": "string (DETAILED, STABLE visual description for image generation. Include: hair color/style, eye color, skin tone, facial features, body type, clothing with colors/materials, accessories. Physical traits MUST appear at the VERY BEGINNING and match exactly.)",
      "initialAffection": "number 0-100 (how warmly this character would initially feel toward a stranger. Cold/hostile: 10-30. Neutral/cautious: 35-55. Friendly/warm: 55-75. Rarely above 75.)"
    }
    
    ${langInstruction}
    No markdown formatting.
  `;
  
  const result = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  const text = result.text;
  if (text) {
    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const filled = JSON.parse(jsonStr);
    return {
      ...profile,
      ...filled,
      isFleshedOut: true,
    };
  }
  throw new Error("Failed to flesh out character profile");
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
  
  const result = await ai.models.generateContent({
    model: TEXT_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }]
  });

  const text = result.text;
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
 * Step 1 of the two-step pipeline: Intent Router.
 * Uses a fast model to classify the user's action into an intent category.
 */
export async function extractIntent(
  userInput: string,
  currentNodeId: string,
  currentHouseId: string | null,
  visibleContext: string,
  connectedNodesInfo: string,
  visibleHousesInfo: string,
  currentObjectiveDesc: string | null,
  recentConversation: string,
  language: 'zh' | 'en' = 'zh',
  tensionLevel: number = 0,
  lastIntent: string | null = null,
  transitInfo: { fromName: string; toName: string; progress: number } | null = null
): Promise<IntentResult> {
  // BUG2: 求生本能（Survival Instinct）强制法则
  const survivalInstinctRule = tensionLevel >= 2
    ? `\n\n【求生本能 (Survival Instinct) - 绝对强制法则】：
当前紧张度 = ${tensionLevel}（${tensionLevel >= 3 ? '极度危险' : '危险'}状态）！上一次意图：${lastIntent || '无'}。
在 Tension >= 2 的危险状态下，玩家任何带有情绪宣泄、恐慌、反抗、惊叫、咒骂、呐喊的文本（如"卧槽！"、"你这怪物别碰我！"、"啊啊啊"、"救命"、"滚开"等），哪怕没有明确的动作动词，都必须被归类为 "combat"（挣扎求生）。
只有当玩家极其明确地表示放弃抵抗（如"我放弃了"、"我坐下等死"、"我不动了"、"随便吧"）时，才能判定为 "idle"。
任何模糊的、情绪化的、带有求生本能的表达 → 强制归类为 "combat"。`
    : '';

  const transitContext = transitInfo
    ? `\n\n【旅途状态 (TRANSIT STATE)】：玩家当前正在赶路中！从【${transitInfo.fromName}】前往【${transitInfo.toName}】，路程进度 ${transitInfo.progress}%。
在旅途中，如果玩家表达想回去、折返、掉头、返回出发地等意图（如"回去"、"掉头"、"不去了"、"折返"、"turn back"、"go back"），必须判定为 intent="move" 且 direction="back"。
如果玩家表达继续赶路、加快脚步、继续前进等，或者进行闲聊/互动，则 direction="forward"。`
    : '';

  const prompt = `You are an intent classifier for a text adventure game. Classify the player's action into ONE intent category based on the current state AND the full conversation history.

**Current State & Context:**
Current Location: Node "${currentNodeId}", House "${currentHouseId || 'outdoors'}"
Connected Nodes: ${connectedNodesInfo}
Visible Houses (in current node): ${visibleHousesInfo || 'None'}
Current Objective: ${currentObjectiveDesc || 'None'}
Transit State: ${transitContext ? `ACTIVE: Player is traveling. Progress: ${transitContext.match(/路程进度 (\d+%)/)[1]}.` : 'INACTIVE'}
Recent Conversation History (CRITICAL for continuity):
${recentConversation || 'No prior conversation.'}

**TRANSIT STATE SPECIAL RULE (If Active):**
If the player is in a Transit State and expresses intent to "go back", "turn around", "return to origin" (or synonyms), you MUST classify as intent="move" AND direction="back". **CRITICALLY, if the player explicitly names the *origin node* of the current transit (here: 西都/n2) as the new destination, this is considered a return action, and you MUST use direction="back", unless the language is clearly accelerating away from the origin.** Otherwise (chatting, or explicitly continuing towards the *current* objective), direction defaults to "forward".

**Intent Categories & Priority:**
1. "seek_quest": Travel to any MACRO-DESTINATION NOT listed in Connected Nodes/Visible Houses. (HIGHEST PRIORITY, overrides chat/idle).
2. "move": Travel ONLY to a destination explicitly listed in Connected Nodes/Visible Houses.
3. "explore": Actively searching/investigating the current area.
4. "idle": Roleplaying, resting, chatting *unless* it contains a travel request (which triggers #1 or #2).
5. "combat"/"suicidal_idle": As applicable.

=== EXAMPLES (Learn from these: focus on how context shapes the final intent) ===
Example 1: (Context implies travel intent)
...
Player Input: "天快亮了，再去网吧验证咱们的赌局我就睡着啦！"
Output: {"intent": "seek_quest", "targetId": null}
...

=== REAL TASK ===
Player Input: "${userInput}"

Return ONLY a trimmed JSON object: { "intent": "...", "targetId": "...", "direction": "..." }
IMPORTANT: targetId must be null if not applicable. If Transit State is ACTIVE, "direction" is REQUIRED.
No markdown formatting.`;

  const result = await ai.models.generateContent({
    model: LITE_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });

  const text = result.text;
  if (!text) return { intent: 'idle', targetId: null };

  try {
    const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest'];
    if (validIntents.includes(parsed.intent)) {
      const direction = parsed.direction === 'back' ? 'back' as const : parsed.direction === 'forward' ? 'forward' as const : undefined;
      return { intent: parsed.intent, targetId: parsed.targetId || null, direction };
    }
  } catch (e) {
    console.error("Intent extraction parse error, attempting regex fallback", e);
    // Regex fallback: extract first {...} block
    const braceMatch = text.match(/\{[^}]*\}/);
    if (braceMatch) {
      try {
        const fallbackParsed = JSON.parse(braceMatch[0]);
        const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest'];
        if (validIntents.includes(fallbackParsed.intent)) {
          const direction = fallbackParsed.direction === 'back' ? 'back' as const : fallbackParsed.direction === 'forward' ? 'forward' as const : undefined;
          return { intent: fallbackParsed.intent, targetId: fallbackParsed.targetId || null, direction };
        }
      } catch (e2) {
        console.error("Regex fallback also failed", e2);
      }
    }
    // Last resort: return lastIntent if available
    if (lastIntent) {
      const validIntents = ['idle', 'explore', 'combat', 'suicidal_idle', 'move', 'seek_quest'];
      if (validIntents.includes(lastIntent)) {
        console.warn("Using lastIntent as fallback:", lastIntent);
        return { intent: lastIntent as IntentResult['intent'], targetId: null };
      }
    }
  }
  return { intent: 'idle', targetId: null };
}

/**
 * Phase 0: Generate complete world topology data (10 nodes with houses).
 * Called once during game initialization.
 */
export async function generateWorldData(worldview: string, language: 'zh' | 'en' = 'zh', userInput?: string): Promise<{ worldData: WorldData; artStylePrompt: string }> {
  const langInstruction = language === 'zh' ? 'All names and descriptions MUST be in Chinese.' : 'All names and descriptions MUST be in English.';
  const userInputSection = userInput ? `\n\nOriginal User Input (use this as additional context for more accurate world building): "${userInput}"` : '';
  const prompt = `You are an expert world builder for a text adventure RPG.

Worldview: "${worldview}"${userInputSection}

Task: Generate a complete topology map for this world with EXACTLY 10 nodes (locations) and multiple houses (buildings/places) within each node.

RULES:
- Each node must have 1-3 houses.
- Nodes must form a connected graph (every node reachable from every other node via connections).
- Node types: "city", "town", "village", "wilderness"
- House types: "housing", "shop", "inn", "facility"
- Safety levels: "safe", "low", "medium", "high", "deadly"
- The first node (n1) MUST be a safe starting village/camp.
- The last few nodes should be increasingly dangerous (high/deadly).
- Connections should form a branching path, not a straight line.

ADDITIONAL TASK - Art Style Prompt:
Based on the worldview, generate a short but precise "art style prompt" (in English) that describes the ideal illustration style for this world. This prompt will be prepended to ALL image generation requests (maps, character portraits, scene illustrations) to ensure a unified visual style throughout the game.
Consider: color palette, rendering technique (e.g., watercolor, cel-shaded, oil painting, pixel art, digital painting), lighting mood, level of detail, art influences or references.
Example: "Dark gothic oil painting style, muted desaturated colors with deep crimson accents, dramatic chiaroscuro lighting, intricate pen-and-ink linework, reminiscent of Berserk manga and Castlevania concept art"

${langInstruction}

Return ONLY a JSON object with this EXACT structure (no markdown):
{
  "id": "w1",
  "name": "WorldName",
  "artStylePrompt": "A concise English art style description for unified visual generation...",
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
}`;

  const result = await ai.models.generateContent({
    model: PRO_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseMimeType: 'application/json' }
  });

  const text = result.text;
  if (!text) throw new Error("Failed to generate world data");

  const cleaned = text.replace(/```json/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(cleaned);

  // Validate basic structure
  if (!parsed.nodes || !Array.isArray(parsed.nodes) || parsed.nodes.length === 0) {
    throw new Error("Invalid world data structure");
  }

  // Extract artStylePrompt and return it separately
  const artStylePrompt: string = parsed.artStylePrompt || '';
  delete parsed.artStylePrompt;

  // 归一化双向连接（AI 可能只生成单向连接）
  const normalized = normalizeConnections(parsed as WorldData);

  return { worldData: normalized, artStylePrompt };
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
    const imageResult = await ai.models.generateContent({
      model: PRO_IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "16:9",
          imageSize: "2K"
        }
      }
    });

    for (const part of imageResult.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
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
    const imageResult = await ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        imageConfig: {
          aspectRatio: "1:1",
          imageSize: "512px"
        },
        safetySettings: [
          { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
          { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
        ]
      }
    });

    for (const part of imageResult.candidates?.[0]?.content?.parts || []) {
      if (part.inlineData) {
        return part.inlineData.data;
      }
    }
  } catch (e) {
    console.error("Character portrait generation failed", e);
  }
  return undefined;
}
