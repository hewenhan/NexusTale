import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { AnimatePresence } from 'motion/react';
import { DEFAULT_PROFILE, DEFAULT_LOADING_MESSAGES, INITIAL_STATE, type Gender, type Orientation } from '../types/game';
import { VirtuosoHandle } from 'react-virtuoso';
import { DebugOverlay } from '../components/DebugOverlay';
import { useChatLogic } from '../hooks/useChatLogic';
import { useBGMControl } from '../contexts/BGMContext';
import { ChatInput } from '../components/ChatInput';
import { ProgressTracker } from '../components/ProgressTracker';
import { type TextSpeed } from '../components/TypewriterMessage';
import { ProfileModal } from '../components/ProfileModal';
import { StatusSidebar } from '../components/StatusSidebar';
import { MapOverlay } from '../components/MapOverlay';
import { FleshingOutOverlay } from '../components/FleshingOutOverlay';
import { DriveToast } from '../components/DriveToast';
import { FakeProgressBarHandle } from '../components/FakeProgressBar';
import { useRetryDialog } from '../components/RetryDialog';
import { InventoryPanel } from '../components/InventoryPanel';
import { DiscardPanel } from '../components/DiscardPanel';
import { IntentConfirmModal } from '../components/IntentConfirmModal';
import { PendingIntentBanner } from '../components/PendingIntentBanner';
import { QuestCeremonyOverlay } from '../components/QuestCeremonyOverlay';
import { ChatHeader } from '../components/ChatHeader';
import { ChatMessageList } from '../components/ChatMessageList';
import { usePortraitLoader } from '../hooks/usePortraitLoader';
import { useAffectionAnim } from '../hooks/useAffectionAnim';
import { useWorldInit } from '../hooks/useWorldInit';
import { usePortraitRegeneration } from '../hooks/usePortraitRegeneration';
import { RagStatusIndicator } from '../components/RagStatusIndicator';

