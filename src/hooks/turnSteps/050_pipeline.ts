/**
 * Step 050: 内部管线执行 + Debug 覆写
 *
 * 调用 pipeline 纯计算管线，获取 PipelineResult，应用 Debug 覆写。
 * 返回结果而非直接写入 ctx，由 orchestrator 负责合并。
 */

import type { TurnContext } from './types';
import { runPipeline, type PipelineResult } from '../../lib/pipeline';
import { applyDebugOverrides } from './applyResolution';

export interface PipelineStepResult {
  d20: number;
  resolution: PipelineResult;
}

export function stepPipeline(ctx: Readonly<TurnContext>): PipelineStepResult {
  const { deps: { state, updateState }, resolveState, intent } = ctx;

  const debugOv = state.debugOverrides;
  const d20 = debugOv?.forcedRoll ?? (Math.floor(Math.random() * 20) + 1);
  const resolution = runPipeline(resolveState, intent, d20);

  if (debugOv) {
    applyDebugOverrides(resolution, debugOv);
    updateState({ debugOverrides: undefined });
  }

  return { d20, resolution };
}
