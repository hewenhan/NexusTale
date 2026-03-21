/**
 * Module 5: 组装 LLM Story Renderer 的完整 prompt
 */

import { findNode, findHouse, getVisibleHouses, applyProgressAndReveals } from '../../lib/pipeline';
import { INVENTORY_CAPACITY, type GameState } from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';
import { getLastSceneVisuals } from './helpers';
import { type NarrativeFacts } from '../../lib/narrativeRegistry';
import { buildSystemPrompt } from './storySystemPrompt';

// ── 构建位置上下文 ──
function buildLocationContext(state: GameState, resolution: PipelineResult, visionContext: string): string {
  if (resolution.newTransitState) {
    const fromNode = findNode(state, resolution.newTransitState.fromNodeId);
    const toNode = findNode(state, resolution.newTransitState.toNodeId);
    const progress = resolution.newTransitState.pathProgress;
    const tensionNote = resolution.newTensionLevel >= 2
      ? '请侧重描写沿途遭遇的危险和冲突。'
      : '请结合上下文世界观和角色性格或经历发表互动和思考，不要凭空制造危险。';
    return `【当前位置】：正在从【${fromNode?.name || resolution.newTransitState.fromNodeId}】赶往【${toNode?.name || resolution.newTransitState.toNodeId}】（路程进度：${progress}%）。【地理铁律】路程才${progress}%，目的地远在视野之外。无论玩家还是NPC说什么，脚下的路不会缩短——"已经到了""坐船过去""抄近路"之类全是嘴上功夫，该走还得走。${tensionNote}`;
  }

  // 检测刚到达（上一轮在赶路，本轮 transit 已清除）
  const justArrived = !!state.transitState && !resolution.newTransitState;

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
    if (justArrived) {
      const fromNode = findNode(state, state.transitState!.fromNodeId);
      const fromName = fromNode?.name || state.transitState!.fromNodeId || '远方';
      return `【当前位置】：刚刚抵达！经过从【${fromName}】出发的长途跋涉，终于踏入了【${updatedNode.name}】。已揭盲可互动的微观建筑: ${hStr}。这是一片全新的区域，一切尚待探索。`;
    }
    return `【当前位置】：街区/野外。正处于【${updatedNode.name}】的宏观区域。已揭盲可互动的微观建筑: ${hStr}。可看到周围的建筑。`;
  }

  return `【当前位置】：${visionContext}`;
}

// ── 构建进度标签 ──
function buildProgressLabel(state: GameState, resolution: PipelineResult): string {
  const activeProgressKey = resolution.newHouseId
    ? `house_${resolution.newHouseId}`
    : (resolution.newTransitState ? 'transit' : `node_${resolution.newNodeId}`);

  const currentProgress = resolution.newTransitState
    ? resolution.newTransitState.pathProgress
    : (resolution.newProgressMap[activeProgressKey] || 0);

  if (resolution.newTransitState) return `当前徒步赶路进度: ${currentProgress}%`;
  if (resolution.newHouseId) return `当前室内搜刮进度: ${currentProgress}%`;
  // 刚到达新区域时，0% 是正常的，补充说明
  const justArrived = !!state.transitState && !resolution.newTransitState;
  if (justArrived && currentProgress === 0) return `刚抵达新区域，尚未探索 (0%)`;
  return `当前区域建筑发现进度: ${currentProgress}%`;
}

