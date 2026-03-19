/**
 * Step 7: Post-LLM 结算
 *
 * AI 回复之后的所有状态写入：
 *   - 好感度变更 (affection_change)
 *   - 服装更新 (outfit_update)
 *   - 旅途主题锁定 (encounter_tag)
 *   - HP 描述 (hp_description)
 *   - 修辞黑名单 (figures_of_speech)
 *   - 待入包道具收集 (bag items assembly)
 */

import type { GameState, InventoryItem, Rarity } from '../../types/game';
import { pickEscapeIcon } from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';

export interface LlmResponseFields {
  affection_change?: number;
  outfit_update?: Record<string, string>;
  encounter_tag?: string;
  hp_description?: string;
  figures_of_speech?: unknown[];
  get_item?: { name?: string; description?: string };
}

export interface PostLlmResult {
  pendingBagItems: InventoryItem[];
}

export function applyPostLlmSettlement(
  responseJson: LlmResponseFields,
  resolution: PipelineResult,
  state: GameState,
  updateState: (patch: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => void,
  extras: {
    pendingQuestItem: InventoryItem | null;
    prerolledEquipDrop: InventoryItem | null;
    escapeItemRarity: Rarity | null;
  },
): PostLlmResult {
  const { affection_change, outfit_update, encounter_tag, hp_description, figures_of_speech, get_item } = responseJson;

  // ── 修辞黑名单 ──
  if (Array.isArray(figures_of_speech) && figures_of_speech.length > 0) {
    updateState(prev => {
      const updated = [...prev.exhaustedRhetoric, ...figures_of_speech.filter((s: unknown) => typeof s === 'string')];
      return { exhaustedRhetoric: updated.length > 20 ? updated.slice(-20) : updated };
    });
  }

  console.log('preExhaustedRhetoric', state.exhaustedRhetoric, 'newly exhausted:', figures_of_speech);

  // ── 好感度变更 ──
  if (typeof affection_change === 'number' && affection_change !== 0) {
    const clampedChange = Math.max(-30, Math.min(10, affection_change));
    updateState(prev => ({
      affection: Math.max(0, Math.min(100, prev.affection + clampedChange))
    }));
  }

  // ── 服装更新 ──
  if (outfit_update && typeof outfit_update === 'object') {
    updateState(prev => {
      const patch: Record<string, unknown> = {};
      const companionName = prev.companionProfile.name;
      const playerName = prev.playerProfile.name;
      for (const [charName, newOutfit] of Object.entries(outfit_update)) {
        if (typeof newOutfit !== 'string' || !newOutfit) continue;
        if (charName === companionName) {
          patch.companionProfile = { ...prev.companionProfile, outfitPrompt: newOutfit };
        } else if (charName === playerName) {
          patch.playerProfile = { ...prev.playerProfile, outfitPrompt: newOutfit };
        }
      }
      return patch;
    });
  }

  // ── 旅途主题锁定 ──
  if (encounter_tag && resolution.newTransitState) {
    updateState(prev => {
      if (prev.transitState && !prev.transitState.lockedTheme) {
        return { transitState: { ...prev.transitState, lockedTheme: encounter_tag } };
      }
      return {};
    });
  }

  // ── HP 描述 ──
  if (hp_description) {
    updateState({ hpDescription: hp_description });
  }

  // ── 收集待入包道具 ──
  const pendingBagItems: InventoryItem[] = [];

  if (extras.pendingQuestItem) pendingBagItems.push(extras.pendingQuestItem);
  if (extras.prerolledEquipDrop) pendingBagItems.push(extras.prerolledEquipDrop);

  if (extras.escapeItemRarity && get_item && get_item.name) {
    pendingBagItems.push({
      id: `escape_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: get_item.name,
      type: 'escape',
      description: get_item.description || '战斗中使用可抵消一次失败惩罚',
      rarity: extras.escapeItemRarity,
      icon: pickEscapeIcon(extras.escapeItemRarity),
      quantity: 1,
      buff: null,
    });
  }

  return { pendingBagItems };
}
