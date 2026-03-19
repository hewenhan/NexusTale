/**
 * Step 100: 构建通知列表
 */

import type { TurnContext } from './types';
import { buildNotifications } from './buildNotifications';

export function stepNotifications(ctx: TurnContext): void {
  const { deps: { state }, resolution, directorResult } = ctx;
  ctx.pendingNotifications = buildNotifications(state, resolution!, directorResult);
}
