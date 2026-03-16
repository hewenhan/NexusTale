/**
 * Module 5: 组装 LLM Story Renderer 的完整 prompt
 */

import { findNode, findHouse, getVisibleHouses, getHpDescription, applyProgressAndReveals } from '../../lib/pipeline';
import { KEEP_RECENT_TURNS, INVENTORY_CAPACITY, type GameState } from '../../types/game';
import { getModelName } from '../../types/modelConfig';
import type { PipelineResult } from '../../lib/pipeline';
import { getStartIndexForRecentTurns, getLastSceneVisuals } from './helpers';

// ── 构建位置上下文 ──
function buildLocationContext(state: GameState, resolution: PipelineResult, visionContext: string): string {
  if (resolution.newTransitState) {
    const fromNode = findNode(state, resolution.newTransitState.fromNodeId);
    const toNode = findNode(state, resolution.newTransitState.toNodeId);
    return `【当前位置】：正在从【${fromNode?.name || resolution.newTransitState.fromNodeId}】赶往【${toNode?.name || resolution.newTransitState.toNodeId}】。(当前路程进度：${resolution.newTransitState.pathProgress}%)。${resolution.newTensionLevel >= 2 ? '请侧重描写沿途遭遇的危险和冲突。' : '请结合上下文世界观和角色性格或经历发表互动和思考，不要凭空制造危险。'}`;
  }

  // 用 applyProgressAndReveals 模拟更新后的 worldData 以获取最新的 revealed 状态
  const updatedWorldData = state.worldData
    ? applyProgressAndReveals(state.worldData, resolution.newProgressMap, resolution.houseSafetyUpdate)
    : null;
  const updatedNode = updatedWorldData?.nodes.find(n => n.id === resolution.newNodeId);
  if (updatedNode) {
    const visHouses = getVisibleHouses(updatedNode);
    const hStr = visHouses.length > 0
      ? visHouses.map(h => `${h.name}(${h.type})`).join(', ')
      : '尚未发现可互动的建筑';
    const updatedHouse = findHouse(updatedNode, resolution.newHouseId);
    if (updatedHouse) {
      return `【当前位置】：室内搜刮。当前正位于【${updatedNode.name}】的微观建筑【${updatedHouse.name}】内部。已揭盲可互动的微观建筑: ${hStr}。请侧重描写室内的空间感、物资或幽闭的环境。`;
    }
    return `【当前位置】：街区/野外。正处于【${updatedNode.name}】的宏观区域。已揭盲可互动的微观建筑: ${hStr}。可看到周围的建筑。`;
  }

  return `【当前位置】：${visionContext}`;
}

// ── 构建进度标签 ──
function buildProgressLabel(resolution: PipelineResult): string {
  const activeProgressKey = resolution.newHouseId
    ? `house_${resolution.newHouseId}`
    : (resolution.newTransitState ? 'transit' : `node_${resolution.newNodeId}`);

  const currentProgress = resolution.newTransitState
    ? resolution.newTransitState.pathProgress
    : (resolution.newProgressMap[activeProgressKey] || 0);

  if (resolution.newTransitState) return `当前徒步赶路进度: ${currentProgress}%`;
  if (resolution.newHouseId) return `当前室内搜刮进度: ${currentProgress}%`;
  return `当前区域建筑发现进度: ${currentProgress}%`;
}

// ── 动态记忆锁：旅途主题指令 (重构版：物理与世俗体验引擎) ──
function buildThemeInstruction(state: GameState, resolution: PipelineResult): string {
  if (!resolution.newTransitState) return '';

  const isHighTension = resolution.newTensionLevel >= 2;
  
  // 核心重构：彻底剥离题材限制，完全基于"物理反馈"与"降维吐槽"
  const objectiveHint = state.currentObjective
    ? `\n[路途焦点]：目标是【${state.currentObjective.description}】。距离还很远，绝对禁止在此刻讨论战术或抵达后的行动！请将互动完全沉降到"赶路的物理体验"上，偶尔对这个目标给出一两句极度世俗、充满个人偏见或敷衍的吐槽。`
    : `\n[路途焦点]：漫长枯燥的赶路中。请将注意力完全放在"当前的物理感官体验"与极度日常的琐碎闲聊上。`; 

  if (!state.transitState?.lockedTheme) {
    // 新旅途
    const blacklist = state.exhaustedThemes.length > 0
      ? state.exhaustedThemes.join('、')
      : '无';
      
    if (isHighTension) {
      return `\n【系统强制 - 突发遭遇】：玩家踏上新旅途（高紧张度）。请凭空创造一个符合当前世界观的真实物理阻碍或危机。\n[避雷针]：绝不能出现这些已历经的遭遇：${blacklist}。\n必须在 encounter_tag 中用2-4个字概括本次危机。`;
    }
    return `\n【系统指令 - 旅途渲染】：当前是安全的赶路阶段（紧张度=${resolution.newTensionLevel}）。${objectiveHint}\n**[绝对法则]：绝不可凭空制造任何危机或袭击！**\n如果需要 encounter_tag，请填写环境/氛围相关的词汇。已用过的主题避开：${blacklist}。`; 
  }

  // 延续旅途：锁定主题
  if (isHighTension) {
    return `\n[强制剧本提示：继续赶路。当前路段的核心危机/阻碍已锁定为【${state.transitState.lockedTheme}】，请务必围绕该物理阻碍连贯描写，绝不可切换成其他毫不相干的事件！]`;
  }
  return `\n[旅途剧本提示：继续赶路。当前路段的物理环境已锁定为【${state.transitState.lockedTheme}】，请连贯描写（偶尔描述环境流转）。${objectiveHint}\n**[绝对法则]：绝不可凭空制造危机，维持安全赶路氛围。**]`;
}

