/**
 * 多段消息的打字机排队显示 + 通知触发时序
 */

import { v4 as uuidv4 } from 'uuid';
import type { ChatMessage, GameState, DebugState, TextSegment } from '../../types/game';
import type { GrandNotificationData } from '../../components/GrandNotification';

export interface DisplayDeps {
  messages: TextSegment[];
  debugState: DebugState;
  sceneVisuals: string | undefined;
  lastVisuals: string;
  selectedBgmKey: string | undefined;
  imagePromise: Promise<string | undefined>;
  pendingNotifications: Omit<GrandNotificationData, 'id'>[];
  addMessage: (msg: ChatMessage) => void;
  updateState: (u: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => void;
  setIsProcessing: (v: boolean) => void;
  setPendingNotificationsRef: (n: Omit<GrandNotificationData, 'id'>[]) => void;
  waitForTypewriter: () => Promise<void>;
  typewriterReadyRef: React.MutableRefObject<boolean>;
  typewriterResolveRef: React.MutableRefObject<(() => void) | null>;
}

export async function runDisplaySequence(deps: DisplayDeps): Promise<void> {
  const {
    messages, debugState, sceneVisuals, lastVisuals, selectedBgmKey,
    imagePromise, pendingNotifications,
    addMessage, updateState, setIsProcessing, setPendingNotificationsRef,
    waitForTypewriter, typewriterReadyRef, typewriterResolveRef,
  } = deps;

  // Reset typewriter sync state to prevent stale signals from previous turn
  typewriterReadyRef.current = false;
  typewriterResolveRef.current = null;

  let lastMsgId = uuidv4();

  const firstSeg = messages[0];
  addMessage({
    id: lastMsgId,
    role: 'model',
    text: firstSeg.content,
    segmentType: firstSeg.type,
    npcName: firstSeg.name,
    timestamp: Date.now(),
    debugState,
    currentSceneVisuals: sceneVisuals || lastVisuals,
    bgmKey: selectedBgmKey
  });

  if (messages.length === 1) {
    const fileName = await imagePromise;
    if (fileName) {
      updateState(prev => ({
        history: prev.history.map(m =>
          m.id === lastMsgId ? { ...m, imageFileName: fileName } : m
        )
      }));
    }
    setIsProcessing(false);
    setPendingNotificationsRef(pendingNotifications);
    return;
  }

  for (let i = 1; i < messages.length - 1; i++) {
    await waitForTypewriter();
    await new Promise(resolve => setTimeout(resolve, 1000));

    const seg = messages[i];
    lastMsgId = uuidv4();
    addMessage({
      id: lastMsgId,
      role: 'model',
      text: seg.content,
      segmentType: seg.type,
      npcName: seg.name,
      timestamp: Date.now() + i,
      bgmKey: selectedBgmKey
    });
  }

  const [fileName] = await Promise.all([
    imagePromise,
    waitForTypewriter().then(() => new Promise(resolve => setTimeout(resolve, 1000)))
  ]);

  const lastSeg = messages[messages.length - 1];
  lastMsgId = uuidv4();
  addMessage({
    id: lastMsgId,
    role: 'model',
    text: lastSeg.content,
    segmentType: lastSeg.type,
    npcName: lastSeg.name,
    timestamp: Date.now() + messages.length - 1,
    imageFileName: fileName,
    bgmKey: selectedBgmKey
  });

  setIsProcessing(false);
  setPendingNotificationsRef(pendingNotifications);
}
