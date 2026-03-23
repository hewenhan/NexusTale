import { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { useGrandNotification, type GrandNotificationData } from '../components/GrandNotification';
import { handleError } from '../lib/errorPolicy';
import { INVENTORY_CAPACITY } from '../types/game';
import type { QuestCompletionCeremony, InventoryItem, IntentResult, ConfuseData } from '../types/game';

import { runTurn } from './turnSteps';
import { translatePinyinInput } from '../services/pinyinTranslateService';
import type { TurnDeps } from './turnSteps';

// ─── Main Hook ────────────────────────────────────────────────

export function useChatLogic() {
  const { state, addMessage, updateState } = useGame();
  const { isAuthenticated, accessToken } = useAuth();
  const { show: showNotification } = useGrandNotification();
  const [isProcessing, setIsProcessing] = useState(false);
  const pendingNotificationsRef = useRef<Omit<GrandNotificationData, 'id'>[]>([]);

  // ── Bag entry: blocking discard panel state ──
  const [pendingBagItem, setPendingBagItem] = useState<InventoryItem | null>(null);
  const bagResolveRef = useRef<((newInv: InventoryItem[]) => void) | null>(null);

  /** Try to add item to bag. If full, show DiscardPanel and wait for user to discard one. */
  const addItemToBag = useCallback(async (item: InventoryItem, rollingInvRef: { current: InventoryItem[] }): Promise<void> => {
    if (rollingInvRef.current.length < INVENTORY_CAPACITY) {
      const appended = [...rollingInvRef.current, item];
      rollingInvRef.current = appended;
      updateState({ inventory: appended });
      showNotification({ type: 'discovery', title: '获得道具！', description: `${item.icon} ${item.name}（${item.rarity}）` });
      return;
    }
    // Bag full → show discard panel and block until resolved
    setPendingBagItem(item);
    return new Promise<void>(resolve => {
      bagResolveRef.current = (resolvedInv: InventoryItem[]) => {
        rollingInvRef.current = resolvedInv;
        resolve();
      };
    });
  }, [updateState, showNotification]);

  /** Called from DiscardPanel: discard selected item, add pending item, dismiss panel */
  const resolveBagDiscard = useCallback((discardItemId: string) => {
    const item = pendingBagItem;
    if (!item) return;
    const newInv = [...state.inventory.filter(i => i.id !== discardItemId), item];
    updateState({ inventory: newInv });
    showNotification({ type: 'discovery', title: '获得道具！', description: `${item.icon} ${item.name}（${item.rarity}）` });
    setPendingBagItem(null);
    if (bagResolveRef.current) {
      bagResolveRef.current(newInv);
      bagResolveRef.current = null;
    }
  }, [pendingBagItem, state.inventory, updateState, showNotification]);

  /** Called from DiscardPanel: reject the incoming item (discard it without adding) */
  const rejectBagItem = useCallback(() => {
    if (!pendingBagItem) return;
    setPendingBagItem(null);
    if (bagResolveRef.current) {
      bagResolveRef.current(state.inventory);
      bagResolveRef.current = null;
    }
  }, [pendingBagItem, state.inventory]);

  const setPendingNotificationsRef = useCallback((notifications: Omit<GrandNotificationData, 'id'>[]) => {
    pendingNotificationsRef.current = notifications;
  }, []);

  // ── Quest ceremony overlay state ──
  const [pendingCeremony, setPendingCeremony] = useState<QuestCompletionCeremony | null>(null);
  const dismissCeremony = useCallback(() => setPendingCeremony(null), []);
  const showLastCeremony = useCallback(() => {
    if (state.lastCeremony) setPendingCeremony(state.lastCeremony);
  }, [state.lastCeremony]);

  // ── Ceremony generation progress bar state ──
  const [isCeremonyGenerating, setIsCeremonyGenerating] = useState(false);

  // ── Intent confuse: blocking disambiguation state ──
  const [pendingConfuse, setPendingConfuse] = useState<{
    confuse: ConfuseData;
    defaultIntent: IntentResult;
  } | null>(null);
  const [isConfuseModalVisible, setIsConfuseModalVisible] = useState(false);
  const confuseResolveRef = useRef<((chosen: IntentResult) => void) | null>(null);

  /** Block until user resolves a confuse intent via the modal */
  const waitForConfuseResolution = useCallback((confuse: ConfuseData, defaultIntent: IntentResult): Promise<IntentResult> => {
    setPendingConfuse({ confuse, defaultIntent });
    setIsConfuseModalVisible(true);
    return new Promise<IntentResult>(resolve => {
      confuseResolveRef.current = resolve;
    });
  }, []);

  /** User confirmed an intent from the modal */
  const resolveConfuse = useCallback((chosenIntent: IntentResult) => {
    setPendingConfuse(null);
    setIsConfuseModalVisible(false);
    if (confuseResolveRef.current) {
      confuseResolveRef.current(chosenIntent);
      confuseResolveRef.current = null;
    }
  }, []);

  /** Minimize modal (still pending) */
  const minimizeConfuse = useCallback(() => {
    setIsConfuseModalVisible(false);
  }, []);

  /** Restore modal */
  const restoreConfuse = useCallback(() => {
    setIsConfuseModalVisible(true);
  }, []);

  // ── Typewriter completion synchronization ──
  const typewriterResolveRef = useRef<(() => void) | null>(null);
  const typewriterReadyRef = useRef(false);

  const waitForTypewriter = useCallback(() => {
    if (typewriterReadyRef.current) {
      typewriterReadyRef.current = false;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      const timeout = setTimeout(() => {
        console.warn('[waitForTypewriter] timed out after 30s, auto-resolving');
        typewriterResolveRef.current = null;
        resolve();
      }, 30_000);
      typewriterResolveRef.current = () => {
        clearTimeout(timeout);
        resolve();
      };
    });
  }, []);

  const flushPendingNotifications = useCallback(() => {
    if (typewriterResolveRef.current) {
      typewriterResolveRef.current();
      typewriterResolveRef.current = null;
    } else {
      typewriterReadyRef.current = true;
    }
    const items = pendingNotificationsRef.current;
    if (items.length > 0) {
      pendingNotificationsRef.current = [];
      for (const item of items) {
        showNotification(item);
      }
    }
  }, [showNotification]);

  const lockRef = useRef(false);
  const hasInitialized = useRef(false);

  useEffect(() => {
    if (state.history.length === 0 && !isProcessing && state.playerProfile.name && state.worldData && !hasInitialized.current) {
      hasInitialized.current = true;
      handleTurn("你好");
    }
  }, [state.playerProfile.name, state.worldData, state.history.length, isProcessing]);

  const handleTurn = async (userInput: string) => {
    if (!state.playerProfile.name) return false;
    if (state.isGameOver) return false;
    if (!state.worldData || !state.currentNodeId) return false;
    if (lockRef.current) return false;
    lockRef.current = true;

    setIsProcessing(true);

    // 拼音辅助：在写入聊天记录前完成翻译，确保气泡直接显示中文
    let processedInput = userInput;
    if (state.pinyinAssist) {
      try {
        const translated = await translatePinyinInput(userInput, state);
        if (translated !== userInput) {
          console.log(`[PinyinAssist] "${userInput}" → "${translated}"`);
          processedInput = translated;
        }
      } catch { /* 降级：保留原始输入 */ }
    }

    addMessage({
      id: uuidv4(),
      role: 'user',
      text: processedInput,
      timestamp: Date.now(),
    });

    try {
      const deps: TurnDeps = {
        state, updateState, addMessage,
        isAuthenticated, accessToken,
        waitForConfuseResolution, waitForTypewriter,
        typewriterReadyRef, typewriterResolveRef,
        setIsCeremonyGenerating, setPendingNotificationsRef,
        setIsProcessing, addItemToBag, setPendingCeremony,
      };

      await runTurn(deps, processedInput);

    } catch (error) {
      handleError('critical', 'Turn processing failed', error);
      addMessage({
        id: uuidv4(),
        role: 'model',
        text: "（系统错误：无法生成回复，请重试）",
        timestamp: Date.now()
      });
      setIsProcessing(false);
    } finally {
      lockRef.current = false;
    }
    return true;
  };

  return {
    isProcessing,
    handleTurn,
    flushPendingNotifications,
    pendingBagItem,
    resolveBagDiscard,
    rejectBagItem,
    // Intent confuse disambiguation
    pendingConfuse,
    isConfuseModalVisible,
    resolveConfuse,
    minimizeConfuse,
    restoreConfuse,
    // Quest completion ceremony
    pendingCeremony,
    dismissCeremony,
    showLastCeremony,
    // Ceremony generation progress bar
    isCeremonyGenerating,
    // 暴露锁，供空输入自动编故事等场景使用
    lockRef,
    setIsProcessing,
  };
}
