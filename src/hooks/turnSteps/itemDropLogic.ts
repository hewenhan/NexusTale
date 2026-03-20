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
  const tier = resolution.snapPost.tier ?? 1;

  // ── 搜刮掉落: 统一 25% 掉率, tier 决定掉什么 ──
  if (isExploreSuccess) {
    if (Math.random() < 0.25) {
      if (tier === 2 && state.equipmentPresets.length > 0) {
        // 大成功 → 掉装备
        const presets = state.equipmentPresets;
        const idx = Math.floor(Math.random() * presets.length);
        prerolledEquipDrop = presets[idx];
        updateState(prev => {
          const newPresets = [...prev.equipmentPresets];
          newPresets.splice(idx, 1);
          return { equipmentPresets: newPresets };
        });
        const equipType = prerolledEquipDrop.type === 'weapon' ? '武器' : '防具';
        itemDropInstruction = narrativeEquipmentDrop({
          rarity: prerolledEquipDrop.rarity,
          typeName: equipType,
          name: prerolledEquipDrop.name,
          description: prerolledEquipDrop.description,
        });
      } else {
        // 非大成功 / 装备池为空 → 掉退敌道具
        escapeItemRarity = rollEscapeRarity();
        itemDropInstruction = narrativeItemDropFound({ rarity: escapeItemRarity, inTransit: !!resolution.newTransitState });
      }
    } else {
      itemDropInstruction = narrativeItemDropNone(!!resolution.newTransitState);
    }
  }

  // ── guaranteedDrop: boss/里程碑必掉装备（独立于搜刮判定） ──
  if (resolution.guaranteedDrop && !prerolledEquipDrop) {
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
      itemDropInstruction = narrativeEquipmentDrop({
        rarity: prerolledEquipDrop.rarity,
        typeName: equipType,
        name: prerolledEquipDrop.name,
        description: prerolledEquipDrop.description,
      });
    }
  }

  return { escapeItemRarity, itemDropInstruction, prerolledEquipDrop };
}
