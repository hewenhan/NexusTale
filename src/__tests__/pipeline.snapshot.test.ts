/**
 * 管线快照测试
 * 
 * 目的：重构文案拼接时，确保管线数值运算结果不变。
 * 策略：固定输入(state + intent + d20Roll) → runPipeline → 比对输出快照。
 * 
 * 注意：管线内有 Math.random()（好感度检定），用 vi.spyOn 固定。
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { runPipeline } from '../lib/pipeline/runPipeline';
import { createMockState, createMockWeapon, createMockArmor, createMockEscapeItem } from './mockState';
import type { IntentResult } from '../types/game';

// 固定 Math.random 以消除好感度检定随机性
beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

function intent(type: IntentResult['intent'], targetId?: string, itemId?: string): IntentResult {
  return { intent: type, targetId: targetId ?? null, itemId };
}

// ─── 快照工具：提取管线关键输出（剥离 snapPre/snapPost 中的 inventory 引用避免循环） ───
function extractPipelineSnapshot(result: ReturnType<typeof runPipeline>) {
  return {
    newHp: result.newHp,
    newLives: result.newLives,
    newTensionLevel: result.newTensionLevel,
    newNodeId: result.newNodeId,
    newHouseId: result.newHouseId,
    newIsGameOver: result.newIsGameOver,
    roll: result.roll,
    isSuccess: result.isSuccess,
    progressCapped: result.progressCapped,
    affectionTriggered: result.affectionTriggered,
    tensionChanged: result.tensionChanged,
    armorReduction: result.armorReduction,
    weaponRollBonus: result.weaponRollBonus,
    events: result.events.map(e => e.type),
    snapPre: {
      hp: result.snapPre.hp,
      tensionLevel: result.snapPre.tensionLevel,
      intent: result.snapPre.intent,
    },
    snapPost: {
      hp: result.snapPost.hp,
      tensionLevel: result.snapPost.tensionLevel,
      intent: result.snapPost.intent,
      tier: result.snapPost.tier,
    },
  };
}

describe('管线快照 - 核心场景', () => {
  test('T0 安全区探索 - 普通', () => {
    const state = createMockState({
      currentNodeId: 'node_safe',
      pacingState: { tensionLevel: 0, turnsInCurrentLevel: 3 },
    });
    const result = runPipeline(state, intent('explore'), 10);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('T0 安全区探索 - 暴击', () => {
    const state = createMockState({
      currentNodeId: 'node_safe',
      pacingState: { tensionLevel: 0, turnsInCurrentLevel: 3 },
    });
    const result = runPipeline(state, intent('explore'), 20);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('T1 探索 - 大失败', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 2 },
    });
    const result = runPipeline(state, intent('explore'), 1);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('T1 探索 - 成功', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 2 },
    });
    const result = runPipeline(state, intent('explore'), 15);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('T2 战斗 - 大失败', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 2, turnsInCurrentLevel: 1 },
    });
    const result = runPipeline(state, intent('combat'), 1);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('T2 战斗 - 秒杀', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 2, turnsInCurrentLevel: 1 },
    });
    const result = runPipeline(state, intent('combat'), 20);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('T3 战斗 - 绝地反杀', () => {
    const state = createMockState({
      hp: 30,
      pacingState: { tensionLevel: 3, turnsInCurrentLevel: 2 },
    });
    const result = runPipeline(state, intent('combat'), 20);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('T2 移动撤退', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 2, turnsInCurrentLevel: 1 },
    });
    const result = runPipeline(state, intent('move', 'node_b'), 10);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('死亡 - 有复活币', () => {
    const state = createMockState({
      hp: 5,
      lives: 2,
      pacingState: { tensionLevel: 4, turnsInCurrentLevel: 3 },
    });
    const result = runPipeline(state, intent('combat'), 1);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('死亡 - 无复活币 Game Over', () => {
    const state = createMockState({
      hp: 5,
      lives: 0,
      pacingState: { tensionLevel: 4, turnsInCurrentLevel: 3 },
    });
    const result = runPipeline(state, intent('combat'), 1);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('里程碑 - 探索度满 (node)', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 5 },
    });
    // 手动设置 node_a progress 到 95% 让管线推到 100
    if (state.worldData) {
      state.worldData.nodes[0].progress = 95;
    }
    const result = runPipeline(state, intent('explore'), 15);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('武器 buff 生效 (T2 战斗)', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 2, turnsInCurrentLevel: 1 },
      inventory: [createMockWeapon()],
    });
    const result = runPipeline(state, intent('combat'), 10);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('防具 减伤 (T2 战斗失败)', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 2, turnsInCurrentLevel: 1 },
      inventory: [createMockArmor()],
    });
    const result = runPipeline(state, intent('combat'), 1);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });
});

describe('管线快照 - 赶路场景', () => {
  test('赶路中 - 普通推进', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 1 },
      transitState: {
        fromNodeId: 'node_a',
        toNodeId: 'node_b',
        pathProgress: 30,
        lockedTheme: '沙暴',
      },
    });
    const result = runPipeline(state, intent('explore'), 10);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });

  test('赶路中 - 到达目的地', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 1 },
      transitState: {
        fromNodeId: 'node_a',
        toNodeId: 'node_b',
        pathProgress: 90,
        lockedTheme: '晴天',
      },
    });
    const result = runPipeline(state, intent('explore'), 20);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });
});

describe('管线快照 - 退敌道具', () => {
  test('退敌道具使用 (T2)', () => {
    const escapeItem = createMockEscapeItem();
    const state = createMockState({
      pacingState: { tensionLevel: 2, turnsInCurrentLevel: 1 },
      inventory: [escapeItem],
    });
    const result = runPipeline(state, intent('use_item', null, 'escape_1'), 10);
    expect(extractPipelineSnapshot(result)).toMatchSnapshot();
  });
});
