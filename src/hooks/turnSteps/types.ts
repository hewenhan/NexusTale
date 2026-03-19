/**
 * 回合管线共享上下文 (TurnContext)
 *
 * 参照 pipeline/types.ts 的 PipelineContext 设计：
 * 所有 step 函数统一读写同一个可变上下文对象，
 * 消除零散参数传递，使回合管线的签名统一为 stepXxx(ctx): void | Promise<void>。
 */

import type {
  GameState, IntentResult, IntentExtractionResult,
  InventoryItem, TextSegment, QuestCompletionCeremony, Rarity,
  DebugState,
} from '../../types/game';
import type { PipelineResult } from '../../lib/pipeline';
import type { GrandNotificationData } from '../../components/GrandNotification';
import type { DirectorResult } from './directorSystem';
import type { QuestResolutionResult } from './questChainLogic';
import type { NarrativeFacts } from '../../lib/narrativeRegistry';

// ─── 外部依赖（React hooks / UI callbacks） ──────────────────

export interface TurnDeps {
  /** 读取当前 GameState 快照 */
  state: GameState;
  /** 写入 GameState */
  updateState: (patch: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => void;
  /** 添加聊天消息 */
  addMessage: (msg: any) => void;
  /** 认证状态 */
  isAuthenticated: boolean;
  accessToken: string | null;
  /** UI blocking: 歧义意图消耗 */
  waitForConfuseResolution: (confuse: any, defaultIntent: IntentResult) => Promise<IntentResult>;
  /** UI blocking: 打字机同步 */
  waitForTypewriter: () => Promise<void>;
  typewriterReadyRef: React.MutableRefObject<boolean>;
  typewriterResolveRef: React.MutableRefObject<(() => void) | null>;
  /** UI: 仪式生成进度 */
  setIsCeremonyGenerating: (v: boolean) => void;
  /** UI: 通知 */
  setPendingNotificationsRef: (n: Omit<GrandNotificationData, 'id'>[]) => void;
  setIsProcessing: (v: boolean) => void;
  /** UI: 背包入包 */
  addItemToBag: (item: InventoryItem, rollingInvRef: { current: InventoryItem[] }) => Promise<void>;
  /** UI: 仪式 */
  setPendingCeremony: (c: QuestCompletionCeremony | null) => void;
}

// ─── 共享可变上下文 ──────────────────────────────────────────

export interface TurnContext {
  // ── 不可变输入 ──
  readonly deps: TurnDeps;
  readonly userInput: string;

  // ── Step 010: Summary ──
  currentSummary: string;

  // ── Step 020: Intent ──
  visionContext: string;
  extraction: IntentExtractionResult | null;
  intent: IntentResult;

  // ── Step 030: Director ──
  directorResult: DirectorResult;
  pendingQuestItem: InventoryItem | null;

  // ── Step 040: Retreat ──
  resolveState: GameState;
  isRetreatIntent: boolean;

  // ── Step 050: Pipeline ──
  d20: number;
  resolution: PipelineResult | null;

  // ── Step 060-070: Narrative ──
  narrativeInstruction: string;
  questResult: QuestResolutionResult | null;

  // ── Step 080: Item Drops ──
  escapeItemRarity: Rarity | null;
  itemDropInstruction: string | null;
  prerolledEquipDrop: InventoryItem | null;

  // ── Step 100: Notifications ──
  pendingNotifications: Omit<GrandNotificationData, 'id'>[];

  // ── Step 110: LLM ──
  facts: NarrativeFacts | null;
  responseJson: any;

  // ── Step 120: Post-LLM ──
  pendingBagItems: InventoryItem[];
  finalBgmKey: string | undefined;

  // ── Step 130: Display ──
  messages: TextSegment[];
  debugState: DebugState | null;
}
