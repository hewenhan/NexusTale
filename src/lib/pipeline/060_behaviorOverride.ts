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
  if (intent.intent === 'use_item' && intent.itemName && tension >= 2) {
    const escapeItem = state.inventory.find(
      i => i.type === 'escape' && i.name === intent.itemName
    ) || state.inventory.find(
      i => i.type === 'escape' && (
        i.name.includes(intent.itemName!) || intent.itemName!.includes(i.name)
      )
    );
    if (escapeItem) {
      const combatRoute = TENSION_ROUTE[tension]?.['combat'];
      if (combatRoute) {
        ctx.tier = rollToTier(combatRoute.probabilities, ctx.effectiveRoll);
        ctx.formulaBreakdown += `\n[行为覆写] 退敌道具【${escapeItem.name}】视为combat → T${ctx.tier} ${['大失败', '普通', '大成功'][ctx.tier]}`;
        ctx.events.push({ type: 'behavior_override', description: `退敌道具【${escapeItem.name}】视为combat` });
      }
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
