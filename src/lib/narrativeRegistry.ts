/**
 * 叙事文案注册中心 (Narrative Registry)
 *
 * 统一管理所有散落在 useChatLogic / applyResolution / directorSystem 中的
 * 硬编码叙事/检定文案模板。
 *
 * 分为两大类：
 *   A. AI 侧文案 (narrativeInstruction) — 发给 LLM 的"既定事实"约束
 *   B. 玩家侧文案 — 用于 notification / settlement 展示（暂不涉及，后续扩展）
 *
 * 设计原则：
 *   1. 纯文案模板函数，不含任何状态变更逻辑
 *   2. 参数化所有动态值（名称、数值），不直接读取 state
 *   3. 每个函数命名清晰表达场景，便于 grep 查找
 */

// ═══════════════════════════════════════════════════════════════
// 结构化既定事实类型 — buildStoryPrompt 的核心输入
// ═══════════════════════════════════════════════════════════════

/**
 * NarrativeFacts：一次回合中所有"既定事实"的结构化集合。
 *
 * 目前是 3 个字符串的类型化容器（与旧接口 1:1 对应），
 * 后续可扩展为更细粒度的结构（将 narrativeInstruction 拆分为
 * core / director / retreat / affection / quest 等独立字段）。
 */
export interface NarrativeFacts {
  /** 管线核心叙事 + 导演/退路/好感度/任务覆写后的最终叙事指令 */
  narrativeInstruction: string;
  /** 旅途主题指令（仅赶路时有值，否则空字符串） */
  themeInstruction: string;
  /** 道具掉落/装备掉落指令（可能为 null） */
  itemDropInstruction: string | null;
}

/** 将 NarrativeFacts 渲染为 prompt 中"既定事实"部分的纯文本 */
export function renderFactsForPrompt(facts: NarrativeFacts): string {
  return [
    facts.narrativeInstruction,
    facts.themeInstruction,
    facts.itemDropInstruction || '',
  ].filter(Boolean).join('\n');
}

// ═══════════════════════════════════════════════════════════════
// A1. 导演系统 / 任务派发 — 来源: useChatLogic.ts Step 1.6
// ═══════════════════════════════════════════════════════════════

/** 新任务链派发（导演覆写叙事） */
export function narrativeQuestDispatch(p: {
  stageDescription: string;
  targetLocationName: string;
  questItemName: string;
}): string {
  return `【系统强制 - 新任务派发】：伴游 NPC 刚得到重要消息，向玩家透露了一项紧急任务。请 NPC 用自己的风格向玩家转述以下任务内容：\n任务目标：${p.stageDescription}\n目标地点：${p.targetLocationName}\n同时，NPC 将一件道具交给了玩家：【${p.questItemName}】，这是完成第一环任务的关键物品。请描写 NPC 交付道具的场景。`;
}

// ═══════════════════════════════════════════════════════════════
// A2. 任务道具使用 — 来源: useChatLogic.ts Step 3.5
// ═══════════════════════════════════════════════════════════════

/** Boss 战中使用任务道具 → 视为找死 */
export function narrativeQuestItemInBossFight(itemName: string): string {
  return `【系统大失败 - 找死】：在危机中居然分心想使用【${itemName}】！玩家被狠狠重创！请描写玩家因为分心而被痛击的惨烈场面。`;
}

/** 任务链全部完成 */
export function narrativeQuestChainComplete(p: {
  itemName: string;
  ceremonySummary: string;
}): string {
  return `【系统强制 - 任务链完成】：玩家使用了【${p.itemName}】，完成了整个任务链的最终环节！道具已消耗。这段漫长的旅程终于落幕——${p.ceremonySummary}。请以充满终结感和成就感的方式描写这一刻，让玩家感受到一段传奇的结束。`;
}

/** 当前任务环节完成 → 触发下一环 */
export function narrativeQuestStageAdvance(p: {
  usedItemName: string;
  nextItemName: string;
}): string {
  return `【系统强制 - 任务道具使用】：玩家成功使用了【${p.usedItemName}】，完成了当前任务环节并且消耗掉！请结合世界观和上下文任务描述获得任务道具【${p.nextItemName}】，并触发下一任务，揭示两个任务任务道具和新任务的逻辑因果关系`;
}

/** 任务道具使用（普通消耗） */
export function narrativeQuestItemUsed(itemName: string): string {
  return `【系统强制 - 任务道具使用】：玩家使用了【${itemName}】。请描写道具消耗掉的效果。`;
}

/** 任务道具无法使用（不在目标地点） */
export function narrativeQuestItemCannotUse(itemName: string): string {
  return `【系统强制 - 任务道具无法使用】：玩家使用了【${itemName}】，请 NPC 结合上下文使用道具而不消耗道具`;
}

// ═══════════════════════════════════════════════════════════════
// A3. 任务目标抵达 — 来源: useChatLogic.ts (quest crisis anchoring)
// ═══════════════════════════════════════════════════════════════

