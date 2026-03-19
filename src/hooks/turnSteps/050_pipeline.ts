/**
 * Step 050: 内部管线执行 + Debug 覆写
 *
 * 调用 pipeline 纯计算管线，获取 PipelineResult，应用 Debug 覆写。
 */

import type { TurnContext } from './types';
import { runPipeline } from '../../lib/pipeline';
import { applyDebugOverrides } from './applyResolution';

export function stepPipeline(ctx: TurnContext): void {
  const { deps: { state, updateState }, resolveState, intent } = ctx;

  const debugOv = state.debugOverrides;
  const d20 = debugOv?.forcedRoll ?? (Math.floor(Math.random() * 20) + 1);
  const resolution = runPipeline(resolveState, intent, d20);

  if (debugOv) {
    applyDebugOverrides(resolution, debugOv);
    updateState({ debugOverrides: undefined });
  }

  ctx.d20 = d20;
  ctx.resolution = resolution;
}
