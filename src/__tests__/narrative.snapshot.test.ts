/**
 * 叙事拼装快照测试
 * 
 * 目的：重构文案模板时，确保输出叙事字符串一致。
 * 策略：固定 pipeline result → assembleNarrative → 比对输出字符串快照。
 */

import { describe, test, expect, vi, beforeEach } from 'vitest';
import { runPipeline } from '../lib/pipeline/runPipeline';
import { assembleNarrative } from '../lib/pipeline/narrativeAssembler';
import { createMockState, createMockWeapon, createMockArmor } from './mockState';
import type { IntentResult } from '../types/game';

beforeEach(() => {
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});

function intent(type: IntentResult['intent'], targetId?: string, itemId?: string): IntentResult {
  return { intent: type, targetId: targetId ?? null, itemId };
}

function getNarrative(state: ReturnType<typeof createMockState>, i: IntentResult, roll: number): string {
  const result = runPipeline(state, i, roll);
  return assembleNarrative({
    result,
    intent: i,
    state,
    moveTarget: result.moveTarget,
  });
}

describe('叙事快照 - 核心场景', () => {
  test('T0 安全区 idle', () => {
    const state = createMockState({
      currentNodeId: 'node_safe',
      pacingState: { tensionLevel: 0, turnsInCurrentLevel: 3 },
    });
    expect(getNarrative(state, intent('idle'), 10)).toMatchSnapshot();
  });

  test('T0 安全区探索 - 暴击', () => {
    const state = createMockState({
      currentNodeId: 'node_safe',
      pacingState: { tensionLevel: 0, turnsInCurrentLevel: 3 },
    });
    expect(getNarrative(state, intent('explore'), 20)).toMatchSnapshot();
  });

  test('T1 探索 - 大失败', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 2 },
    });
    expect(getNarrative(state, intent('explore'), 1)).toMatchSnapshot();
  });

  test('T1 探索 - 成功', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 2 },
    });
    expect(getNarrative(state, intent('explore'), 15)).toMatchSnapshot();
  });

  test('T1 战斗 - 失败', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 2 },
    });
    expect(getNarrative(state, intent('combat'), 1)).toMatchSnapshot();
  });

  test('T2 战斗 - 秒杀', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 2, turnsInCurrentLevel: 1 },
    });
    expect(getNarrative(state, intent('combat'), 20)).toMatchSnapshot();
  });

  test('T2 撤退', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 2, turnsInCurrentLevel: 1 },
    });
    expect(getNarrative(state, intent('move', 'node_b'), 10)).toMatchSnapshot();
  });

  test('T3 战斗 - 失败', () => {
    const state = createMockState({
      hp: 50,
      pacingState: { tensionLevel: 3, turnsInCurrentLevel: 2 },
    });
    expect(getNarrative(state, intent('combat'), 1)).toMatchSnapshot();
  });

  test('T3 战斗 - 绝地反杀', () => {
    const state = createMockState({
      hp: 30,
      pacingState: { tensionLevel: 3, turnsInCurrentLevel: 2 },
    });
    expect(getNarrative(state, intent('combat'), 20)).toMatchSnapshot();
  });

  test('T4 Boss 战斗', () => {
    const state = createMockState({
      hp: 50,
      pacingState: { tensionLevel: 4, turnsInCurrentLevel: 1 },
    });
    expect(getNarrative(state, intent('combat'), 10)).toMatchSnapshot();
  });

  test('T4 Boss - 英雄斩杀', () => {
    const state = createMockState({
      hp: 50,
      pacingState: { tensionLevel: 4, turnsInCurrentLevel: 1 },
    });
    expect(getNarrative(state, intent('combat'), 20)).toMatchSnapshot();
  });

  test('Game Over', () => {
    const state = createMockState({
      hp: 5,
      lives: 0,
      pacingState: { tensionLevel: 4, turnsInCurrentLevel: 3 },
    });
    expect(getNarrative(state, intent('combat'), 1)).toMatchSnapshot();
  });

  test('死亡复活', () => {
    const state = createMockState({
      hp: 5,
      lives: 2,
      pacingState: { tensionLevel: 4, turnsInCurrentLevel: 3 },
    });
    expect(getNarrative(state, intent('combat'), 1)).toMatchSnapshot();
  });

  test('武器 + 防具叙事附加', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 2, turnsInCurrentLevel: 1 },
      inventory: [createMockWeapon(), createMockArmor()],
    });
    expect(getNarrative(state, intent('combat'), 1)).toMatchSnapshot();
  });
});

describe('叙事快照 - 赶路', () => {
  test('赶路中推进', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 1 },
      transitState: {
        fromNodeId: 'node_a',
        toNodeId: 'node_b',
        pathProgress: 30,
        lockedTheme: null,
      },
    });
    expect(getNarrative(state, intent('explore'), 10)).toMatchSnapshot();
  });

  test('赶路抵达', () => {
    const state = createMockState({
      pacingState: { tensionLevel: 1, turnsInCurrentLevel: 1 },
      transitState: {
        fromNodeId: 'node_a',
        toNodeId: 'node_b',
        pathProgress: 90,
        lockedTheme: '晴天',
      },
    });
    expect(getNarrative(state, intent('explore'), 20)).toMatchSnapshot();
  });
});

// TODO: applyNarrativeOverrides 的快照测试将在 Step 2B 迁移后添加
