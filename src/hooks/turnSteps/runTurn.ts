/**
 * 回合编排器 (Turn Orchestrator)
 *
 * 参照 pipeline/runPipeline.ts 的设计：
 * 创建 TurnContext，按固定顺序依次执行回合步骤。
 * 每个步骤只读取和写入 TurnContext。
 *
 * 执行顺序：
 *   ① 历史摘要维护          → 压缩旧消息
 *   ★ 输入预处理            → 拼音/外语翻译成语境中文
 *   ② 意图提取              → AI 意图识别 + 歧义消解 + 寻路
 *   ③ 导演系统              → seek_quest 升级 + 任务链生成
 *   ④ 赶路掉头              → transit 方向反转
 *   ⑤ 内部管线              → D20 / 移动 / 紧张度 / HP 纯计算
 *   ⑥ 叙事拼装              → events → 叙事指令 + 导演覆写
 *   ⑦ 任务道具解析          → 使用 / 仪式生成 / 危机锚定
 *   ⑧ 道具掉落              → 退敌道具 + 装备掉落
 *   ⑨ 状态写入              → resolution → GameState
 *   ⑩ 通知构建              → 抵达 / 揭盲 / 任务通知
 *   ⑪ LLM 调用             → prompt 组装 + 叙事大模型
 *   ⑫ Post-LLM 结算        → 好感度 / 服装 / BGM / 消息段
 *   ⑬ 显示编排              → 图片生成 + 打字机排队
 *   ⑭ 入包 & 仪式           → 背包 UI 阻塞 + 完成仪式
 */

import type { TurnContext, TurnDeps } from './types';
import type { DirectorResult } from './directorSystem';

import { stepSummary } from './010_summary';
import { stepRagRetrieve } from './015_ragRetrieve';
import { stepInputPreprocess } from './018_inputPreprocess';
import { stepIntentExtract } from './020_intentExtract';
import { stepDirector } from './030_director';
import { stepRetreat } from './040_retreat';
import { stepPipeline } from './050_pipeline';
import { stepNarrative } from './060_narrative';
import { stepQuestResolve } from './070_questResolve';
import { stepItemDrops } from './080_itemDrops';
import { stepWriteState } from './090_writeState';
import { stepNotifications } from './100_notifications';
import { stepLlmCall } from './110_llmCall';
import { stepPostLlm } from './120_postLlm';
import { stepDisplay } from './130_display';
import { stepBagAndCeremony } from './140_bagAndCeremony';
import { stepRagIngest } from './150_ragIngest';

function createTurnContext(deps: TurnDeps, userInput: string): TurnContext {
  const emptyDirector: DirectorResult = {
    narrativeOverride: null,
    questNotification: null,
    questDiscoveryNotification: null,
    newObjective: null,
    needsQuestChainGeneration: false,
  };

  return {
    deps,
    userInput,
    rawUserInput: null,

    // Step 010
    currentSummary: deps.state.summary,
    // Step 020
    visionContext: '',
    extraction: null,
    intent: { intent: 'idle', targetId: null },
    // Step 030
    directorResult: emptyDirector,
    pendingQuestItem: null,
    // Step 040
    resolveState: deps.state,
    isRetreatIntent: false,
    // Step 050
    d20: 0,
    resolution: null,
    // Step 060-070
    narrativeInstruction: '',
    questResult: null,
    // Step 080
    escapeItemRarity: null,
    itemDropInstruction: null,
    prerolledEquipDrop: null,
    // Step RAG
    ragContext: '',
    // Step 100
    pendingNotifications: [],
    // Step 110
    facts: null,
    responseJson: null,
    // Step 120
    pendingBagItems: [],
    finalBgmKey: undefined,
    // Step 130
    messages: [],
    debugState: null,
  };
}

export async function runTurn(deps: TurnDeps, userInput: string): Promise<void> {
  const ctx = createTurnContext(deps, userInput);

  // ── 回合管线，按序执行 ──
  await stepInputPreprocess(ctx); // ★ 输入预处理
  await stepRagRetrieve(ctx);     // ★ RAG 检索
  await stepSummary(ctx);         // ① 摘要
  await stepIntentExtract(ctx);   // ② 意图
  await stepDirector(ctx);      // ③ 导演
  stepRetreat(ctx);             // ④ 掉头

  // ⑤ 管线 — 返回值合并
  const pipelineResult = stepPipeline(ctx);
  ctx.d20 = pipelineResult.d20;
  ctx.resolution = pipelineResult.resolution;

  stepNarrative(ctx);           // ⑥ 叙事
  await stepQuestResolve(ctx);  // ⑦ 任务
  stepItemDrops(ctx);           // ⑧ 掉落
  stepWriteState(ctx);          // ⑨ 写入
  stepNotifications(ctx);       // ⑩ 通知

  // ⑪ LLM — 返回值合并
  const llmResult = await stepLlmCall(ctx);
  ctx.facts = llmResult.facts;
  ctx.responseJson = llmResult.responseJson;

  stepPostLlm(ctx);             // ⑫ 结算
  await stepDisplay(ctx);       // ⑬ 显示
  await stepBagAndCeremony(ctx);// ⑭ 入包
  await stepRagIngest(ctx);     // ★ RAG 入库
}
