/**
 * Step 120: Post-LLM 结算
 *
 * AI 回复后的状态写入 + 任务延迟写入 + BGM 选择 + 消息段构建 + debug 快照
 */

import { v4 as uuidv4 } from 'uuid';
import type { TurnContext } from './types';
import type { TextSegment } from '../../types/game';
import { applyPostLlmSettlement } from './postLlmSettlement';
import { applyQuestDeferredWrites } from './questChainLogic';
import { selectBgm } from './bgmSelection';
import { getLastSceneVisuals } from './helpers';

export function stepPostLlm(ctx: TurnContext): void {
  const {
    deps: { state, updateState },
    resolution, responseJson, questResult,
    pendingQuestItem, prerolledEquipDrop, escapeItemRarity,
    pendingNotifications, d20, narrativeInstruction, facts,
  } = ctx;

  // ── Post-LLM 结算 ──
  const { pendingBagItems } = applyPostLlmSettlement(responseJson, resolution!, state, updateState, {
    pendingQuestItem, prerolledEquipDrop, escapeItemRarity,
  });

  // ── 任务延迟写入 ──
  if (questResult) {
    applyQuestDeferredWrites(questResult, state, updateState, pendingNotifications, pendingBagItems);
  }

  // ── BGM 选择 ──
  const finalBgmKey = selectBgm(resolution!, state);

  // ── 构建消息段 ──
  const { text_sequence } = responseJson;
  const messages: TextSegment[] = Array.isArray(text_sequence)
    ? text_sequence.map((seg: any) => {
        if (seg && typeof seg === 'object' && seg.type && seg.content) {
          return { type: seg.type, content: seg.content, name: seg.name } as TextSegment;
        }
        if (typeof seg === 'string') {
          return { type: 'ai_dialogue' as const, content: seg };
        }
        return { type: 'ai_dialogue' as const, content: String(seg) };
      })
    : [{ type: 'ai_dialogue' as const, content: responseJson.text_response || '......' }];

  // ── Debug 快照 ──
  const { image_prompt } = responseJson;
  const themeInstruction = facts?.themeInstruction ?? '';
  const itemDropInstruction = ctx.itemDropInstruction;

  const debugState = {
    lastActionRoll: resolution!.snapPost.roll ?? d20,
    lastSuccessThreshold: 0,
    lastIsSuccess: resolution!.snapPost.isSuccess ?? resolution!.isSuccess,
    lastTensionLevel: resolution!.snapPost.tensionLevel,
    lastIntent: resolution!.snapPost.intent,
    lastNarrativeInstruction: narrativeInstruction,
    lastThemeInstruction: themeInstruction,
    lastItemDropInstruction: itemDropInstruction || undefined,
    lastFormula: resolution!.formulaBreakdown,
    lastImagePrompt: image_prompt,
    lastImageError: undefined as string | undefined,
  };

  ctx.pendingBagItems = pendingBagItems;
  ctx.finalBgmKey = finalBgmKey;
  ctx.messages = messages;
  ctx.debugState = debugState;
}
