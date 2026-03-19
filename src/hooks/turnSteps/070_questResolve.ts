/**
 * Step 070: 任务道具使用 + 任务危机锚定
 *
 * 解析任务道具使用结果（可能异步生成完成仪式），
 * 然后检查是否抵达任务目标并锚定紧张度。
 */

import type { TurnContext } from './types';
import { resolveQuestItemUsage, applyQuestCrisisAnchoring } from './questChainLogic';

export async function stepQuestResolve(ctx: TurnContext): Promise<void> {
  const { deps: { state, updateState, setIsCeremonyGenerating }, intent, resolution } = ctx;

  const questResult = await resolveQuestItemUsage(
    ctx.narrativeInstruction, intent, resolution!, state, setIsCeremonyGenerating,
  );
  ctx.narrativeInstruction = questResult.narrativeInstruction;
  if (questResult.questChainCompleted) setIsCeremonyGenerating(false);

  ctx.narrativeInstruction = applyQuestCrisisAnchoring(
    ctx.narrativeInstruction, resolution!, state, updateState,
  );

  console.log('D20 Roll:', ctx.d20, 'Resolution:', resolution);

  ctx.questResult = questResult;
}