/** 任务目标抵达 + 危机触发（按紧张度分级） */
export function narrativeQuestArrival(p: {
  locationName: string;
  finalTension: number;
}): string {
  const loc = p.locationName;
  const t = p.finalTension;
  if (t >= 4) {
    return `【系统强制 - 任务目标抵达 / 绝境危机触发】：玩家抵达了任务目标所在地【${loc}】！这里极度危险，强大的危机扑面而来——绝境 级威胁已经出现！紧张度直接拉满至 ${t} 级（死斗）。请描写抵达后立即遭遇 绝境 级威胁的震撼场面，气氛必须极度紧张、压迫感十足。`;
  }
  if (t >= 3) {
    return `【系统强制 - 任务目标抵达 / 中度威胁】：玩家抵达了任务目标所在地【${loc}】！周围弥漫着强烈的危险气息，中度威胁潜伏于此。紧张度升至 ${t} 级。请描写抵达后感知到强大威胁逼近的紧张场面，NPC 应表现出警觉与不安。`;
  }
  if (t >= 2) {
    return `【系统强制 - 任务目标抵达 / 危机潜伏】：玩家抵达了任务目标所在地【${loc}】！这里并不太平，危险的征兆随处可见。紧张度升至 ${t} 级。请描写抵达时察觉到异常与潜在危机的场面。`;
  }
  return `【系统强制 - 任务目标抵达】：玩家抵达了任务目标所在地【${loc}】！请描写抵达目的地的场面。`;
}

// ═══════════════════════════════════════════════════════════════
// A4. 掉头返程 — 来源: applyResolution.ts
// ═══════════════════════════════════════════════════════════════

/** 赶路中掉头返程 */
export function narrativeRetreat(p: {
  returnToName: string;
  currentProgress: number;
}): string {
  return `【系统强制 - 掉头返程】：玩家决定中途折返，掉头返回【${p.returnToName}】方向！路程进度已反转（当前返程进度${p.currentProgress}%）。请尊重玩家的返程决定，描写掉头折返的过程。`;
}

// ═══════════════════════════════════════════════════════════════
// A5. 好感度检定 — 来源: applyResolution.ts
// ═══════════════════════════════════════════════════════════════

/** 好感度援助 */
export function narrativeAffectionAid(p: {
  affection: number;
  specialties: string;
}): string {
  return `【好感度援助】：同伴因与玩家关系亲密（好感度${p.affection}），在关键时刻出手相助！请结合同伴的【特长: ${p.specialties}】描写一段精彩的援助行动，使局面好转。`;
}

/** 好感度落井下石 */
export function narrativeAffectionSabotage(affection: number): string {
  return `【好感度冷淡】：同伴因与玩家关系冷淡（好感度${affection}），在危急关头袖手旁观甚至落井下石！请结合同伴的性格描写冷漠、嘲讽或使绊子的反应，使局面雪上加霜。`;
}

// ═══════════════════════════════════════════════════════════════
// A6. 道具掉落 — 来源: useChatLogic.ts Step 3.9
// ═══════════════════════════════════════════════════════════════

/** 搜刮有收获（退敌道具） */
export function narrativeItemDropFound(p: {
  rarity: string;
  inTransit: boolean;
}): string {
  const prefix = p.inTransit
    ? `【搜刮结果 - 有收获】：在赶路途中获得了一件${p.rarity}品质的道具！`
    : `【搜刮结果 - 有收获】：获得了一件${p.rarity}品质的道具！`;
  return prefix + `（根据世界观和当前场景合理创名，不要和已有物品重复！不要和当前任务/任务链有关！根据对话合理化描述获得过程），并在 get_item 字段中返回道具名称和简短说明。`;
}

/** 搜刮无收获 */
export function narrativeItemDropNone(inTransit: boolean): string {
  const prefix = inTransit
    ? `【搜刮结果 - 无收获】：在赶路途中没有找到任何道具，但还有找的线索`
    : `【搜刮结果 - 无收获】：结合世界观上下文描写没找到东西，但还有找的线索`;
  return prefix + `（请不要写成"你在地上翻了半天，什么都没找到"这种尴尬的修辞，合理化描述搜刮过程和线索）。`;
}

/** 装备掉落 */
export function narrativeEquipmentDrop(p: {
  rarity: string;
  typeName: string;
  name: string;
  description: string;
}): string {
  return `【装备掉落】：探索中发现了一件${p.rarity}品质的${p.typeName}【${p.name}】（${p.description}）！请在叙事中自然地描写发现这件装备的过程。不要和当前任务/任务链有关！`;
}

// ═══════════════════════════════════════════════════════════════
// A7. 建筑揭盲 — 来源: applyNarrativeOverrides
// ═══════════════════════════════════════════════════════════════

/** 本回合由探索度引发的新建筑揭盲 */
export function narrativeBuildingReveal(
  buildings: { name: string; type: string }[],
): string {
  const list = buildings.map(b => `${b.name}(${b.type})`).join('、');
  return `\n【建筑揭盲】：本回合探索中发现了新建筑：${list}。请自然地在叙事中体现发现新地点的过程。`;
}
