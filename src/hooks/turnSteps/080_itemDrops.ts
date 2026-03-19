/**
 * Step 080: 道具 & 装备掉落
 *
 * 探索成功后的退敌道具掉落 + 装备掉落逻辑。
 */

import type { TurnContext } from './types';
import { resolveItemDrops } from './itemDropLogic';

export function stepItemDrops(ctx: TurnContext): void {
  const { deps: { state, updateState }, intent, resolution } = ctx;

  const { escapeItemRarity, itemDropInstruction, prerolledEquipDrop } = resolveItemDrops(
    intent, resolution!, state, updateState,
  );

  ctx.escapeItemRarity = escapeItemRarity;
  ctx.itemDropInstruction = itemDropInstruction;
  ctx.prerolledEquipDrop = prerolledEquipDrop;
}
