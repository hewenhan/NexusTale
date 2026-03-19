/**
 * Step 3.9 + 3.9b: 道具掉落 & 装备掉落
 *
 * 将 explore 成功后的退敌道具掉落 + 装备掉落逻辑统一收口。
 */

import type { GameState, InventoryItem, Rarity, IntentResult } from '../../types/game';
import { rollEscapeRarity } from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';
import {
  narrativeItemDropFound, narrativeItemDropNone, narrativeEquipmentDrop,
} from '../../lib/narrativeRegistry';

export interface ItemDropResult {
  escapeItemRarity: Rarity | null;
  itemDropInstruction: string | null;
  prerolledEquipDrop: InventoryItem | null;
}

export function resolveItemDrops(
  intent: IntentResult,
  resolution: PipelineResult,
  state: GameState,
  updateState: (patch: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => void,
): ItemDropResult {
  let escapeItemRarity: Rarity | null = null;
  let itemDropInstruction: string | null = null;
  let prerolledEquipDrop: InventoryItem | null = null;

  const isExploreSuccess = resolution.isSuccess && intent.intent === 'explore' && !resolution.progressCapped;

  // ── Step 3.9: Escape item drop ──
  if (isExploreSuccess) {
    if (Math.random() < 0.25) {
      escapeItemRarity = rollEscapeRarity();
      itemDropInstruction = narrativeItemDropFound({ rarity: escapeItemRarity, inTransit: !!resolution.newTransitState });
    } else {
      itemDropInstruction = narrativeItemDropNone(!!resolution.newTransitState);
    }
  }

  // ── Step 3.9b: Equipment drop ──
  const shouldDropEquip = resolution.guaranteedDrop
    || (isExploreSuccess && !resolution.progressCapped && resolution.roll >= 17 && Math.random() < 0.3);

  if (shouldDropEquip) {
    const presets = state.equipmentPresets;
    if (presets.length > 0) {
      const idx = Math.floor(Math.random() * presets.length);
      prerolledEquipDrop = presets[idx];
      updateState(prev => {
        const newPresets = [...prev.equipmentPresets];
        newPresets.splice(idx, 1);
        return { equipmentPresets: newPresets };
      });
      const equipType = prerolledEquipDrop.type === 'weapon' ? '武器' : '防具';
      const equipInstruction = narrativeEquipmentDrop({
        rarity: prerolledEquipDrop.rarity,
        typeName: equipType,
        name: prerolledEquipDrop.name,
        description: prerolledEquipDrop.description,
      });
      itemDropInstruction = (itemDropInstruction || '') + equipInstruction;
    }
  }

  return { escapeItemRarity, itemDropInstruction, prerolledEquipDrop };
}
