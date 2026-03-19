/**
 * equipmentService — 装备预设池生成
 */

import * as modelService from './modelService';
import type { InventoryItem, Rarity } from '../types/game';
import { GAME_CONFIG } from '../lib/gameConfig';
import { cleanJsonText } from './jsonRecovery';

export async function generateEquipmentPresets(
  worldview: string,
  language: 'zh' | 'en' = 'zh'
): Promise<InventoryItem[]> {
  const langInstruction = language === 'zh' ? 'All names and descriptions MUST be in Chinese.' : 'All content MUST be in English.';
  const rarities: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary'];

  const prompt = `You are an expert RPG item designer.

Worldview: "${worldview}"

Generate equipment items for this world. You need to create:
- 25 WEAPONS (5 per rarity tier)
- 25 ARMOR pieces (5 per rarity tier)

Rarity tiers: common, uncommon, rare, epic, legendary

For each item, provide:
- name: A creative, worldview-fitting name
- description: A short 1-sentence description of the item's lore/appearance
- icon: A single emoji that represents the weapon or armor piece

IMPORTANT: Items must feel like they belong in this specific world. A cyberpunk world should have plasma rifles and nano-armor, not medieval swords.

${langInstruction}

Return ONLY a JSON object with this structure (no markdown):
{
  "weapons": {
    "common": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "uncommon": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "rare": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "epic": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "legendary": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items]
  },
  "armors": {
    "common": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "uncommon": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "rare": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "epic": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items],
    "legendary": [{ "name": "...", "description": "...", "icon": "..." }, ...5 items]
  }
}`;

  const text = await modelService.generateText('text', prompt, { jsonMode: true, novelty: true });
  if (!text) throw new Error('Failed to generate equipment presets');

  const cleaned = cleanJsonText(text);
  const parsed = JSON.parse(cleaned);

  const items: InventoryItem[] = [];
  let idCounter = 0;

  for (const equipType of ['weapons', 'armors'] as const) {
    const itemType: 'weapon' | 'armor' = equipType === 'weapons' ? 'weapon' : 'armor';
    for (const rarity of rarities) {
      const buffValues = GAME_CONFIG.combat.buffTable[rarity];
      const rawItems = parsed[equipType]?.[rarity] || [];
      for (let i = 0; i < Math.min(5, rawItems.length); i++) {
        const raw = rawItems[i];
        items.push({
          id: `eq_${itemType}_${rarity}_${idCounter++}`,
          name: raw.name || `Unknown ${itemType}`,
          type: itemType,
          description: raw.description || '',
          rarity,
          icon: raw.icon || (itemType === 'weapon' ? '⚔️' : '🛡️'),
          quantity: 1,
          buff: buffValues[i] ?? buffValues[0],
        });
      }
    }
  }

  return items;
}