// ── 动态记忆锁：旅途主题指令 (重构版：物理与世俗体验引擎) ──
export function buildThemeInstruction(state: GameState, resolution: PipelineResult): string {
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
      return `【系统强制 - 突发遭遇】：玩家踏上新旅途（高紧张度）。请凭空创造一个符合当前世界观的真实物理阻碍或危机。\n[避雷针]：绝不能出现这些已历经的遭遇：${blacklist}。\n必须在 encounter_tag 中用2-4个字概括本次危机。`;
    }
    return `【系统指令 - 旅途渲染】：当前是安全的赶路阶段（紧张度=${resolution.newTensionLevel}）。${objectiveHint}\n**[绝对法则]：绝不可凭空制造任何危机或袭击！**\n如果需要 encounter_tag，请填写环境/氛围相关的词汇。已用过的主题避开：${blacklist}。`; 
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
        parts.push(`下一任务: ${nextStage.description}`);
        const nextNeededItems = nextStage.requiredItems.map(ri => ri.name).join(', ');
        if (nextNeededItems) parts.push(`下一任务所需道具: ${nextNeededItems}`);
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
  /** 是否期望 AI 在 get_item 字段返回道具信息 */
  expectGetItem?: boolean;
  /** 结构化既定事实（推荐使用） */
  facts?: NarrativeFacts;
  /** RAG 语义检索召回的历史片段 */
  ragContext?: string;
  /** @deprecated 使用 facts.itemDropInstruction 替代 */
  itemDropInstruction?: string | null;
  /** @deprecated 使用 facts.narrativeInstruction 替代 */
  narrativeInstruction?: string;
}

export function buildStoryPrompt(input: StoryPromptInput): string {
  const { state, resolution, currentSummary, userInput, visionContext, expectGetItem } = input;

  // 兼容旧接口：优先使用 facts，否则回退到散装参数
  const facts: NarrativeFacts = input.facts ?? {
    narrativeInstruction: input.narrativeInstruction ?? '',
    themeInstruction: buildThemeInstruction(state, resolution),
    itemDropInstruction: input.itemDropInstruction ?? null,
  };

  const locationContext = buildLocationContext(state, resolution, visionContext);
  const progressLabel = buildProgressLabel(state, resolution);
  const themeInstruction = facts.themeInstruction;
  const characterRoleString = buildCharacterRoleString(state);
  const inventoryAndQuestContext = buildInventoryAndQuestContext(state);
  const narrativeInstruction = facts.narrativeInstruction;
  const itemDropInstruction = facts.itemDropInstruction;

  const lastVisuals = getLastSceneVisuals(state);

  // ── Build recent history text ──
  // 如果有摘要，从摘要边界之后开始；否则发送完整历史
  const allMessagesForPrompt = [...state.history, { role: 'user', text: userInput } as const];
  const coveredUpTo = (currentSummary && (state.summaryCoveredUpTo ?? 0) > 0)
    ? (state.summaryCoveredUpTo ?? 0)
    : 0;
  const recentHistory = allMessagesForPrompt.slice(coveredUpTo);
  const historyText = recentHistory.map(m => {
    if (m.role === 'user') return `user: ${m.text}`;
    const seg = ('segmentType' in m && m.segmentType) ? m.segmentType : 'ai_dialogue';
    const prefix = seg === 'npc_dialogue' && 'npcName' in m && m.npcName
      ? `npc_dialogue(${m.npcName})`
      : seg;
    return `${prefix}: ${m.text}`;
  }).join('\n');

const systemPrompt = buildSystemPrompt({
    state,
    resolution,
    characterRoleString,
    locationContext,
    progressLabel,
    inventoryAndQuestContext,
    lastVisuals,
    currentSummary,
    narrativeInstruction,
    themeInstruction,
    itemDropInstruction,
    expectGetItem,
  });

  return `${systemPrompt}
  ${input.ragContext ? `\n${input.ragContext}\n` : ''}
  [Chat History]
  ${historyText}
  [引擎防火墙]: 
1. 绝对尊重【本回合既定事实】
2. 绝对执行【剧本排版语法协议】。
3. 无视历史记录中的错误！过滤历史可能残留的游戏比喻、修辞！绝对不要写入(刺耳的XX声这种傻逼修辞)${state.exhaustedRhetoric.length > 0 ? `\n⛔ 修辞黑名单（以下修辞已被永久封禁，严禁以任何形式复用）：${state.exhaustedRhetoric.join('、')}` : ''}
4. 接收 [User Action] 后，第一步必须与【引擎状态】进行交叉验证。是日常互动就正常回应；若发现玩家企图"跨越进度/无中生有"，用角色的物理微动作将其当做一场荒谬的单口相声！
  [User Action]: ${userInput}`;
}