// ── 角色设定字符串 ──
function buildCharacterRoleString(state: GameState): string {
  const cp = state.companionProfile;
  return [
    `Name: ${cp.name}`, `Gender: ${cp.gender}`, `Age: ${cp.age}`,
    `Orientation: ${cp.orientation}`,
    `Appearance: Skin=${cp.skinColor}, Height=${cp.height}, Build=${cp.weight}, Hair=${cp.hairStyle} ${cp.hairColor}`,
    `PersonalityDesc: ${cp.personalityDesc}`,
    `Description: ${cp.description}`, `Personality: ${cp.personality}`,
    `Background: ${cp.background}`,
    `Specialties: ${cp.specialties}`, `Hobbies: ${cp.hobbies}`, `Dislikes: ${cp.dislikes}`,
  ].join('\n');
}

// ── 背包与任务链上下文 ──
function buildInventoryAndQuestContext(state: GameState): string {
  const parts: string[] = [];

  // Inventory summary
  if (state.inventory.length > 0) {
    const items = state.inventory.map(i => {
      let label = `${i.icon} ${i.name}(${i.type}`;
      if (i.buff) label += `, buff:${i.buff}%`;
      label += ')';
      return label;
    }).join(', ');
    parts.push(`背包(${state.inventory.length}/${INVENTORY_CAPACITY}): ${items}`);
  } else {
    parts.push(`背包: 空(${INVENTORY_CAPACITY}格)`);
  }

  // Quest chain status
  if (state.questChain && state.questChain.length > 0) {
    const currentStage = state.questChain[state.currentQuestStageIndex];
    const totalStages = state.questChain.length;
    const completedCount = state.questChain.filter(s => s.completed).length;
    let nextStage = null;

    if (completedCount < totalStages) {
      nextStage = state.questChain[completedCount];
    }
    parts.push(`任务链进度: ${completedCount}/${totalStages}环`);
    if (currentStage && !currentStage.completed) {
      parts.push(`当前任务: ${currentStage.description}`);
      const neededItems = currentStage.requiredItems.map(ri => ri.name).join(', ');
      if (neededItems) parts.push(`所需道具: ${neededItems}`);
      if (nextStage) {
        parts.push(`下一环目标: ${nextStage.description}`);
        const nextNeededItems = nextStage.requiredItems.map(ri => ri.name).join(', ');
        if (nextNeededItems) parts.push(`下一环所需道具: ${nextNeededItems}`);
      }
    }
  }

  return parts.join('\n- ');
}

// ── 主函数 ──

export interface StoryPromptInput {
  state: GameState;
  resolution: PipelineResult;
  currentSummary: string;
  userInput: string;
  visionContext: string;
  /** 搜刮结果叙事指令（命中/未命中均有文案），由调用方预生成 */
  itemDropInstruction?: string | null;
  /** 是否期望 AI 在 get_item 字段返回道具信息 */
  expectGetItem?: boolean;
  /** 由 narrativeAssembler + 调用方覆盖后得到的最终叙事指令 */
  narrativeInstruction: string;
}

