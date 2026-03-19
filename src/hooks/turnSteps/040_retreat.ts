/**
 * Step 040: 赶路掉头处理
 *
 * 如果玩家在赶路中选择返回，反转 transit 方向。
 */

import type { TurnContext } from './types';
import { resolveRetreat } from './retreatLogic';

export function stepRetreat(ctx: TurnContext): void {
  const { deps: { state }, intent } = ctx;
  const { resolveState, isRetreatIntent } = resolveRetreat(state, intent);
  ctx.resolveState = resolveState;
  ctx.isRetreatIntent = isRetreatIntent;
}
