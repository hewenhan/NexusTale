/**
 * Step ⑧ HP 结算
 *
 * 职责：
 * - 根据 tier + tensionConfig.hpDelta 计算 HP 增减
 * - 安全区内自动回血 +5
 * - 赶路中的 HP 按紧张度分级计算
 * - 防具减伤：ctx.armorReduction
 * - 退敌道具：use_item + escape 类型 → 消耗道具，按 tier 决定效果
 *   大成功：危机解除；大失败：免伤；普通：不扣血
 * - emit hp_change / escape_item_used 事件
 *
 * 纯计算，不生成叙事。
 */

import type { PipelineContext } from './types';
import { TENSION_ROUTE } from '../tensionConfig';

function applyArmor(rawDelta: number, armorReduction: number): number {
  if (rawDelta >= 0 || armorReduction <= 0) return rawDelta;
  return Math.round(rawDelta * (1 - armorReduction / 100));
}

export function stepHpSettlement(ctx: PipelineContext): void {
  const { state, intent } = ctx;
  const tension = state.pacingState.tensionLevel;
  const action = intent.intent;

  // ── 退敌道具处理 ──
  if (action === 'use_item' && intent.itemName) {
    const itemNameLower = intent.itemName.toLowerCase().trim();
    const escapeItem = state.inventory.find(
      i => i.type === 'escape' && i.name.toLowerCase().trim() === itemNameLower
    ) || state.inventory.find(
      i => i.type === 'escape' && (
        i.name.includes(intent.itemName!) || intent.itemName!.includes(i.name)
      )
    );
    if (escapeItem && tension >= 2) {
      // 消耗道具
      ctx.escapeItemUsed = escapeItem;
      ctx.newInventory = ctx.newInventory.filter(i => i.id !== escapeItem.id);
      // 退敌道具：全部免扣血（大失败=免伤，普通=退敌，大成功=秒杀解危）
      ctx.isSuccess = ctx.tier > 0;
      ctx.events.push({ type: 'escape_item_used', item: escapeItem, tier: ctx.tier });
      return;
    }
  }

  // ── 安全区回血 ──
  if (ctx.isInSafeZone && !state.transitState) {
    const oldHp = state.hp;
    ctx.newHp = Math.min(100, state.hp + 5);
    if (ctx.newHp !== oldHp) {
      ctx.events.push({ type: 'hp_change', from: oldHp, to: ctx.newHp, rawDelta: 5, finalDelta: ctx.newHp - oldHp, armorName: null, armorReduction: 0 });
    }
    return;
  }

  // ── 赶路 HP ──
  if (state.transitState) {
    let failHpDelta: number;
    if (tension >= 4) failHpDelta = -25;
    else if (tension >= 3) failHpDelta = -15;
    else if (tension >= 2) failHpDelta = -5;
    else failHpDelta = 0;

    if (ctx.tier === 0 && failHpDelta < 0) {
      const finalDelta = applyArmor(failHpDelta, ctx.armorReduction);
      const oldHp = state.hp;
      ctx.newHp = Math.max(0, state.hp + finalDelta);
      const armorItem = ctx.armorReduction > 0 ? (state.inventory.find(i => i.type === 'armor' && i.buff === ctx.armorReduction)?.name ?? null) : null;
      ctx.events.push({ type: 'hp_change', from: oldHp, to: ctx.newHp, rawDelta: failHpDelta, finalDelta, armorName: armorItem, armorReduction: ctx.armorReduction });
    }
    return;
  }

  // ── 常规 HP 结算 ──
  const table = TENSION_ROUTE[tension];
  if (!table) return;

  let routeKey: string = action;
  if (action === 'seek_quest') routeKey = 'default';
  const route = table[routeKey] || table['default'];
  if (!route) return;

  const rawDelta = route.hpDelta[ctx.tier];
  if (rawDelta === 0) return;

  const finalDelta = applyArmor(rawDelta, ctx.armorReduction);
  const oldHp = state.hp;
  ctx.newHp = Math.max(0, Math.min(100, state.hp + finalDelta));
  const armorItem = (ctx.armorReduction > 0 && rawDelta < 0)
    ? (state.inventory.find(i => i.type === 'armor' && i.buff === ctx.armorReduction)?.name ?? null)
    : null;
  ctx.events.push({ type: 'hp_change', from: oldHp, to: ctx.newHp, rawDelta, finalDelta, armorName: armorItem, armorReduction: ctx.armorReduction });
}
