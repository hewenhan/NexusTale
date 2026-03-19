import { useState, useRef, useEffect, useCallback } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';
import { generateSummary, generateTurn, extractIntent, resolveObjectivePathfinding, generateQuestChain, generateQuestCompletionNarration } from '../services/aiService';
import { runPipeline, buildVisionContext, assembleNarrative, revealHouseInWorld } from '../lib/pipeline';
import { useGrandNotification, type GrandNotificationData } from '../components/GrandNotification';
import { SUMMARY_THRESHOLD, KEEP_RECENT_TURNS, INVENTORY_CAPACITY, BGM_LIST, bossTensionFromSafety, rollEscapeRarity, pickEscapeIcon } from '../types/game';
import type { QuestStage, QuestCompletionCeremony, InventoryItem, Rarity, TextSegment, IntentResult, ConfuseData } from '../types/game';

import {
  maybeEscalateToSeekQuest, runDirector, advanceQuestChain,
  applyDebugOverrides, applyNarrativeOverrides, buildStateUpdate, applyDebugDirectWrites,
  buildNotifications,
  buildStoryPrompt, buildThemeInstruction,
  launchImageGen,
  runDisplaySequence,
  getStartIndexForRecentTurns, getLastSceneVisuals,
} from './turnSteps';

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

    addMessage({
      id: uuidv4(),
      role: 'user',
      text: userInput,
      timestamp: Date.now(),
    });

    try {
      // ── Step 0: Summary maintenance ──
      let currentSummary = state.summary;
      const coveredUpTo = state.summaryCoveredUpTo ?? 0;

      // 统计未被摘要覆盖的 user 轮数（含当前输入）
      const unsummarizedHistory = state.history.slice(coveredUpTo);
      const unsummarizedUserTurns = unsummarizedHistory.filter(m => m.role === 'user').length + 1; // +1 = 当前输入

      if (unsummarizedUserTurns > SUMMARY_THRESHOLD) {
        // 需要摘要：把 coveredUpTo 到 newBoundary 之间的消息压缩进摘要
        const allMessages = [...state.history, { role: 'user', text: userInput } as const];
        const newBoundary = getStartIndexForRecentTurns(allMessages, KEEP_RECENT_TURNS);
        if (newBoundary > coveredUpTo) {
          const chunkToSummarize = allMessages.slice(coveredUpTo, newBoundary);
          const newSummary = await generateSummary(currentSummary, chunkToSummarize as any, state.language);
          if (newSummary) {
            currentSummary = newSummary;
            // newBoundary 可能等于 state.history.length（指向当前 userInput），
            // 但 summaryCoveredUpTo 索引是 state.history 的，最大不超过 state.history.length
            updateState({
              summary: currentSummary,
              summaryCoveredUpTo: Math.min(newBoundary, state.history.length),
            });
          }
        }
      }

      // ── Step 1: Intent Extraction ──
      const visionContext = buildVisionContext(state);
      const extraction = await extractIntent(userInput, state);
      let intent = extraction.intent;
      console.log("Intent original:", intent);

      // ── Step 1.1: Confuse interception — pause for user disambiguation ──
      if (extraction.confuse?.sure) {
        intent = await waitForConfuseResolution(extraction.confuse, extraction.intent);
      }

      if (intent.targetId === 'current_objective' && state.currentObjective && state.worldData) {
        const pathResult = resolveObjectivePathfinding(
          state.currentNodeId!, state.currentHouseId, state.currentObjective, state.worldData.nodes
        );
        intent.intent = pathResult.intent;
        intent.targetId = pathResult.targetId;
        console.log("Intent (pathfinding resolved):", intent);
      }

      // ── Step 1.5b: Director system ──
      maybeEscalateToSeekQuest(intent, state);
      const directorResult = runDirector(intent, state);
      if (directorResult.newObjective) {
        updateState({ currentObjective: directorResult.newObjective });
      }

      // ── Step 1.6: Quest chain generation (async) ──
      let pendingQuestItem: InventoryItem | null = null; // first stage item, inject after pipeline
      if (directorResult.needsQuestChainGeneration && state.worldData && state.currentNodeId) {
        try {
          const chainResult = await generateQuestChain(
            state.worldview, state.worldData, state.currentNodeId, state.language
          );

          // Build QuestStage array
          const questStages: QuestStage[] = chainResult.stages.map((s, i) => ({
            stageIndex: i,
            targetNodeId: chainResult.targetLocations[i]?.nodeId ?? '',
            targetHouseId: chainResult.targetLocations[i]?.houseId ?? '',
            targetLocationName: chainResult.targetLocations[i]?.locationName ?? '',
            description: s.description,
            requiredItems: s.requiredItems,
            completed: false,
            arrivedAtTarget: false,
          }));

          if (questStages.length > 0) {
            const firstStage = questStages[0];
            const firstObjective = {
              targetNodeId: firstStage.targetNodeId,
              targetHouseId: firstStage.targetHouseId,
              targetLocationName: firstStage.targetLocationName,
              description: firstStage.description,
            };

            // Build the first stage's quest item (only give first stage item now)
            if (firstStage.requiredItems.length > 0) {
              const ri = firstStage.requiredItems[0];
              pendingQuestItem = {
                id: ri.id,
                name: ri.name,
                type: 'quest' as const,
                description: `任务道具 - ${firstStage.description}`,
                rarity: 'common' as const,
                icon: '📜',
                quantity: 1,
                buff: null,
              };
            }

            // Save quest chain & objective, 同时持久化揭盲目标建筑
            updateState(prev => ({
              questChain: questStages,
              currentQuestStageIndex: 0,
              currentObjective: firstObjective,
              worldData: prev.worldData ? revealHouseInWorld(prev.worldData, firstObjective.targetHouseId) : prev.worldData,
            }));

            // Quest notification
            directorResult.questNotification = {
              type: 'quest',
              title: '新任务链！',
              description: firstStage.description,
            };
            directorResult.questDiscoveryNotification = {
              type: 'discovery',
              title: '目标地点',
              description: `前往【${firstStage.targetLocationName}】`,
            };

            // Override narrative with actual quest content so AI's dialogue matches
            const questItemName = pendingQuestItem?.name ?? '一件关键道具';
            directorResult.narrativeOverride = `【系统强制 - 新任务派发】：伴游 NPC 刚得到重要消息，向玩家透露了一项紧急任务。请 NPC 用自己的风格向玩家转述以下任务内容：\n任务目标：${firstStage.description}\n目标地点：${firstStage.targetLocationName}\n同时，NPC 将一件道具交给了玩家：【${questItemName}】，这是完成第一环任务的关键物品。请描写 NPC 交付道具的场景。`;

            console.log('[QuestChain] Generated', questStages.length, 'stages, first item:', pendingQuestItem?.name);
          }
        } catch (e) {
          console.error('[QuestChain] Generation failed:', e);
        }
      }

      // ── Step 1.8: 赶路中掉头处理 ──
      let resolveState = state;
      const isRetreatIntent = !!(state.transitState && intent.direction === 'back');
      if (isRetreatIntent) {
        const reversed = {
          fromNodeId: state.transitState!.toNodeId,
          toNodeId: state.transitState!.fromNodeId,
          pathProgress: Math.max(0, 100 - state.transitState!.pathProgress),
          lockedTheme: null,
        };
        resolveState = { ...state, transitState: reversed };
        console.log('Transit RETREAT: reversed', state.transitState, '->', reversed);
      }

      // ── Step 2: Pipeline state machine ──
      const debugOv = state.debugOverrides;
      const d20 = debugOv?.forcedRoll ?? (Math.floor(Math.random() * 20) + 1);
      const resolution = runPipeline(resolveState, intent, d20);

      // ── Step 2.5: Debug overrides ──
      if (debugOv) {
        applyDebugOverrides(resolution, debugOv);
        updateState({ debugOverrides: undefined });
      }

      // ── Step 3: Narrative assembly (pipeline events → narrative string) ──
      let narrativeInstruction = assembleNarrative({
        result: resolution,
        intent,
        state: resolveState,
        moveTarget: resolution.moveTarget,
      });

      // ── Step 3.2: Narrative overrides (director, retreat, affection) ──
      narrativeInstruction = applyNarrativeOverrides(narrativeInstruction, resolution, state, directorResult, isRetreatIntent);

      // ── Step 3.5: Quest chain post-pipeline logic ──
      // Quest item usage: use_item with quest item matching current stage requiredItems
      // Boss 战中禁止使用任务道具：视为自杀发呆，不消耗道具
      // ── 前置计算：判断任务环节 / 全链完成，生成 ceremony（在 AI 叙事之前） ──
      let questCeremony: QuestCompletionCeremony | null = null;
      let questStageCompleted = false; // 当前环节是否完成（用于后续 UI 写入）
      let questChainCompleted = false; // 全链是否完成
      let questNextObjective: { targetNodeId: string; targetHouseId: string; targetLocationName: string; description: string } | null = null;
      let questNextItem: InventoryItem | null = null;
      const deferredQuestBagItems: InventoryItem[] = [];
      const deferredQuestNotifications: Omit<GrandNotificationData, 'id'>[] = [];

      if (intent.intent === 'use_item' && intent.itemId && state.questChain) {
        const currentStage = state.questChain[state.currentQuestStageIndex];
        if (currentStage && !currentStage.completed) {
          const matchedItem = currentStage.requiredItems.find(
            ri => ri.id === intent.itemId
          );
          if (matchedItem && resolution.newTensionLevel >= 2) {
            // Boss 战中使用任务道具 → 不消耗，视为发呆被打
            narrativeInstruction = `【系统大失败 - 找死】：在危机中居然分心想使用【${matchedItem.name}】！玩家被狠狠重创！请描写玩家因为分心而被痛击的惨烈场面。`;
          } else if (matchedItem) {
            const atTargetLocation = resolution.newNodeId === currentStage.targetNodeId && (resolution.newHouseId || '') === (currentStage.targetHouseId || '');
            if (atTargetLocation) {
              // At target location → consume quest item
              resolution.newInventory = resolution.newInventory.filter(i => i.id !== matchedItem.id);
              // Check if all required items for this stage have been used
              const remainingRequired = currentStage.requiredItems.filter(
                ri => ri.id !== matchedItem.id && resolution.newInventory.some(inv => inv.id === ri.id)
              );
              if (remainingRequired.length === 0) {
                // ── 环节完成：前置判断全链 / 下一环 ──
                questStageCompleted = true;
                const { nextObjective, questCompleted } = advanceQuestChain(state);

                if (questCompleted) {
                  // ── 全链完成：生成结算典礼（跑条开始） ──
                  questChainCompleted = true;
                  setIsCeremonyGenerating(true);
                  try {
                    questCeremony = await generateQuestCompletionNarration(
                      state.worldview,
                      state.questChain,
                      state.playerProfile,
                      state.companionProfile,
                      state.affection,
                      state.history,
                      state.summary,
                      state.language
                    );
                  } catch {
                    questCeremony = {
                      recap: state.questChain.map((s, i) => `第 ${i + 1} 环：${s.targetLocationName}的挑战已被征服。`),
                      climax: '经历了重重险阻，冒险者终于站在了胜利的终点。',
                      companionReaction: `${state.companionProfile.name}露出了一丝不易察觉的微笑。`,
                      reward: { title: '任务链完成', description: '这段旅程永远改变了这片土地的命运。新的冒险即将开始。' },
                      epilogue: '这段传奇将永远铭刻于这片土地的记忆之中，而新的篇章正悄然翻开。',
                      affectionDelta: 10,
                    };
                  }
                  // 注入结算关键信息到叙事指令，让伴游AI知道发生了什么
                  const ceremonySummary = questCeremony.reward.title + '——' + questCeremony.reward.description.slice(0, 100);
                  narrativeInstruction = `【系统强制 - 任务链完成】：玩家使用了【${matchedItem.name}】，完成了整个任务链的最终环节！道具已消耗。这段漫长的旅程终于落幕——${ceremonySummary}。请以充满终结感和成就感的方式描写这一刻，让玩家感受到一段传奇的结束。\n` + narrativeInstruction;
                } else if (nextObjective) {
                  // ── 中间环节完成 → 准备下一环数据 ──
                  questNextObjective = nextObjective;
                  const nextStageData = state.questChain[state.currentQuestStageIndex + 1];
                  if (nextStageData?.requiredItems?.[0]) {
                    questNextItem = {
                      id: nextStageData.requiredItems[0].id,
                      name: nextStageData.requiredItems[0].name,
                      type: 'quest' as const,
                      description: `任务道具 - ${nextStageData.description}`,
                      rarity: 'common' as const,
                      icon: '📜',
                      quantity: 1,
                      buff: null,
                    };
                    deferredQuestBagItems.push(questNextItem);
                  }
                  deferredQuestNotifications.push({
                    type: 'quest',
                    title: `任务环节${state.currentQuestStageIndex + 2}！`,
                    description: nextObjective.description,
                  });
                  narrativeInstruction = `【系统强制 - 任务道具使用】：玩家成功使用了【${matchedItem.name}】，完成了当前任务环节并且消耗掉！请结合世界观和上下文任务描述来触发接下来的任务，揭示两个任务的逻辑因果关系\n` + narrativeInstruction;
                }
              } else {
                narrativeInstruction = `【系统强制 - 任务道具使用】：玩家使用了【${matchedItem.name}】。请描写道具消耗掉的效果。\n` + narrativeInstruction;
              }
            } else {
              // NOT at target location → keep the item, tell player where to go
              narrativeInstruction = `【系统强制 - 任务道具无法使用】：玩家使用了【${matchedItem.name}】，请 NPC 结合上下文使用道具而不消耗道具\n` + narrativeInstruction;
            }
          }
        }
      }

      // 结算跑条结束（questChainCompleted 在本轮 Step 3.5 设置）
      if (questChainCompleted) setIsCeremonyGenerating(false);

      // Quest crisis anchoring: arriving at quest target location triggers elevated tension
      if (state.questChain && !resolution.newTransitState) {
        const currentStage = state.questChain[state.currentQuestStageIndex];
        if (currentStage && !currentStage.arrivedAtTarget
          && resolution.newNodeId === currentStage.targetNodeId) {
          // First arrival at quest target - anchor crisis based on safety
          const targetNode = state.worldData?.nodes.find(n => n.id === currentStage.targetNodeId);
          const targetHouse = targetNode?.houses.find(h => h.id === currentStage.targetHouseId);
          const atTargetLocation = resolution.newNodeId === currentStage.targetNodeId && (resolution.newHouseId || '') === (currentStage.targetHouseId || '');
          if (atTargetLocation) {
            const crisisTension = bossTensionFromSafety(targetHouse?.safetyLevel ?? targetNode?.safetyLevel);
            if (crisisTension && crisisTension > resolution.newTensionLevel) {
              resolution.newTensionLevel = crisisTension;
              resolution.tensionChanged = true;
            }
            // Mark as arrived (will be persisted in updateState below)
            updateState(prev => {
              if (!prev.questChain) return {};
              const updated = [...prev.questChain];
              updated[prev.currentQuestStageIndex] = { ...updated[prev.currentQuestStageIndex], arrivedAtTarget: true };
              return { questChain: updated };
            });
            // 完全替换叙事指令：pipeline 生成的叙事基于旧紧张度，不适用于任务抵达的危机场景
            const finalTension = crisisTension ?? resolution.newTensionLevel;
            if (finalTension >= 4) {
              narrativeInstruction = `【系统强制 - 任务目标抵达 / 绝境危机触发】：玩家抵达了任务目标所在地【${targetNode.name}】！这里极度危险，强大的危机扑面而来——绝境 级威胁已经出现！紧张度直接拉满至 ${finalTension} 级（死斗）。请描写抵达后立即遭遇 绝境 级威胁的震撼场面，气氛必须极度紧张、压迫感十足。`;
            } else if (finalTension >= 3) {
              narrativeInstruction = `【系统强制 - 任务目标抵达 / 中度威胁】：玩家抵达了任务目标所在地【${targetNode.name}】！周围弥漫着强烈的危险气息，中度威胁潜伏于此。紧张度升至 ${finalTension} 级。请描写抵达后感知到强大威胁逼近的紧张场面，NPC 应表现出警觉与不安。`;
            } else if (finalTension >= 2) {
              narrativeInstruction = `【系统强制 - 任务目标抵达 / 危机潜伏】：玩家抵达了任务目标所在地【${targetNode.name}】！这里并不太平，危险的征兆随处可见。紧张度升至 ${finalTension} 级。请描写抵达时察觉到异常与潜在危机的场面。`;
            } else {
              narrativeInstruction = `【系统强制 - 任务目标抵达】：玩家抵达了任务目标所在地【${targetNode.name}】！请描写抵达目的地的场面。`;
            }
          }
        }
      }

      console.log("D20 Roll:", d20, "Resolution:", resolution);

      // ── Step 3.9: Pre-roll item drop + build prompt instruction ──
      // explore + success → 25% chance to find item, TS picks rarity, AI picks name
      let escapeItemRarity: Rarity | null = null;
      let itemDropInstruction: string | null = null;
      const isExploreSuccess = resolution.isSuccess && intent.intent === 'explore' && !resolution.progressCapped;
      if (isExploreSuccess) {
        if (Math.random() < 0.25) {
          escapeItemRarity = rollEscapeRarity();
          if (resolution.newTransitState) {
            itemDropInstruction = `【搜刮结果 - 有收获】：在赶路途中获得了一件${escapeItemRarity}品质的道具！`;
          } else {
            itemDropInstruction = `【搜刮结果 - 有收获】：获得了一件${escapeItemRarity}品质的道具！`;
          }
          itemDropInstruction += `（根据世界观和当前场景合理创名，不要和已有物品重复！不要和当前任务/任务链有关！根据对话合理化描述获得过程），并在 get_item 字段中返回道具名称和简短说明。`;
        } else {
          if (resolution.newTransitState) {
            itemDropInstruction = `【搜刮结果 - 无收获】：在赶路途中没有找到任何道具，但还有找的线索`;
          } else {
            itemDropInstruction = `【搜刮结果 - 无收获】：结合世界观上下文描写没找到东西，但还有找的线索`;
          }
          itemDropInstruction += `（请不要写成“你在地上翻了半天，什么都没找到”这种尴尬的修辞，合理化描述搜刮过程和线索）。`;
        }
      }

      // ── Step 3.9b: Equipment drop (guaranteed from milestone/boss, or random on crit explore) ──
      let prerolledEquipDrop: InventoryItem | null = null;
      const shouldDropEquip = resolution.guaranteedDrop
        || (isExploreSuccess && !resolution.progressCapped && resolution.roll >= 17 && Math.random() < 0.3);
      if (shouldDropEquip) {
        const presets = state.equipmentPresets;
        if (presets.length > 0) {
          const idx = Math.floor(Math.random() * presets.length);
          prerolledEquipDrop = presets[idx];
          updateState(prev => {
            const newPresets = [...prev.equipmentPresets];
            newPresets.splice(idx, 1);
            return { equipmentPresets: newPresets };
          });
          // Build equipment drop instruction for AI
          const equipType = prerolledEquipDrop.type === 'weapon' ? '武器' : '防具';
          const equipInstruction = `【装备掉落】：探索中发现了一件${prerolledEquipDrop.rarity}品质的${equipType}【${prerolledEquipDrop.name}】（${prerolledEquipDrop.description}）！请在叙事中自然地描写发现这件装备的过程。不要和当前任务/任务链有关！`;
          itemDropInstruction = (itemDropInstruction || '') + equipInstruction;
        }
      }

      // ── Step 4: Write state ──
      // 收集本回合需要额外揭盲的建筑 ID（任务目标）
      const additionalRevealIds = directorResult.newObjective?.targetHouseId
        ? [directorResult.newObjective.targetHouseId]
        : undefined;
      updateState(buildStateUpdate(resolution, additionalRevealIds));

      if (debugOv) {
        applyDebugDirectWrites(debugOv, updateState);
      }

      // 动态记忆锁：旅途结束时将 lockedTheme 推入黑名单（FIFO, 上限 20）
      if (!resolution.newTransitState && state.transitState?.lockedTheme) {
        updateState(prev => {
          const updated = [...prev.exhaustedThemes, state.transitState!.lockedTheme!];
          return { exhaustedThemes: updated.length > 20 ? updated.slice(-20) : updated };
        });
      }

      // ── Step 4.5: (moved to step 3.9b — pre-roll equipment drop) ──

      // ── Step 5: Build notifications ──
      const pendingNotifications = buildNotifications(state, resolution, directorResult);

      // ── Step 6: Build LLM prompt & call ──
      const themeInstruction = buildThemeInstruction(state, resolution);
      const fullPrompt = buildStoryPrompt({
        state, resolution, currentSummary, userInput, visionContext,
        itemDropInstruction,
        expectGetItem: !!escapeItemRarity,
        narrativeInstruction,
      });

      const responseJson = await generateTurn(fullPrompt);
      const { image_prompt, image_characters, text_sequence, scene_visuals_update, hp_description, encounter_tag, affection_change, outfit_update, get_item, figures_of_speech } = responseJson;

      // Persist rhetoric blacklist (FIFO, max 20)
      if (Array.isArray(figures_of_speech) && figures_of_speech.length > 0) {
        updateState(prev => {
          const updated = [...prev.exhaustedRhetoric, ...figures_of_speech.filter((s: unknown) => typeof s === 'string')];
          return { exhaustedRhetoric: updated.length > 20 ? updated.slice(-20) : updated };
        });
      }

      console.log('preExhaustedRhetoric', state.exhaustedRhetoric, 'newly exhausted:', figures_of_speech);

      // ── Step 7: Post-LLM state updates ──
      if (typeof affection_change === 'number' && affection_change !== 0) {
        const clampedChange = Math.max(-30, Math.min(10, affection_change));
        updateState(prev => ({
          affection: Math.max(0, Math.min(100, prev.affection + clampedChange))
        }));
      }

      // ── Step 7.0b: outfit_update → 动态更新角色服装描述 ──
      if (outfit_update && typeof outfit_update === 'object') {
        updateState(prev => {
          const patch: Record<string, unknown> = {};
          const companionName = prev.companionProfile.name;
          const playerName = prev.playerProfile.name;
          for (const [charName, newOutfit] of Object.entries(outfit_update)) {
            if (typeof newOutfit !== 'string' || !newOutfit) continue;
            if (charName === companionName) {
              patch.companionProfile = { ...prev.companionProfile, outfitPrompt: newOutfit };
            } else if (charName === playerName) {
              patch.playerProfile = { ...prev.playerProfile, outfitPrompt: newOutfit };
            }
          }
          return patch;
        });
      }

      if (encounter_tag && resolution.newTransitState) {
        updateState(prev => {
          if (prev.transitState && !prev.transitState.lockedTheme) {
            return { transitState: { ...prev.transitState, lockedTheme: encounter_tag } };
          }
          return {};
        });
      }

      if (hp_description) {
        updateState({ hpDescription: hp_description });
      }

      // ── Step 7.2: Build unified pending bag items ──
      const pendingBagItems: InventoryItem[] = [];

      // Quest item from quest chain generation
      if (pendingQuestItem) pendingBagItems.push(pendingQuestItem);

      // Equipment drop (pre-rolled in step 3.9b)
      if (prerolledEquipDrop) pendingBagItems.push(prerolledEquipDrop);

      // Escape item from AI response (get_item)
      if (escapeItemRarity && get_item && get_item.name) {
        pendingBagItems.push({
          id: `escape_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: get_item.name,
          type: 'escape',
          description: get_item.description || '战斗中使用可抵消一次失败惩罚',
          rarity: escapeItemRarity,
          icon: pickEscapeIcon(escapeItemRarity),
          quantity: 1,
          buff: null,
        });
      }

      // ── Step 7.5: Quest stage completion — deferred UI writes ──
      // (Computation already done in Step 3.5, here we only apply state + UI effects)
      if (questStageCompleted && state.questChain) {
        const stageIdx = state.currentQuestStageIndex;
        if (questChainCompleted && questCeremony) {
          updateState(prev => ({
            questChain: (prev.questChain || []).map((s, i) => i === stageIdx ? { ...s, completed: true } : s),
            currentObjective: null,
            affection: Math.min(100, prev.affection + (questCeremony?.affectionDelta ?? 10)),
            // 世界观变迁记录
            worldviewUpdates: questCeremony?.worldviewUpdate
              ? [...prev.worldviewUpdates, questCeremony.worldviewUpdate]
              : prev.worldviewUpdates,
          }));
        } else if (questNextObjective) {
          updateState(prev => ({
            questChain: (prev.questChain || []).map((s, i) => i === stageIdx ? { ...s, completed: true } : s),
            currentQuestStageIndex: stageIdx + 1,
            currentObjective: questNextObjective,
            worldData: prev.worldData ? revealHouseInWorld(prev.worldData, questNextObjective!.targetHouseId) : prev.worldData,
          }));
          for (const n of deferredQuestNotifications) {
            pendingNotifications.push(n);
          }
          for (const item of deferredQuestBagItems) {
            pendingBagItems.push(item);
          }
        }
      }

      // ── Step 7.1: Unified BGM selection ──
      // 统一入口：在 AI 回复完成后、显示消息之前，基于最终紧张度决定 BGM
      // 此时 resolution.newTensionLevel 已经包含了 pipeline + Step 3.5 任务抵达等所有变更
      let finalBgmKey: string | undefined;
      if (resolution.tensionChanged) {
        const candidates = BGM_LIST[resolution.newTensionLevel as keyof typeof BGM_LIST] || [];
        finalBgmKey = candidates.length > 0
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : undefined;
      } else {
        // 紧张度没变，沿用上一轮 BGM
        for (let i = state.history.length - 1; i >= 0; i--) {
          if (state.history[i].bgmKey) {
            finalBgmKey = state.history[i].bgmKey;
            break;
          }
        }
      }
      // Fallback：历史为空时按当前紧张度选
      if (!finalBgmKey) {
        const fallback = BGM_LIST[resolution.newTensionLevel as keyof typeof BGM_LIST] || [];
        finalBgmKey = fallback.length > 0
          ? fallback[Math.floor(Math.random() * fallback.length)]
          : undefined;
      }

      const messages: TextSegment[] = Array.isArray(text_sequence)
        ? text_sequence.map((seg: any) => {
            // Support new structured format
            if (seg && typeof seg === 'object' && seg.type && seg.content) {
              return { type: seg.type, content: seg.content, name: seg.name } as TextSegment;
            }
            // Backward compatible: plain string → ai_dialogue
            if (typeof seg === 'string') {
              return { type: 'ai_dialogue' as const, content: seg };
            }
            return { type: 'ai_dialogue' as const, content: String(seg) };
          })
        : [{ type: 'ai_dialogue' as const, content: responseJson.text_response || "......" }];
      const lastVisuals = getLastSceneVisuals(state);

      const newDebugState = {
        lastActionRoll: resolution.snapPost.roll ?? d20,
        lastSuccessThreshold: 0,
        lastIsSuccess: resolution.snapPost.isSuccess ?? resolution.isSuccess,
        lastTensionLevel: resolution.snapPost.tensionLevel,
        lastIntent: resolution.snapPost.intent,
        lastNarrativeInstruction: narrativeInstruction,
        lastThemeInstruction: themeInstruction,
        lastItemDropInstruction: itemDropInstruction || undefined,
        lastFormula: resolution.formulaBreakdown,
        lastImagePrompt: image_prompt,
        lastImageError: undefined as string | undefined
      };

      // ── Step 8: Image generation (async, non-blocking) ──
      const imagePromise = launchImageGen({
        imagePrompt: image_prompt,
        imageCharacters: image_characters,
        isAuthenticated,
        accessToken,
        state,
        debugState: newDebugState,
      });

      // ── Step 9: Display sequencing ──
      await runDisplaySequence({
        messages,
        debugState: newDebugState,
        sceneVisuals: scene_visuals_update,
        lastVisuals,
        selectedBgmKey: finalBgmKey,
        imagePromise,
        pendingNotifications,
        addMessage,
        updateState,
        setIsProcessing,
        setPendingNotificationsRef,
        waitForTypewriter,
        typewriterReadyRef,
        typewriterResolveRef,
      });

      // ── Step 9.5: Unified bag entry — after all messages displayed ──
      const rollingInvRef = { current: resolution.newInventory };
      for (const item of pendingBagItems) {
        await addItemToBag(item, rollingInvRef);
      }

      // ── Step 9.6: Quest completion ceremony overlay ──
      if (questCeremony) {
        // Wait for chat typewriter to finish so sound effects don't overlap
        await waitForTypewriter();
        setPendingCeremony(questCeremony);
      }

    } catch (error) {
      console.error("Failed to process turn", error);
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
    // Ceremony generation progress bar
    isCeremonyGenerating,
  };
}
