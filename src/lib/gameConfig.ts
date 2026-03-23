/**
 * gameConfig — 全局游戏平衡参数中心
 *
 * 所有散布在多文件中的 magic number 统一收口于此。
 */

export const GAME_CONFIG = {
  tension: {
    maxLevel: 4,
    safeZoneLevel: 0,
    revivalLevel: 1,
  },
  inventory: {
    capacity: 10,
    maxExhaustedThemes: 20,
    maxExhaustedRhetoric: 20,
  },
  progress: {
    houseRevealInterval: 30,
    safeExploreNormal: 15,
    safeExploreCrit: 40,
    transitPerTier: [0, 25, 50] as readonly number[],
  },
  hp: {
    max: 100,
    initial: 100,
    safeRegen: 5,
    revivalHp: 20,
  },
  lives: {
    initial: 3,
  },
  affection: {
    initial: 50,
    min: 0,
    max: 100,
    changeClamp: { min: -30, max: 10 },
    neutralThreshold: 60,
    minTensionToTrigger: 2,
  },
  summary: {
    threshold: 20,
    keepRecentTurns: 10,
    maxChars: 1500,
  },
  d20: {
    max: 20,
    min: 1,
    affectionModifier: 3,
    affectionCoeff: 0.75,
    affectionBaseline: 60,
    weaponBonusScale: 5,
    safeZoneProbs: [0, 0.7, 0.3] as readonly [number, number, number],
  },
  transit: {
    hpDelta: { t4: -25, t3: -15, t2: -5, t1: 0 } as Record<string, number>,
    probabilities: {
      t4: [0.50, 0.40, 0.10] as readonly [number, number, number],
      t3: [0.30, 0.60, 0.10] as readonly [number, number, number],
      t2: [0.15, 0.65, 0.20] as readonly [number, number, number],
      t1: [0.08, 0.72, 0.20] as readonly [number, number, number],
    },
  },
  hpDescription: {
    healthy: 80,
    minor: 50,
    wounded: 30,
  },
  combat: {
    buffTable: {
      common:    [20, 22, 24, 26, 28],
      uncommon:  [32, 34, 36, 38, 40],
      rare:      [44, 48, 52, 56, 60],
      epic:      [62, 66, 70, 74, 78],
      legendary: [72, 74, 76, 78, 80],
    },
  },
  drops: {
    escapeItemChance: 0.25,
    equipDropMinRoll: 17,
    equipDropChance: 0.3,
  },
  debug: {
    enabled: true,
  },
  /** 不耻下问系统：空闲嘲讽 & 自动编故事 */
  taunt: {
    /** 空闲多久后触发嘲讽弹窗（毫秒） */
    idleTriggerMs: 90_000,
    /** 弹窗内倒计时秒数（纯视觉效果，倒计时结束后自动触发求助） */
    countdownSeconds: 0,
    /** 空输入发送时自动编故事（Enter / 点击发送时输入框为空则触发） */
    emptyInputAutoStory: true,
  },
} as const;
