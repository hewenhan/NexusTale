/**
 * Step 060: 叙事拼装 + 叙事覆写
 *
 * 基于管线 events 生成基础叙事指令，然后注入导演系统、返程、好感度覆写。
 */

import type { TurnContext } from './types';
import { assembleNarrative } from '../../lib/pipeline';
import { applyNarrativeOverrides } from './applyResolution';

export function stepNarrative(ctx: TurnContext): void {
  const { deps: { state }, intent, resolution, resolveState, directorResult, isRetreatIntent } = ctx;

  let narrativeInstruction = assembleNarrative({
    result: resolution!, intent, state: resolveState, moveTarget: resolution!.moveTarget,
  });

  narrativeInstruction = applyNarrativeOverrides(
    narrativeInstruction, resolution!, state, directorResult, isRetreatIntent,
  );

  ctx.narrativeInstruction = narrativeInstruction;
}
