/**
 * Step 110: 构建 LLM Prompt & 调用叙事大模型
 */

import type { TurnContext } from './types';
import { buildStoryPrompt, buildThemeInstruction } from './buildStoryPrompt';
import { generateTurn } from '../../services/aiService';
import type { NarrativeFacts } from '../../lib/narrativeRegistry';

export async function stepLlmCall(ctx: TurnContext): Promise<void> {
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

  ctx.facts = facts;
  ctx.responseJson = responseJson;
}
