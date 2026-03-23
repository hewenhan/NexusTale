import { useState, useRef, useCallback, useEffect } from 'react';
import { useGame } from '../contexts/GameContext';
import { generateAutoUserAction } from '../services/aiService';
import { handleError } from '../lib/errorPolicy';
import { GAME_CONFIG } from '../lib/gameConfig';

const { idleTriggerMs, countdownSeconds } = GAME_CONFIG.taunt;

interface UseAutoStoryTauntOptions {
  /** 当前是否正在等待 AI 回复（true 时暂停空闲检测） */
  isProcessing: boolean;
  /** 是否有其他 Overlay 打开（打开时暂停空闲检测） */
  hasOverlay?: boolean;
}

export function useAutoStoryTaunt({ isProcessing, hasOverlay = false }: UseAutoStoryTauntOptions) {
  const { state } = useGame();
  const [isTauntVisible, setIsTauntVisible] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 追踪 isProcessing 的前一帧，用于检测 true→false 边沿
  const prevProcessingRef = useRef(isProcessing);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      setIsTauntVisible(true);
    }, idleTriggerMs);
  }, [clearTimer]);

  /** 外部调用：用户有交互时重置计时器 */
  const resetTimer = useCallback(() => {
    if (isTauntVisible || isGenerating) return; // 弹窗中不重置
    startTimer();
  }, [isTauntVisible, isGenerating, startTimer]);

  /** 关闭弹窗（用户选择 "会啊"），重新开始计时 */
  const closeTaunt = useCallback(() => {
    setIsTauntVisible(false);
    startTimer();
  }, [startTimer]);

  /** 触发自动编故事，返回生成的文本 */
  const triggerAutoStory = useCallback(async (): Promise<string | null> => {
    setIsGenerating(true);
    try {
      const currentNode = state.worldData?.nodes.find(n => n.id === state.currentNodeId);
      const currentHouse = currentNode?.houses.find(h => h.id === state.currentHouseId);
      const locationName = currentHouse
        ? `${currentNode?.name ?? '未知'} - ${currentHouse.name}`
        : currentNode?.name ?? '未知区域';

      const questDesc = state.currentObjective?.description ?? null;

      const ctx = {
        worldview: state.worldview,
        currentLocation: locationName,
        currentQuest: questDesc,
        inventory: state.inventory.map(i => `${i.icon}${i.name}`),
        companionName: state.companionProfile.name || 'AI',
        recentHistory: state.history
          .filter(m => m.role === 'user')
          .slice(-3)
          .map(m => m.text),
      };

      const action = await generateAutoUserAction(ctx, state);
      setIsTauntVisible(false);
      return action;
    } catch (e) {
      handleError('silent', 'Auto story generation failed', e);
      setIsTauntVisible(false);
      return null;
    } finally {
      setIsGenerating(false);
      // 不在这里 startTimer —— 等 isProcessing true→false 边沿再启动
    }
  }, [state]);

  // 核心生命周期：根据 isProcessing / hasOverlay 管理计时器
  useEffect(() => {
    const wasProcessing = prevProcessingRef.current;
    prevProcessingRef.current = isProcessing;

    if (isProcessing || hasOverlay) {
      // AI 正在回复 或 有 overlay 打开 → 暂停计时
      clearTimer();
    } else if (wasProcessing && !isProcessing) {
      // isProcessing 刚从 true→false（AI 回复完毕 + 动画结束）→ 重新开始计时
      if (!isTauntVisible && !isGenerating) {
        startTimer();
      }
    } else if (!isTauntVisible && !isGenerating) {
      startTimer();
    }

    return clearTimer;
  }, [isProcessing, hasOverlay, isTauntVisible, isGenerating, clearTimer, startTimer]);

  return {
    isTauntVisible,
    isGenerating,
    closeTaunt,
    triggerAutoStory,
    resetTimer,
    countdownSeconds,
  };
}
