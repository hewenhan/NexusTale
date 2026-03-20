/**
 * ChatMessageList — Virtuoso 列表 + Footer (loading indicator)
 */

import { forwardRef, useMemo } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2, Heart } from 'lucide-react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { ChatMessageItem } from './ChatMessageItem';
import { FloatingObjective } from './FloatingObjective';
import type { TextSpeed } from './TypewriterMessage';
import type { ChatMessage, GameState, QuestStage } from '../types/game';

interface ChatMessageListProps {
  history: ChatMessage[];
  isProcessing: boolean;
  characterName: string;
  playerName: string;
  portraitUrl: string | null;
  playerPortraitUrl: string | null;
  imageUrls: Record<string, string>;
  onImageLoaded: (fileName: string, url: string) => void;
  onDeleteMessage: (index: number) => void;
  textSpeed: TextSpeed;
  flushPendingNotifications: () => void;
  animatedIds: Set<string>;
  currentLoadingMessage: string;
  // Deferred display snapshot
  displaySnapshot: {
    currentObjective: GameState['currentObjective'];
  };
  // Quest chain
  questChain: QuestStage[];
  currentQuestStageIndex: number;
  // Affection animation
  affectionDelta: number | null;
  affectionAnimKey: number;
  // Chat area ref for FloatingObjective
  chatAreaRef: React.RefObject<HTMLDivElement | null>;
}

export const ChatMessageList = forwardRef<VirtuosoHandle, ChatMessageListProps>(function ChatMessageList(props, ref) {
  const {
    history, isProcessing, characterName, playerName,
    portraitUrl, playerPortraitUrl, imageUrls, onImageLoaded,
    onDeleteMessage, textSpeed, flushPendingNotifications,
    animatedIds, currentLoadingMessage,
    displaySnapshot, questChain, currentQuestStageIndex,
    affectionDelta, affectionAnimKey, chatAreaRef,
  } = props;

  const context = useMemo(() => ({
    onDelete: onDeleteMessage,
    imageUrls,
    characterName,
    playerName,
    onImageLoaded,
    portraitUrl,
    playerPortraitUrl,
    totalMessages: history.length,
    textSpeed,
    flushPendingNotifications,
    animatedIds,
  }), [onDeleteMessage, imageUrls, characterName, playerName, onImageLoaded, portraitUrl, playerPortraitUrl, history.length, textSpeed, flushPendingNotifications, animatedIds]);

  return (
    <div ref={chatAreaRef} className="flex-1 p-2 sm:p-4 space-y-2 sm:space-y-6 h-full overflow-hidden relative">
      {/* Large affection change animation overlay */}
      <AnimatePresence>
        {affectionDelta !== null && (
          <motion.div
            key={`big-aff-${affectionAnimKey}`}
            initial={{ opacity: 0, scale: 0.5, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -30 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="absolute bottom-8 left-4 sm:left-28 z-20 pointer-events-none"
          >
            <div className={`w-20 h-20 rounded-2xl flex flex-col items-center justify-center gap-0.5 backdrop-blur-md border ${
              affectionDelta > 0
                ? 'bg-pink-500/15 border-pink-500/30'
                : 'bg-blue-500/15 border-blue-500/30'
            }`}>
              <Heart
                className={`w-7 h-7 ${affectionDelta > 0 ? 'text-pink-400' : 'text-blue-400'}`}
                fill={affectionDelta > 0 ? 'currentColor' : 'none'}
              />
              <span className={`text-base font-bold ${affectionDelta > 0 ? 'text-pink-300' : 'text-blue-300'}`}>
                {affectionDelta > 0 ? `+${affectionDelta}` : affectionDelta}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {displaySnapshot.currentObjective && (
          <FloatingObjective
            description={displaySnapshot.currentObjective.description}
            targetLocationName={displaySnapshot.currentObjective.targetLocationName}
            constraintsRef={chatAreaRef}
            questChain={questChain}
            currentStageIndex={currentQuestStageIndex}
          />
        )}
      </AnimatePresence>
      <Virtuoso
        ref={ref}
        data={history}
        initialTopMostItemIndex={history.length - 1}
        followOutput="smooth"
        context={context}
        itemContent={(index, msg, ctx) => {
          const isLast = index === ctx.totalMessages - 1;
          const isLastModel = msg.role === 'model' && isLast;
          const shouldAnimate = isLastModel && !ctx.animatedIds.has(msg.id);
          return (
            <div className="pb-6">
              <ChatMessageItem
                msg={msg}
                characterName={ctx.characterName}
                playerName={ctx.playerName}
                portraitUrl={ctx.portraitUrl}
                playerPortraitUrl={ctx.playerPortraitUrl}
                imageUrl={msg.imageFileName ? ctx.imageUrls[msg.imageFileName] : undefined}
                onImageLoaded={ctx.onImageLoaded}
                onDelete={() => ctx.onDelete(index)}
                animate={shouldAnimate}
                textSpeed={ctx.textSpeed}
                isLastModelMessage={isLastModel}
                onTypewriterComplete={shouldAnimate ? () => {
                  ctx.animatedIds.add(msg.id);
                  ctx.flushPendingNotifications();
                } : undefined}
              />
            </div>
          );
        }}
        components={{
          Footer: () => (
            isProcessing ? (
              <div className="flex w-full mx-auto pb-6 px-2 sm:px-4 gap-2 sm:gap-3 justify-start">
                <div className="w-10 h-10 sm:w-20 sm:h-20 rounded-xl bg-zinc-800 shrink-0 overflow-hidden border border-zinc-700 flex items-center justify-center mt-1 sm:mt-5">
                  {portraitUrl ? (
                    <img src={portraitUrl} alt={characterName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-zinc-500 text-xs">{characterName[0]}</span>
                  )}
                </div>

                <div className="flex flex-col max-w-[75%] items-start">
                  <div className="text-xs text-zinc-500 mb-0.5 sm:mb-1 px-1">
                    {characterName}
                  </div>
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl rounded-tl-sm p-4 flex items-center gap-3 w-fit shadow-sm">
                    <Loader2 className="w-4 h-4 animate-spin text-zinc-400 shrink-0" />
                    <AnimatePresence mode="wait">
                      <motion.span
                        key={currentLoadingMessage}
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.2 }}
                        className="text-sm text-zinc-400 truncate"
                      >
                        {currentLoadingMessage}
                      </motion.span>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            ) : null
          )
        }}
      />
    </div>
  );
});