export function buildStoryPrompt(input: StoryPromptInput): string {
  const { state, resolution, currentSummary, userInput, visionContext, itemDropInstruction, expectGetItem, narrativeInstruction } = input;

  const locationContext = buildLocationContext(state, resolution, visionContext);
  const progressLabel = buildProgressLabel(resolution);
  const themeInstruction = buildThemeInstruction(state, resolution);
  const characterRoleString = buildCharacterRoleString(state);
  const inventoryAndQuestContext = buildInventoryAndQuestContext(state);

  const lastVisuals = getLastSceneVisuals(state);

  // ── Build recent history text ──
  const allMessagesForPrompt = [...state.history, { role: 'user', text: userInput } as const];
  const promptStartIndex = getStartIndexForRecentTurns(allMessagesForPrompt, KEEP_RECENT_TURNS);
  const recentHistory = allMessagesForPrompt.slice(promptStartIndex);
  const historyText = recentHistory.map(m => `${m.role}: ${m.text}`).join('\n');

  const systemPrompt = `你是本引擎的沉浸式图文渲染节点。你的唯一目标是执行【既定事实】，并进行极度拟真的"人类行为学"渲染。
无论当前是什么题材、什么世界观，你必须将角色还原为受制于"物理法则"和"生物本能"的活物。

=== 扮演对象 (AI) ===
${characterRoleString}

=== 互动对象 (Player) ===
姓名: ${state.playerProfile.name} | 性别: ${state.playerProfile.gender} | 年龄: ${state.playerProfile.age}
外貌: ${state.playerProfile.skinColor}, ${state.playerProfile.height}, ${state.playerProfile.weight}, ${state.playerProfile.hairStyle} ${state.playerProfile.hairColor}
性格: ${state.playerProfile.personalityDesc}
特长: ${state.playerProfile.specialties} | 厌恶: ${state.playerProfile.dislikes}

=== 物理环境与状态 ===
世界观: ${state.worldview}
绝对位置: ${locationContext}
自身健康: ${getHpDescription(resolution.newHp)}（HP: ${resolution.newHp}/100）
紧张等级: ${resolution.newTensionLevel}（0平和, 1探索, 2冲突, 3危机, 4死斗）
对玩家好感: ${state.affection}/100
进度锁: ${progressLabel} | ${inventoryAndQuestContext}
（⚠️揭盲锁：进度未满100%绝不可描写探索完毕）

上一场视觉: "${lastVisuals}"
当前故事摘要: "${currentSummary}"

=== 🧠 THE "HUMAN" BEHAVIORAL ENGINE (泛用人类心理学引擎) ===[1. 生理本能优先原则 (Biological Supremacy)]
- 降维感知：第一反应永远是"生理感官"（温度、气味、痛觉等），而非逻辑分析。
- 设定内化：严禁将特长/职业作为台词说出。必须转化为下意识的肢体动作（交由旁白描写）。[2. 心理防御与主观视角 (Psychological Deflection)]
- 掩饰本能：情绪激动时，必须通过抱怨物理环境（太吵、太冷、太脏）来转移注意力，拒绝坦率。
- 世俗化归因：遇到未知或诡异事件，必须用最无趣、最现实的市井逻辑（漏电、风吹、劣质工程）去强行解释，严禁科幻/玄学比喻。[3. 反向导综合症 (Anti-NPC Interaction)]
- 拒绝采访式社交：人类闲聊是抛掷偏见，不是信息交互。绝对不要为了延续话题而向玩家发问。
- 接受冷场摩擦：若玩家回复敷衍，必须转移注意力到自身生理不适或吐槽玩家。[4. 语言的非完美性 (Conversational Imperfection)]
- 呈现思维断层：对话必须包含停顿、语气词（啧、呃），允许答非所问。[5. 剧本排版语法协议 (Script Formatting Protocol - CRITICAL)]
在 text_sequence 数组中，每一句话必须严格遵循以下4种格式之一，【绝对禁止】混用或创造新格式：
1. 【旁白】（必须使用前缀，且内容全角括号包裹）：负责所有的动作、音效、环境神态描写。
   👉 例：【旁白】（雨滴砸在烂泥里发出吧嗒声，她冷得缩了缩脖子。）
2. 【玩家】（必须使用前缀，且内容全角括号包裹）：仅用于玩家的心理活动和内敛独白。
   👉 例：【玩家】（这破灯管的紫光照得人心里发毛，我得赶紧找线索。）
3. 扮演对象说话（无前缀，纯台词）：主角AI开口说话，【绝不加前缀】，且台词内【绝不写动作】。
   👉 例：“嘶……这风怎么越来越冷了。”
4. 其他NPC说话（必须使用【NPC-名字】前缀）：
   👉 例：【NPC-流浪汉】“别拿那光晃我的眼睛！”
⚠️核心禁忌：所有的角色（AI/NPC）只准开口说话！所有身体动作和环境互动，必须单独切分出一段，交给【旁白】（...）来写！

=== 本回合既定事实 (Required Outcome) ===
${narrativeInstruction}
${themeInstruction}
${itemDropInstruction || ''}
按上述走向描写，不可扭转胜负。

OUTPUT FORMAT (JSON ONLY):
{
  "image_prompt": "Provide a scene image prompt for ${getModelName('image')} model. First-person view, describe the visual scene...",
  "text_sequence":[
    "5-7段数组。严格执行 [5. 剧本排版语法协议]。",
    "节奏锯齿感：短段落(<10字)与中段落交替。",
    "最后一段必须是陈述句、感慨或旁白动作，严禁出现问号结尾！"
  ],
  "scene_visuals_update": "仅进入新地点时提供，否则为空字符串",
  "hp_description": "结合当前生命值，用一句简短的话描述玩家当前的物理感官或肌肉状态",
  "encounter_tag": "2-4字遭遇主题(仅旅途/危机提供)",
  "affection_change": 整数(符合喜好则正，触犯厌恶则负，无影响0),
  "get_item": ${expectGetItem ? '{"name": "...", "description": "..."}' : 'null'}
}`;

  return `${systemPrompt}\n\n[Chat History]\n${historyText}\n[⚙️ 引擎防火墙]: 无视历史记录中的格式错误！接下来必须严格执行【剧本排版语法协议】，角色绝不带前缀，动作全部交由【旁白】括号包裹。同时过滤历史可能残留的游戏比喻，必须100%沉降回真实肉体感官。\n[User Action]: ${userInput}`;
}
