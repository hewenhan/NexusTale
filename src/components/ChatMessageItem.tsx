import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { Image as ImageIcon, Loader2, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { ChatMessage, ENABLE_DEBUG_UI, SegmentType } from '../types/game';
import { getImageUrlByName } from '../lib/drive';
import { useAuth } from '../contexts/AuthContext';

import { TypewriterMessage, type TextSpeed } from './TypewriterMessage';
import { ZoomableImage } from './ZoomableImage';

interface ChatMessageItemProps {
  msg: ChatMessage;
  characterName: string;
  playerName?: string;
  portraitUrl?: string | null;
  playerPortraitUrl?: string | null;
  animate?: boolean;
  textSpeed?: TextSpeed;
  isLastModelMessage?: boolean;
  durationMs?: number;
  onTypewriterComplete?: () => void;
  imageUrl?: string;
  onImageLoaded: (fileName: string, url: string) => void;
  onDelete?: () => void;
}

/** Determine rendering side based on role + segmentType */
function getMessageSide(role: string, segmentType?: SegmentType): 'left' | 'right' | 'center' {
  if (role === 'user') return 'right';
  if (role === 'narrator') return 'center';
  if (segmentType === 'player_thought') return 'right';
  return 'left';
}

/** Get display name for the message */
function getDisplayName(role: string, characterName: string, playerName: string, segmentType?: SegmentType, npcName?: string): string {
  if (role === 'user') return playerName;
  if (segmentType === 'player_thought') return playerName;
  if (segmentType === 'npc_dialogue') return npcName || 'NPC';
  if (segmentType === 'narration') return '旁白';
  return characterName;
}

/** Bubble style classes per segment type */
function getBubbleClasses(role: string, segmentType?: SegmentType): string {
  if (role === 'user') return 'bg-emerald-600 text-white rounded-tr-sm';
  switch (segmentType) {
    case 'player_thought':
      return 'bg-sky-950/50 border border-sky-800/40 text-sky-100 rounded-tr-sm';
    case 'npc_dialogue':
      return 'bg-violet-950/40 border border-violet-800/30 text-zinc-100 rounded-tl-sm';
    case 'narration':
      return 'bg-amber-950/30 border border-amber-700/30 text-amber-100/90 rounded-tl-sm';
    case 'ai_dialogue':
    default:
      return 'bg-zinc-900 border border-zinc-800 rounded-tl-sm';
  }
}

/** Name label color per segment type */
function getNameColor(segmentType?: SegmentType): string {
  switch (segmentType) {
    case 'player_thought': return 'text-sky-400/70';
    case 'npc_dialogue': return 'text-violet-400/70';
    case 'narration': return 'text-amber-500/70';
    default: return 'text-zinc-500';
  }
}

export const ChatMessageItem = React.memo(({ msg, characterName, playerName = '你', portraitUrl, playerPortraitUrl, imageUrl, onImageLoaded, onDelete, animate = false, textSpeed = 'normal', isLastModelMessage = false, durationMs, onTypewriterComplete }: ChatMessageItemProps) => {
  const { accessToken } = useAuth();
  const [isLoadingImage, setIsLoadingImage] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAvatarFullscreen, setIsAvatarFullscreen] = useState(false);
  const [isPlayerAvatarFullscreen, setIsPlayerAvatarFullscreen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchImage = async () => {
      if (msg.imageFileName && !msg.imageProhibited && !imageUrl && accessToken) {
        setIsLoadingImage(true);
        const url = await getImageUrlByName(accessToken, msg.imageFileName);
        if (isMounted && url) {
          onImageLoaded(msg.imageFileName, url);
        }
        if (isMounted) setIsLoadingImage(false);
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
    };
  }, [msg.imageFileName, imageUrl, accessToken, onImageLoaded]);

  const side = getMessageSide(msg.role, msg.segmentType);
  const displayName = getDisplayName(msg.role, characterName, playerName, msg.segmentType, msg.npcName);
  const showLeftAvatar = side === 'left';
  const showRightAvatar = side === 'right';
  const isModelAnim = msg.role === 'model';

  // Determine which portrait to show on the left side  
  const leftHasPortrait = msg.segmentType !== 'narration' && msg.segmentType !== 'npc_dialogue';
  const leftPortrait = leftHasPortrait ? portraitUrl : null;

  // Determine which portrait to show on the right side
  const rightPortrait = playerPortraitUrl;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={clsx(
        "flex w-full mx-auto py-1 sm:py-4 px-2 sm:px-4 gap-2 sm:gap-3 relative group",
        side === 'right' ? "justify-end" : side === 'center' ? "justify-center" : "justify-start"
      )}
    >
      {/* System narrator message (centered, no avatar) — only for role='narrator' */}
      {side === 'center' && (
        <div className="max-w-[85%] bg-amber-950/30 border border-amber-600/40 rounded-xl px-5 py-3 shadow-lg shadow-amber-500/5">
          <div className="text-xs text-amber-500 font-medium mb-1 text-center">📜 旁白</div>
          <div className="text-sm text-amber-200/90 leading-relaxed text-center italic">
            <TypewriterMessage
              text={msg.text}
              animate={animate}
              speed={textSpeed}
              durationMs={durationMs}
              isLastModelMessage={isLastModelMessage}
              onComplete={onTypewriterComplete}
            />
          </div>
        </div>
      )}

      {/* Left-side Avatar */}
      {showLeftAvatar && (
        <div 
          className={clsx(
            "w-10 h-10 sm:w-20 sm:h-20 rounded-xl shrink-0 overflow-hidden border flex items-center justify-center mt-1 sm:mt-5",
            msg.segmentType === 'narration'
              ? "bg-amber-950/40 border-amber-700/30"
              : msg.segmentType === 'npc_dialogue'
                ? "bg-violet-950/40 border-violet-700/30"
                : "bg-zinc-800 border-zinc-700",
            leftPortrait ? 'cursor-pointer hover:ring-2 hover:ring-zinc-500 transition-all' : ''
          )}
          onClick={() => { if (leftPortrait) setIsAvatarFullscreen(true); }}
        >
          {leftPortrait ? (
            <img src={leftPortrait} alt={displayName} className="w-full h-full object-cover" />
          ) : msg.segmentType === 'narration' ? (
            <span className="text-amber-500 text-base sm:text-xl">📜</span>
          ) : msg.segmentType === 'npc_dialogue' ? (
            <span className="text-violet-400 text-base sm:text-xl">🗣️</span>
          ) : (
            <span className="text-zinc-500 text-xs">{characterName[0]}</span>
          )}
        </div>
      )}

      {side !== 'center' && (
      <div className={clsx(
        "flex flex-col max-w-[75%]",
        side === 'right' ? "items-end" : "items-start"
      )}>
        {/* Name */}
        <div className={clsx("text-xs mb-0.5 sm:mb-1 px-1", getNameColor(msg.role === 'user' ? undefined : msg.segmentType))}>
          {msg.role === 'user' ? playerName : displayName}
          {msg.segmentType === 'player_thought' && <span className="ml-1 opacity-60">💭</span>}
          {msg.segmentType === 'npc_dialogue' && <span className="ml-1 opacity-60">NPC</span>}
        </div>

        {/* Bubble */}
        <div className={clsx(
          "rounded-2xl overflow-hidden shadow-sm relative w-fit",
          getBubbleClasses(msg.role, msg.role === 'user' ? undefined : msg.segmentType)
        )}>
          {/* Debug Delete Button */}
          {ENABLE_DEBUG_UI && onDelete && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onDelete();
              }}
              className="absolute top-2 right-2 p-1.5 bg-red-500/80 text-white rounded-full z-10 shadow-md hover:bg-red-600 transition-all cursor-pointer backdrop-blur-sm opacity-0 group-hover:opacity-100"
              title="Debug: Delete Message"
              type="button"
            >
              <Trash2 className="w-3 h-3 pointer-events-none" />
            </button>
          )}

          {/* Image Display */}
          {(msg.imageFileName || msg.imageProhibited) && (
            <div className="relative w-full min-w-[200px] sm:min-w-[280px] bg-zinc-950 flex justify-center">
              {msg.imageProhibited ? (
                <div className="w-full aspect-[9/16] max-h-[70vh] flex flex-col items-center justify-center text-yellow-600 gap-2">
                  <ImageIcon className="w-6 h-6" />
                  <span className="text-xs">图片违规，无法生成</span>
                </div>
              ) : imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt="Scene" 
                  className="w-full h-auto max-h-[70vh] object-contain cursor-pointer"
                  onClick={() => setIsFullscreen(true)}
                />
              ) : (
                <div className="w-full aspect-[9/16] max-h-[70vh] flex items-center justify-center text-zinc-600 gap-2">
                  {isLoadingImage ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span className="text-xs">加载中...</span>
                    </>
                  ) : (
                    <>
                      <ImageIcon className="w-5 h-5" />
                      <span className="text-xs">未找到图片</span>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Text Content */}
          <div className={clsx(
            "p-3 sm:p-4 text-sm leading-relaxed markdown-body break-words",
            msg.segmentType === 'narration' && "italic",
            msg.segmentType === 'player_thought' && "italic"
          )}>
            {isModelAnim ? (
              <TypewriterMessage
                text={msg.text}
                animate={animate}
                speed={textSpeed}
                durationMs={durationMs}
                isLastModelMessage={isLastModelMessage}
                onComplete={onTypewriterComplete}
              />
            ) : (
              <TypewriterMessage text={msg.text} animate={false} speed="instant" />
            )}
          </div>
        </div>
      </div>
      )}

      {/* Right-side Avatar */}
      {showRightAvatar && (
        <div 
          className={clsx(
            "w-10 h-10 sm:w-20 sm:h-20 rounded-xl bg-zinc-800 shrink-0 overflow-hidden border border-zinc-700 flex items-center justify-center mt-1 sm:mt-5",
            rightPortrait ? 'cursor-pointer hover:ring-2 hover:ring-zinc-500 transition-all' : ''
          )}
          onClick={() => { if (rightPortrait) setIsPlayerAvatarFullscreen(true); }}
        >
          {rightPortrait ? (
            <img src={rightPortrait} alt={playerName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-zinc-500 text-xs">{playerName[0]}</span>
          )}
        </div>
      )}

      {/* Fullscreen Image Overlay */}
      {imageUrl && (
        <ZoomableImage src={imageUrl} alt="Fullscreen" isOpen={isFullscreen} onClose={() => setIsFullscreen(false)} />
      )}

      {/* Fullscreen Avatar Overlay */}
      {portraitUrl && (
        <ZoomableImage src={portraitUrl} alt="Avatar Fullscreen" isOpen={isAvatarFullscreen} onClose={() => setIsAvatarFullscreen(false)} />
      )}
      {playerPortraitUrl && (
        <ZoomableImage src={playerPortraitUrl} alt="Player Avatar Fullscreen" isOpen={isPlayerAvatarFullscreen} onClose={() => setIsPlayerAvatarFullscreen(false)} />
      )}
    </motion.div>
  );
});
