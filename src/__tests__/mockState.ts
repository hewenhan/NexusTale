/**
 * 测试用 GameState 工厂函数
 * 提供最小可运行的 mock state，各测试场景按需覆盖字段
 */

import type { GameState, InventoryItem } from '../types/game';

const BASE_NODE = {
  id: 'node_a',
  name: '废弃广场',
  type: 'city' as const,
  safetyLevel: 'medium' as const,
  connections: ['node_b'],
  progress: 0,
  houses: [
    {
      id: 'house_a1',
      name: '废弃商店',
      type: 'shop' as const,
      safetyLevel: 'low' as const,
      progress: 0,
      revealed: true,
    },
    {
      id: 'house_a2',
      name: '地下室',
      type: 'housing' as const,
      safetyLevel: 'high' as const,
      progress: 0,
      revealed: false,
    },
  ],
};

const SAFE_NODE = {
  id: 'node_safe',
  name: '安全营地',
  type: 'town' as const,
  safetyLevel: 'safe' as const,
  connections: ['node_a'],
  progress: 50,
  houses: [],
};

const BASE_WORLD = {
  id: 'world_test',
  name: '测试世界',
  nodes: [BASE_NODE, SAFE_NODE, {
    id: 'node_b',
    name: '黑暗森林',
    type: 'wilderness' as const,
    safetyLevel: 'high' as const,
    connections: ['node_a'],
    progress: 0,
    houses: [],
  }],
};

const BASE_PROFILE = {
  name: 'TestNPC',
  age: '25',
  gender: 'Female' as const,
  orientation: 'Bisexual' as const,
  skinColor: 'fair',
  height: '165cm',
  weight: 'slim',
  hairStyle: 'long',
  hairColor: 'black',
  personalityDesc: '沉默寡言但内心温柔',
  specialties: '射箭',
  hobbies: '读书',
  dislikes: '噪音',
  description: 'A quiet companion',
  personality: 'introverted',
  background: 'Former hunter',
  bodyPrompt: 'fair skin, long black hair',
  outfitPrompt: 'leather armor',
  isFleshedOut: true,
};

const PLAYER_PROFILE = {
  ...BASE_PROFILE,
  name: 'TestPlayer',
  gender: 'Male' as const,
};

export function createMockState(overrides: Partial<GameState> = {}): GameState {
  return {
    playerProfile: PLAYER_PROFILE,
    companionProfile: BASE_PROFILE,
    worldview: '末世废土生存',
    worldviewUserInput: '末世废土',
    history: [],
    isFirstRun: false,
    summary: '',
    turnsSinceLastSummary: 0,
    summaryCoveredUpTo: 0,
    loadingMessages: [],
    language: 'zh',
    hp: 80,
    hpDescription: 'Minor scratches',
    lives: 3,
    isGameOver: false,
    inventory: [],
    worldData: BASE_WORLD,
    mapImageFileName: null,
    currentWorldId: 'world_test',
    currentNodeId: 'node_a',
    characterPortraitFileName: null,
    playerPortraitFileName: null,
    currentHouseId: null,
    transitState: null,
    exhaustedThemes: [],
    exhaustedRhetoric: [],
    pacingState: { tensionLevel: 0, turnsInCurrentLevel: 1 },
    currentObjective: null,
    questChain: null,
    currentQuestStageIndex: 0,
    equipmentPresets: [],
    worldviewUpdates: [],
    lastCeremony: null,
    artStylePrompt: 'post-apocalyptic',
    affection: 50,
    ...overrides,
  };
}

export function createMockWeapon(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'weapon_1',
    name: '生锈大刀',
    type: 'weapon',
    description: '一把锈迹斑斑的大刀',
    rarity: 'uncommon',
    icon: '⚔️',
    quantity: 1,
    buff: 40,
    ...overrides,
  };
}

export function createMockArmor(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'armor_1',
    name: '破旧护甲',
    type: 'armor',
    description: '聊胜于无的防护',
    rarity: 'common',
    icon: '🛡️',
    quantity: 1,
    buff: 25,
    ...overrides,
  };
}

export function createMockEscapeItem(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: 'escape_1',
    name: '闪光弹',
    type: 'escape',
    description: '致盲敌人的闪光装置',
    rarity: 'rare',
    icon: '💥',
    quantity: 1,
    buff: null,
    ...overrides,
  };
}
