/**
 * Step 110: 构建 LLM Prompt & 调用叙事大模型
 *
 * 返回结果而非直接写入 ctx，由 orchestrator 负责合并。
 */

import type { TurnContext } from './types';
import { buildStoryPrompt, buildThemeInstruction } from './buildStoryPrompt';
import { generateTurn } from '../../services/aiService';
import type { NarrativeFacts } from '../../lib/narrativeRegistry';

export interface LlmCallStepResult {
  facts: NarrativeFacts;
  responseJson: any;
}

export async function stepLlmCall(ctx: Readonly<TurnContext>): Promise<LlmCallStepResult> {
  const { deps: { state }, resolution, currentSummary, userInput, visionContext } = ctx;

  const themeInstruction = buildThemeInstruction(state, resolution!);
  const facts: NarrativeFacts = {
    narrativeInstruction: ctx.narrativeInstruction,
    themeInstruction,
    itemDropInstruction: ctx.itemDropInstruction,
  };

  const fullPrompt = buildStoryPrompt({
    state, resolution: resolution!, currentSummary, userInput, visionContext,
    expectGetItem: !!ctx.escapeItemRarity,
    facts,
  });

  const responseJson = await generateTurn(fullPrompt);

  return { facts, responseJson };
}
