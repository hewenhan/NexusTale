/**
 * useWorldInit — 世界生成 + 头像/装备/地图并行初始化
 *
 * Phase 1: 阻塞 — initializeWorld
 * Phase 2: 并行非阻塞 — Promise.allSettled (装备/地图/同伴头像/玩家头像)
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { GameState } from '../types/game';
import { initializeWorld, generateMapImage, generateCharacterPortrait, fetchCustomLoadingMessages } from '../services/worldService';
import { generateEquipmentPresets } from '../services/equipmentService';
import { uploadImageToDrive } from '../lib/drive';
import { FakeProgressBarHandle } from '../components/FakeProgressBar';
import { DEFAULT_LOADING_MESSAGES } from '../types/game';
import { handleError } from '../lib/errorPolicy';

interface WorldInitDeps {
  state: GameState;
  updateState: (patch: Partial<GameState> | ((prev: GameState) => Partial<GameState>)) => void;
  showRetry: (title: string, message: string, retryFn: () => Promise<void>) => Promise<boolean>;
  worldProgressRef: React.RefObject<FakeProgressBarHandle | null>;
  characterProgressRef: React.RefObject<FakeProgressBarHandle | null>;
  isProcessing: boolean;
}

export function useWorldInit(deps: WorldInitDeps) {
  const { state, updateState, showRetry, worldProgressRef, characterProgressRef, isProcessing } = deps;
  const { isAuthenticated, accessToken } = useAuth();
  const [isGeneratingWorld, setIsGeneratingWorld] = useState(false);
  const [isFleshingOutCharacter, setIsFleshingOutCharacter] = useState(false);

  // ── World initialization ──
  useEffect(() => {
    if (!state.worldData && state.worldview && !isGeneratingWorld) {
      setIsGeneratingWorld(true);
      setIsFleshingOutCharacter(true);
      (async () => {
        const attemptInit = async () => {
          // Phase 1: 阻塞 — 世界拓扑 + 人物生成
          const result = await initializeWorld(
            state.worldview,
            state.playerProfile,
            state.companionProfile,
            state.language,
            state.worldviewUserInput
          );

          // Apply world data
          const spawnNode = result.worldData.nodes[0];
          const spawnHouse = spawnNode?.houses[0];
          if (spawnHouse) spawnHouse.safetyLevel = 'safe';
          if (spawnNode) {
            for (const h of spawnNode.houses) {
              h.revealed = true;
            }
          }
          const finalArtStyle = state.artStylePrompt || result.artStylePrompt;

          updateState({
            worldData: result.worldData,
            artStylePrompt: finalArtStyle,
            currentWorldId: result.worldData.id,
            currentNodeId: spawnNode?.id || null,
            currentHouseId: spawnHouse?.id || null,
            pacingState: { tensionLevel: 0, turnsInCurrentLevel: 0 },
            companionProfile: result.companionProfile,
            playerProfile: result.playerProfile,
            ...(typeof result.companionProfile.initialAffection === 'number'
              ? { affection: Math.max(0, Math.min(100, result.companionProfile.initialAffection)) }
              : {})
          });

          // Phase 2: 并行非阻塞 — 失败可降级
          const results = await Promise.allSettled([
            // 装备预设
            (async () => {
              const presets = await generateEquipmentPresets(state.worldview, state.language);
              updateState({ equipmentPresets: presets });
            })(),
            // 地图
            (async () => {
              const base64 = await generateMapImage(result.worldData, state.worldview, finalArtStyle);
              if (base64 && isAuthenticated && accessToken) {
                const fileName = `ai_rpg_map_${Date.now()}.png`;
                await uploadImageToDrive(accessToken, base64, fileName);
                updateState({ mapImageFileName: fileName });
              }
            })(),
            // 同伴头像
            (async () => {
              const fullAppearance = [result.companionProfile.bodyPrompt, result.companionProfile.outfitPrompt].filter(Boolean).join('; ');
              if (fullAppearance && isAuthenticated && accessToken) {
                const base64 = await generateCharacterPortrait(fullAppearance, state.worldview, finalArtStyle);
                if (base64 && accessToken) {
                  const fileName = `ai_rpg_portrait_${Date.now()}.png`;
                  await uploadImageToDrive(accessToken, base64, fileName);
                  updateState({ characterPortraitFileName: fileName });
                }
              }
            })(),
            // 玩家头像
            (async () => {
              const playerAppearance = [result.playerProfile.bodyPrompt, result.playerProfile.outfitPrompt].filter(Boolean).join('; ');
              if (playerAppearance && isAuthenticated && accessToken) {
                const base64 = await generateCharacterPortrait(playerAppearance, state.worldview, finalArtStyle);
                if (base64 && accessToken) {
                  const fileName = `ai_rpg_player_portrait_${Date.now()}.png`;
                  await uploadImageToDrive(accessToken, base64, fileName);
                  updateState({ playerPortraitFileName: fileName });
                }
              }
            })(),
          ]);

          // Log failed non-blocking tasks (degraded, not critical)
          results.forEach((r, i) => {
            if (r.status === 'rejected') {
              const labels = ['Equipment presets', 'Map image', 'Companion portrait', 'Player portrait'];
              console.warn(`[useWorldInit] ${labels[i]} failed (degraded):`, r.reason);
            }
          });
        };

        try {
          await attemptInit();
        } catch (error) {
          handleError('critical', '世界初始化失败', error, { showRetry, retry: attemptInit });
          const retried = await showRetry(
            '世界初始化失败',
            '生成世界观和角色信息时出错，是否重试？',
            attemptInit,
          );
          if (!retried) {
            updateState({
              companionProfile: { ...state.companionProfile, isFleshedOut: true },
              playerProfile: { ...state.playerProfile, isFleshedOut: true },
            });
          }
        } finally {
          worldProgressRef.current?.finish();
          characterProgressRef.current?.finish();
          setTimeout(() => {
            setIsGeneratingWorld(false);
            setIsFleshingOutCharacter(false);
          }, 600);
        }
      })();
    }
  }, [state.worldview, state.worldData]);

  // ── Loading messages fetch ──
  useEffect(() => {
    const fetchMissingLoadingMessages = async () => {
      const isUsingDefaults = state.loadingMessages === DEFAULT_LOADING_MESSAGES ||
        (state.loadingMessages.length > 0 && DEFAULT_LOADING_MESSAGES.includes(state.loadingMessages[0]));

      if (state.worldview && isUsingDefaults && !isProcessing) {
        const attempt = async () => {
          const messages = await fetchCustomLoadingMessages(state.worldview, state.language);
          updateState({ loadingMessages: messages });
        };
        try {
          await attempt();
        } catch (error) {
          handleError('degraded', '加载提示生成失败', error);
          await showRetry('加载提示生成失败', '生成世界观加载提示时出错，是否重试？', attempt);
        }
      }
    };

    fetchMissingLoadingMessages();
  }, [state.worldview, state.loadingMessages.length]);

  return { isGeneratingWorld, isFleshingOutCharacter };
}
