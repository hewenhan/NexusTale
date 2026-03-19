/**
 * Step 1.8: 赶路中掉头处理
 */

import type { GameState, IntentResult } from '../../types/game';

export interface RetreatResult {
  resolveState: GameState;
  isRetreatIntent: boolean;
}

export function resolveRetreat(state: GameState, intent: IntentResult): RetreatResult {
  const isRetreatIntent = !!(state.transitState && intent.direction === 'back');

  if (!isRetreatIntent) {
    return { resolveState: state, isRetreatIntent: false };
  }

  const reversed = {
    fromNodeId: state.transitState!.toNodeId,
    toNodeId: state.transitState!.fromNodeId,
    pathProgress: Math.max(0, 100 - state.transitState!.pathProgress),
    lockedTheme: null,
  };
  const resolveState = { ...state, transitState: reversed };
  console.log('Transit RETREAT: reversed', state.transitState, '->', reversed);

  return { resolveState, isRetreatIntent: true };
}
