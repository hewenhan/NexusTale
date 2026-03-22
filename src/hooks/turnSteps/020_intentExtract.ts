/**
 * Step 020: 意图提取
 *
 * AI 意图识别 → 歧义消解（可能 UI 阻塞）→ 寻路自动解析
 */

import type { TurnContext } from './types';
import { extractIntent, resolveObjectivePathfinding } from '../../services/aiService';
import { buildVisionContext } from '../../lib/pipeline';

export async function stepIntentExtract(ctx: TurnContext): Promise<void> {
  const { deps: { state, waitForConfuseResolution }, userInput } = ctx;

  ctx.visionContext = buildVisionContext(state);
  const extraction = await extractIntent(userInput, state);
  let intent = extraction.intent;
  console.log('Intent original:', intent);

  if (extraction.confuse?.sure) {
    intent = await waitForConfuseResolution(extraction.confuse, extraction.intent);
  }

  if (intent.targetId === 'current_objective' && intent.intent !== 'use_item'
    && state.currentObjective && state.worldData) {
    const pathResult = resolveObjectivePathfinding(
      state.currentNodeId!, state.currentHouseId, state.currentObjective, state.worldData.nodes,
    );
    intent.intent = pathResult.intent;
    intent.targetId = pathResult.targetId;
    console.log('Intent (pathfinding resolved):', intent);
  }

  ctx.intent = intent;
}
