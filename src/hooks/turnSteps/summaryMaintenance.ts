/**
 * Step 0: 历史摘要维护
 * 当未摘要的用户轮数超过阈值时，压缩旧消息为摘要。
 */

import { SUMMARY_THRESHOLD, KEEP_RECENT_TURNS, type GameState } from '../../types/game';
import { generateSummary } from '../../services/aiService';
import { getStartIndexForRecentTurns } from './helpers';

export interface SummaryResult {
  currentSummary: string;
}

export async function runSummaryMaintenance(
  state: GameState,
  userInput: string,
  updateState: (patch: Partial<GameState>) => void,
): Promise<SummaryResult> {
  let currentSummary = state.summary;
  const coveredUpTo = state.summaryCoveredUpTo ?? 0;

  const unsummarizedHistory = state.history.slice(coveredUpTo);
  const unsummarizedUserTurns = unsummarizedHistory.filter(m => m.role === 'user').length + 1;

  if (unsummarizedUserTurns > SUMMARY_THRESHOLD) {
    const allMessages = [...state.history, { role: 'user', text: userInput } as const];
    const newBoundary = getStartIndexForRecentTurns(allMessages, KEEP_RECENT_TURNS);
    if (newBoundary > coveredUpTo) {
      const chunkToSummarize = allMessages.slice(coveredUpTo, newBoundary);
      const newSummary = await generateSummary(currentSummary, chunkToSummarize as any, state.language);
      if (newSummary) {
        currentSummary = newSummary;
        updateState({
          summary: currentSummary,
          summaryCoveredUpTo: Math.min(newBoundary, state.history.length),
        });
      }
    }
  }

  return { currentSummary };
}
