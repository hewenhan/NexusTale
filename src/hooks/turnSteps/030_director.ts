/**
 * Step 030: 导演系统 + 任务链生成
 *
 * seek_quest 升级 → 导演决策 → 异步任务链生成
 */

import type { TurnContext } from './types';
import { maybeEscalateToSeekQuest, runDirector } from './directorSystem';
import { runQuestChainGeneration } from './questChainLogic';

export async function stepDirector(ctx: TurnContext): Promise<void> {
  const { deps: { state, updateState }, intent } = ctx;

  maybeEscalateToSeekQuest(intent, state);
  const directorResult = runDirector(intent, state);

  if (directorResult.newObjective) {
    updateState({ currentObjective: directorResult.newObjective });
  }

  const { pendingQuestItem } = await runQuestChainGeneration(directorResult, state, updateState);

  ctx.directorResult = directorResult;
  ctx.pendingQuestItem = pendingQuestItem;
}
