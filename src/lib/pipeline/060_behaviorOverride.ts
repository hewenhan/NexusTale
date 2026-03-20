/**
 * Step ③ 行为覆写
 *
 * 职责：
 * - idle/suicidal_idle 在高紧张度时已通过 tensionConfig 的 probabilities=[1,0,0] 强制大失败
 * - Zone 探索度 100% 且在野外时，T1 explore 大失败改为普通（屏蔽伏击升级）
 * - 退敌道具 use_item 在危机中视为 combat（走 combat 概率表）
 */

import type { PipelineContext } from './types';
import { rollToTier } from './040_d20Roll';
import { TENSION_ROUTE } from '../tensionConfig';

export function stepBehaviorOverride(ctx: PipelineContext): void {
  const { state, intent } = ctx;
  const tension = state.pacingState.tensionLevel;

  // ── 退敌道具：use_item + escape type + 危机 → 视为 combat ──
  if (intent.intent === 'use_item' && intent.itemId && tension >= 2) {
    const escapeItems = state.inventory.filter(i => i.type === 'escape');
    console.log('[060] 退敌道具匹配', { itemId: intent.itemId, escapeItems: escapeItems.map(i => `${i.id}(${i.name})`) });
    const escapeItem = escapeItems.find(i => i.id === intent.itemId);
    console.log('[060] 匹配结果:', escapeItem ? escapeItem.name : 'null');
    if (escapeItem) {
      const combatRoute = TENSION_ROUTE[tension]?.['combat'];
      if (combatRoute) {
        // 覆写意图为 combat，后续步骤统一走 combat 路径
        ctx.intent = { ...intent, intent: 'combat' };
        ctx.escapeItemUsed = escapeItem;
        ctx.tier = rollToTier(combatRoute.probabilities, ctx.effectiveRoll);
        ctx.formulaBreakdown += `\n[行为覆写] 退敌道具【${escapeItem.name}】视为combat → T${ctx.tier} ${['大失败', '普通', '大成功'][ctx.tier]}`;
        ctx.events.push({ type: 'behavior_override', description: `退敌道具【${escapeItem.name}】视为combat` });
      }
    }
  }

  // ── T≥2 idle → suicidal_idle（危机中发呆视为作死） ──
  if (tension >= 2 && intent.intent === 'idle') {
    const suicidalRoute = TENSION_ROUTE[tension]?.['suicidal_idle'];
    if (suicidalRoute) {
      ctx.intent = { ...intent, intent: 'suicidal_idle' };
      ctx.tier = rollToTier(suicidalRoute.probabilities, ctx.effectiveRoll);
      ctx.formulaBreakdown += `\n[行为覆写] 危机中idle → suicidal_idle`;
      ctx.events.push({ type: 'behavior_override', description: '危机中idle → suicidal_idle' });
    }
  }

  // ── 探索度满区域：T1 explore 大失败降级 ──
  if (tension === 1 && intent.intent === 'explore' && ctx.tier === 0) {
    const nodeKey = state.currentNodeId ? `node_${state.currentNodeId}` : '';
    const nodeProgress = nodeKey ? (ctx.newProgressMap[nodeKey] || 0) : 0;
    const isOutdoors = !state.currentHouseId;
    if (nodeProgress >= 100 && isOutdoors) {
      ctx.tier = 1;
      ctx.formulaBreakdown += '\n[行为覆写] 区域已完全探索，大失败降级为普通';
      ctx.events.push({ type: 'behavior_override', description: '区域已完全探索，大失败降级为普通' });
    }
  }
}