export default function Chat() {
  const { state, updateState, exportSave } = useGame();
  const { isAuthenticated, driveError, reconnectDrive, accessToken } = useAuth();
  const [showStatus, setShowStatus] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showInventory, setShowInventory] = useState(false);
  const [textSpeed, setTextSpeed] = useState<TextSpeed>('normal');
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [driveToastDismissed, setDriveToastDismissed] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const chatAreaRef = useRef<HTMLDivElement>(null);

  // Retry dialog for failed AI requests
  const { retryDialog, showRetry } = useRetryDialog();

  // Extracted hooks
  const { affectionDelta, affectionAnimKey } = useAffectionAnim(state.affection);
  const { url: portraitUrl } = usePortraitLoader(state.characterPortraitFileName);
  const { url: playerPortraitUrl } = usePortraitLoader(state.playerPortraitFileName);

  // Progress bar refs for loading overlays
  const worldProgressRef = useRef<FakeProgressBarHandle>(null);
  const characterProgressRef = useRef<FakeProgressBarHandle>(null);

  // 已播放过打字动画的消息 ID 集合（防止 Virtuoso 卸载/重挂时重新打字）
  const animatedIdsRef = useRef<Set<string>>(new Set(state.history.map(m => m.id)));

  const { isProcessing, handleTurn, flushPendingNotifications, pendingBagItem, resolveBagDiscard, rejectBagItem, pendingConfuse, isConfuseModalVisible, resolveConfuse, minimizeConfuse, restoreConfuse, pendingCeremony, dismissCeremony, showLastCeremony, isCeremonyGenerating } = useChatLogic();

  // World initialization (extracted hook)
  const { isGeneratingWorld, isFleshingOutCharacter } = useWorldInit({
    state, updateState, showRetry, worldProgressRef, characterProgressRef, isProcessing,
  });

  // ── Deferred display snapshot ──
  const latestDeferredRef = useRef({
    currentNodeId: state.currentNodeId,
    currentHouseId: state.currentHouseId,
    transitState: state.transitState,
    currentObjective: state.currentObjective,
  });
  useEffect(() => {
    latestDeferredRef.current = {
      currentNodeId: state.currentNodeId,
      currentHouseId: state.currentHouseId,
      transitState: state.transitState,
      currentObjective: state.currentObjective,
    };
  }, [state.currentNodeId, state.currentHouseId, state.transitState, state.currentObjective]);

  const [displaySnapshot, setDisplaySnapshot] = useState(latestDeferredRef.current);

  useEffect(() => {
    if (!isProcessing) {
      setDisplaySnapshot(latestDeferredRef.current);
    }
  }, [isProcessing, state.currentNodeId, state.currentHouseId, state.transitState, state.currentObjective]);

  const wrappedFlushNotifications = useCallback(() => {
    flushPendingNotifications();
    setDisplaySnapshot({ ...latestDeferredRef.current });
  }, [flushPendingNotifications]);

  // BGM — undefined means "don't touch, keep previous BGM playing"
  const currentBgmKey = useMemo(() => {
    for (let i = state.history.length - 1; i >= 0; i--) {
      if (state.history[i].bgmKey) return state.history[i].bgmKey;
    }
    return undefined;
  }, [state.history]);
  const { volume, changeVolume } = useBGMControl(currentBgmKey);

  // Loading messages
  const [currentLoadingMessage, setCurrentLoadingMessage] = useState(DEFAULT_LOADING_MESSAGES[0]);
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isProcessing) {
      const messages = state.loadingMessages && state.loadingMessages.length > 0
        ? state.loadingMessages
        : DEFAULT_LOADING_MESSAGES;
      setCurrentLoadingMessage(messages[Math.floor(Math.random() * messages.length)]);
      interval = setInterval(() => {
        setCurrentLoadingMessage(messages[Math.floor(Math.random() * messages.length)]);
      }, 3000);
    }
    return () => clearInterval(interval);
  }, [isProcessing, state.loadingMessages]);

  // Profile modal
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [tempName, setTempName] = useState("");
  const [tempGender, setTempGender] = useState<Gender>('Male');
  const [tempOrientation, setTempOrientation] = useState<Orientation>('Heterosexual');

  useEffect(() => {
    if (!state.playerProfile.name) setShowProfileModal(true);
  }, [state.playerProfile.name]);

  const handleReconnectDrive = useCallback(async () => {
    setIsReconnecting(true);
    try {
      await reconnectDrive();
      setDriveToastDismissed(false);
    } finally {
      setIsReconnecting(false);
    }
  }, [reconnectDrive]);

  const handleProfileSubmit = () => {
    if (!tempName.trim()) return;
    updateState({
      playerProfile: { ...DEFAULT_PROFILE, name: tempName, gender: tempGender, orientation: tempOrientation }
    });
    setShowProfileModal(false);
  };

  useEffect(() => {
    if (state.history.length > 0) {
      setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({ index: state.history.length - 1, align: 'end', behavior: 'smooth' });
      }, 100);
    }
  }, [state.history.length]);

  const handleImageLoaded = useCallback((fileName: string, url: string) => {
    setImageUrls(prev => prev[fileName] ? prev : { ...prev, [fileName]: url });
  }, []);

  const handleDeleteMessage = useCallback((index: number) => {
    const newHistory = [...state.history];
    if (index >= 0 && index < newHistory.length) {
      newHistory.splice(index, 1);
      const lastMessage = newHistory[newHistory.length - 1];
      let newPacingState = state.pacingState;
      if (lastMessage?.pacingState) {
        newPacingState = lastMessage.pacingState;
      } else if (newHistory.length === 0) {
        newPacingState = INITIAL_STATE.pacingState;
      } else {
        newPacingState = { tensionLevel: 0, turnsInCurrentLevel: 0 };
      }
      const newHp = lastMessage?.hp ?? (newHistory.length === 0 ? INITIAL_STATE.hp : state.hp);
      updateState({ history: newHistory, pacingState: newPacingState, hp: newHp });
    }
  }, [state.history, state.pacingState, state.hp, updateState]);

  const handleDiscardItem = useCallback((itemId: string) => {
    updateState(prev => ({ inventory: prev.inventory.filter(i => i.id !== itemId) }));
  }, [updateState]);

  const handleUseItem = useCallback((item: import('../types/game').InventoryItem) => {
    setShowInventory(false);
    handleTurn(`使用【${item.name}】`);
  }, [handleTurn]);

  const characterName = state.companionProfile.name || 'AI';

  const handleExportSave = useCallback(() => {
    const json = exportSave();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai_rpg_save_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [exportSave]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleExportSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleExportSave]);

  const cycleTextSpeed = useCallback(() => {
    const order: TextSpeed[] = ['normal', 'fast', 'instant'];
    const idx = order.indexOf(textSpeed);
    setTextSpeed(order[(idx + 1) % order.length]);
  }, [textSpeed]);

  const speedLabel = textSpeed === 'normal' ? '1x' : textSpeed === 'fast' ? '2x' : '∞';

  // Portrait regeneration
  const { regenerateCompanionPortrait, regeneratePlayerPortrait } = usePortraitRegeneration({
    state, accessToken, updateState,
  });

  return (
    <div className="flex flex-col h-dvh bg-zinc-950 text-zinc-100 font-sans relative overflow-hidden">
      <ChatHeader
        characterName={characterName}
        portraitUrl={portraitUrl}
        tensionLevel={state.pacingState.tensionLevel}
        hp={state.hp}
        affection={state.affection}
        affectionDelta={affectionDelta}
        affectionAnimKey={affectionAnimKey}
        driveError={driveError}
        isAuthenticated={isAuthenticated}
        isReconnecting={isReconnecting}
        onReconnectDrive={handleReconnectDrive}
        volume={volume}
        onChangeVolume={changeVolume}
        textSpeed={textSpeed}
        onCycleTextSpeed={cycleTextSpeed}
        speedLabel={speedLabel}
        onExportSave={handleExportSave}
        onShowMap={() => setShowMap(true)}
        onShowStatus={() => setShowStatus(true)}
        isFleshingOut={isFleshingOutCharacter}
      />

      <ProgressTracker state={{...state, ...displaySnapshot}} />

      <ChatMessageList
        ref={virtuosoRef}
        history={state.history}
        isProcessing={isProcessing}
        characterName={characterName}
        playerName={state.playerProfile.name || '你'}
        portraitUrl={portraitUrl}
        playerPortraitUrl={playerPortraitUrl}
        imageUrls={imageUrls}
        onImageLoaded={handleImageLoaded}
        onDeleteMessage={handleDeleteMessage}
        textSpeed={textSpeed}
        flushPendingNotifications={wrappedFlushNotifications}
        animatedIds={animatedIdsRef.current}
        currentLoadingMessage={currentLoadingMessage}
        displaySnapshot={{ currentObjective: displaySnapshot.currentObjective }}
        questChain={state.questChain}
        currentQuestStageIndex={state.currentQuestStageIndex}
        affectionDelta={affectionDelta}
        affectionAnimKey={affectionAnimKey}
        chatAreaRef={chatAreaRef}
      />

      <AnimatePresence>
        {pendingConfuse && !isConfuseModalVisible && (
          <div className="px-4 pt-2 bg-zinc-900/50 backdrop-blur-md">
            <div className="max-w-3xl mx-auto">
              <PendingIntentBanner reason={pendingConfuse.confuse.reason} onRestore={restoreConfuse} />
            </div>
          </div>
        )}
      </AnimatePresence>

      <ChatInput
        isProcessing={isProcessing}
        onSend={handleTurn}
        onBackpackClick={() => setShowInventory(true)}
        inventoryCount={state.inventory.length}
      />

      <AnimatePresence>
        {pendingConfuse && isConfuseModalVisible && (
          <IntentConfirmModal
            confuse={pendingConfuse.confuse}
            defaultIntent={pendingConfuse.defaultIntent}
            connectedNodes={(() => {
              if (!state.worldData || !state.currentNodeId) return [];
              const currentNode = state.worldData.nodes.find(n => n.id === state.currentNodeId);
              if (!currentNode) return [];
              return currentNode.connections
                .map(id => state.worldData!.nodes.find(n => n.id === id))
                .filter((n): n is NonNullable<typeof n> => !!n);
            })()}
            inventory={state.inventory}
            isInTransit={!!state.transitState}
            onConfirm={resolveConfuse}
            onMinimize={minimizeConfuse}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showStatus && (
          <StatusSidebar
            state={state}
            onClose={() => setShowStatus(false)}
            onViewCeremony={() => { setShowStatus(false); showLastCeremony(); }}
            onRegenerateCompanionPortrait={regenerateCompanionPortrait}
            onRegeneratePlayerPortrait={regeneratePlayerPortrait}
            onTogglePinyinAssist={() => updateState(prev => ({ pinyinAssist: !prev.pinyinAssist }))}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showMap && <MapOverlay state={state} onClose={() => setShowMap(false)} />}
      </AnimatePresence>

      <InventoryPanel
        inventory={state.inventory}
        isOpen={showInventory}
        onClose={() => setShowInventory(false)}
        onDiscard={handleDiscardItem}
        onUse={handleUseItem}
      />

      <DiscardPanel
        incomingItem={pendingBagItem}
        inventory={state.inventory}
        onDiscard={resolveBagDiscard}
        onRejectIncoming={rejectBagItem}
      />

      <AnimatePresence>
        {pendingCeremony && (
          <QuestCeremonyOverlay ceremony={pendingCeremony} companionName={state.companionProfile.name} onDismiss={dismissCeremony} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showProfileModal && (
          <ProfileModal
            tempName={tempName} setTempName={setTempName}
            tempGender={tempGender} setTempGender={setTempGender}
            tempOrientation={tempOrientation} setTempOrientation={setTempOrientation}
            onSubmit={handleProfileSubmit}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isGeneratingWorld && <FleshingOutOverlay ref={worldProgressRef} isWorld loadingMessages={state.loadingMessages} />}
      </AnimatePresence>
      <AnimatePresence>
        {isCeremonyGenerating && <FleshingOutOverlay label="任务链已完成，正在记录你的传奇..." gradientColors={['#f59e0b', '#ef4444']} loadingMessages={state.loadingMessages} />}
      </AnimatePresence>

      <DebugOverlay state={state} onUpdateState={updateState} />
      <RagStatusIndicator />
      <DriveToast visible={driveError && !driveToastDismissed} onDismiss={() => setDriveToastDismissed(true)} onReconnect={handleReconnectDrive} />
      {retryDialog}
    </div>
  );
}
