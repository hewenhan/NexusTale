import { motion, AnimatePresence } from 'motion/react';
import { Target, ChevronDown } from 'lucide-react';
import { type RefObject, useRef, useState } from 'react';
import type { QuestStage } from '../types/game';

interface FloatingObjectiveProps {
  description: string;
  targetLocationName?: string;
  constraintsRef: RefObject<HTMLDivElement | null>;
  questChain?: QuestStage[] | null;
  currentStageIndex?: number;
}

export function FloatingObjective({ description, targetLocationName, constraintsRef, questChain, currentStageIndex = 0 }: FloatingObjectiveProps) {
  const [expanded, setExpanded] = useState(false);
  const pointerStart = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);

  return (
    <motion.div
      drag
      dragMomentum={false}
      dragConstraints={constraintsRef}
      dragElastic={0.1}
      onDragStart={() => { dragged.current = true; }}
      onDragEnd={() => { requestAnimationFrame(() => { dragged.current = false; }); }}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute bottom-4 right-4 z-20 max-w-[260px] cursor-grab active:cursor-grabbing select-none"
    >
      <div className="bg-zinc-900/90 backdrop-blur-md border border-amber-500/30 rounded-xl px-3 py-2 shadow-lg shadow-amber-500/5">
        {/* Header - always visible, click to toggle */}
        <div
          className="flex items-center gap-2 cursor-pointer"
          onPointerDown={(e) => { pointerStart.current = { x: e.clientX, y: e.clientY }; }}
          onClick={() => { if (!dragged.current) setExpanded(v => !v); }}
        >
          <Target className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-xs font-medium text-amber-400 flex-1">当前目标</span>
          {/* Quest dots inline when collapsed */}
          {!expanded && questChain && questChain.length > 1 && (
            <span className="text-[10px] text-zinc-500">{currentStageIndex + 1}/{questChain.length}</span>
          )}
          <ChevronDown className={`w-3 h-3 text-zinc-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>

        {/* Expandable content */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <p className="text-xs text-zinc-300 leading-relaxed mt-1.5">{description}</p>
              {targetLocationName && (
                <p className="text-[11px] text-amber-300/80 mt-1">📍 {targetLocationName}</p>
              )}

              {/* Quest chain progress dots */}
              {questChain && questChain.length > 1 && (
                <div className="flex items-center gap-1.5 mt-2">
                  {questChain.map((stage, i) => (
                    <div
                      key={i}
                      className={`w-2 h-2 rounded-full transition-colors ${
                        stage.completed
                          ? 'bg-emerald-400'
                          : i === currentStageIndex
                            ? 'bg-amber-400 animate-pulse'
                            : 'bg-zinc-600'
                      }`}
                      title={`第${i + 1}环: ${stage.description.slice(0, 30)}...`}
                    />
                  ))}
                  <span className="text-[10px] text-zinc-500 ml-1">
                    {currentStageIndex + 1}/{questChain.length}
                  </span>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
