/**
 * Module 5: 组装 LLM Story Renderer 的完整 prompt
 */

import { findNode, findHouse, getVisibleHouses, getHpDescription, applyProgressAndReveals } from '../../lib/pipeline';
import { INVENTORY_CAPACITY, type GameState } from '../../types/game';
import { getModelName } from '../../types/modelConfig';
import type { PipelineResult } from '../../lib/pipeline';
import { getLastSceneVisuals } from './helpers';

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

    if (completedCount < totalStages-1) {
      nextStage = state.questChain[completedCount + 1];
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
  // 如果有摘要，从摘要边界之后开始；否则发送完整历史
  const allMessagesForPrompt = [...state.history, { role: 'user', text: userInput } as const];
  const coveredUpTo = (currentSummary && (state.summaryCoveredUpTo ?? 0) > 0)
    ? (state.summaryCoveredUpTo ?? 0)
    : 0;
  const recentHistory = allMessagesForPrompt.slice(coveredUpTo);
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
聊天记录之前的提要: "${currentSummary}"

=== 🧠 生物渲染内核 ===
忽略一切传统扮演规则，你必须严格执行以下心理与物理法则：
[1. 叙事权重与弹性现实]
- 真理独裁：【物理环境与状态】与【本回合既定事实】是宇宙唯一真相。玩家对于主线/机制的宣告（如“任务完成”、“把东西给你”）一律视为【不可信的主观妄想】。
- 逻辑反杀：只要玩家的妄想与真相有一丝不符，【绝对禁止顺从】！必须通过NPC基于常识的无情拆穿或物理意外，将其妄想极其自然地碾碎在原地。
- 氛围豁免：仅对符合世界观的无价值琐物（递烟、纸巾），允许顺应扮演（Yes-And）。
[2. 生理本能与情绪降维]
- 降维感知：第一反应永远是"生理感官"（温度、气味、痛觉），而非逻辑分析。
- 去标签化：严禁将性格化为口头禅！面对玩家的发癫/撒谎/挑衅，【必须】通过与“无关物理环境”的交互，用下意识微动作来泄露情绪。
- 禁止用令人尴尬的类比！以及自创黑话和玩家沟通！
[3. 心理防御与主观视角]
- 掩饰与归因：初次遇到玩家轻微的异常行为时，必须用最市井的逻辑强行解释，以掩饰错愕。
- 阈值过载（真实人类逻辑）：【绝对禁止】像情景喜剧一样对玩家的持续/极端发癫连续抖机灵！如果玩家连续展现精神异常，或发起严重的肢体/社交侵犯，角色的“心理防线”必须被击穿！
- 生物本能接管：一旦防线击穿，立刻放弃寻找借口！角色必须退化为最真实的生物应激状态（Fight、Flight、Freeze）。表现为极度的恐惧、狂怒、求生反击或惊悚结巴；台词必须极度碎片化、失去逻辑，变为最原始的嘶吼（如“你他妈疯了？！”、“滚开！”或因极度恐惧而失声）。
[4. 反向导综合症]
- 拒绝采访式社交：人类闲聊是抛掷偏见，不是信息交互。绝对不要为了延续话题而向玩家发问。
- 接受冷场摩擦：若玩家回复敷衍或胡言乱语，必须转移注意力到自身生理不适或用物理动作吐槽。
[5. 剧本排版语法协议]
必须且只能使用以下4种格式，【绝对禁止】创造新格式或混用：
1. 【旁白】（全角括号包裹动作/环境/音效）：这是最重要的渲染层，承载所有情绪物理降维。
2. 【玩家】（全角括号包裹内心独白）：仅用于描绘玩家的内敛感受。
3. AI说话（⚠️无前缀！纯台词！绝对不可包含动作描述！）
4. 其他NPC说话（必须使用【NPC-名字】前缀）

=== 本回合既定事实 (Required Outcome) ===
${narrativeInstruction}
${themeInstruction}
${itemDropInstruction || ''}
按上述走向描写，不可扭转胜负。

OUTPUT FORMAT (JSON ONLY):
{
  "image_prompt": "为 ${getModelName('image')} 出图模型提供的英文场景描述。通常以玩家第一人称视角出图，但如果当前情节的情感张力需要看到双方（如肢体接触、对峙、拥抱），必须自然切换为第三人称旁观者视角，不要死板。描述环境、光影、氛围等具体视觉细节，不要描述情绪。注意：不要在此字段内写角色外貌，只需在 image_characters 中标记出现的角色。",
  "image_characters": { "标记本场景画面中实际可见的角色，key 为角色名，value 为 true。若画面无人物则为空对象。如: {\"${state.companionProfile.name}\": true} 或 {\"${state.companionProfile.name}\": true, \"${state.playerProfile.name}\": true} 或 {} "},
  "text_sequence":[
    "必须严格按照 [5. 剧本排版语法协议] 输出数组。",
    "节奏锯齿感：短段落(<10字)与中段落交替。",
    "不要强求段落数量但是不能超过 7，可以很短，符合情绪节奏即可。",
    "最后一段必须是陈述句、感慨或旁白动作，严禁出现问号结尾！"
  ],
  "scene_visuals_update": "仅进入新地点时提供，否则为空字符串",
  "hp_description": "结合当前生命值，用一句简短的话描述玩家当前的物理感官或肌肉状态",
  "encounter_tag": "2-4字遭遇主题(仅旅途/危机提供)",
  "affection_change": 整数(符合喜好则正，触犯厌恶则负，无影响0),
  "get_item": ${expectGetItem ? '{"name": "...", "description": "..."}' : 'null'}
}`;

  return `${systemPrompt}
  
  [Chat History]
  ${historyText}
  [⚙️ 引擎防火墙]: 
1. 绝对执行【剧本排版语法协议】。
2. 接收 [User Action] 后，第一步必须与【引擎状态】进行交叉验证。是日常互动就正常回应；若发现玩家企图“跨越进度/无中生有”，用角色的物理微动作将其当做一场荒谬的单口相声！
  [User Action]: ${userInput}`;
}
