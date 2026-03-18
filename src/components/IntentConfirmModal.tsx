import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Check, ChevronDown, ChevronRight, Minimize2, X } from 'lucide-react';
import type { ConfuseData, ConfuseCandidate, IntentResult, IntentType, NodeData, InventoryItem } from '../types/game';
import { INTENT_LABELS, DIRECTION_LABELS } from '../types/game';

// ── Types ──

type Phase = 'intent' | 'details' | 'confirm';

interface IntentConfirmModalProps {
  confuse: ConfuseData;
  defaultIntent: IntentResult;
  /** Connected nodes for move direction/target selection */
  connectedNodes: NodeData[];
  /** Current inventory for use_item selection */
  inventory: InventoryItem[];
  /** Whether currently in transit */
  isInTransit: boolean;
  onConfirm: (intent: IntentResult) => void;
  onMinimize: () => void;
}

// ── Helpers ──

/** Build a confidence map: intent → max confidence among candidates */
function buildConfidenceMap(candidates: ConfuseCandidate[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const c of candidates) {
    const existing = map.get(c.intent) ?? 0;
    map.set(c.intent, Math.max(existing, c.confidence));
  }
  return map;
}

/** Get target confidence from candidates for a specific targetId+intent combo */
function getTargetConfidence(candidates: ConfuseCandidate[], intent: IntentType, targetId: string): number {
  const match = candidates.find(c => c.intent === intent && c.targetId === targetId);
  return match?.confidence ?? 0;
}

function getItemConfidence(candidates: ConfuseCandidate[], itemId: string): number {
  const match = candidates.find(c => c.intent === 'use_item' && c.itemId === itemId);
  return match?.confidence ?? 0;
}

function getDirectionConfidence(candidates: ConfuseCandidate[], direction: 'forward' | 'back'): number {
  const match = candidates.find(c => c.intent === 'move' && c.direction === direction);
  return match?.confidence ?? 0;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence <= 0) return null;
  const pct = Math.round(confidence * 100);
  const color = confidence >= 0.7 ? 'text-emerald-400' : confidence >= 0.4 ? 'text-amber-400' : 'text-zinc-400';
  return <span className={`text-[10px] font-mono ${color} ml-auto`}>{pct}%</span>;
}

// ── Component ──

export function IntentConfirmModal({
  confuse,
  defaultIntent,
  connectedNodes,
  inventory,
  isInTransit,
  onConfirm,
  onMinimize,
}: IntentConfirmModalProps) {
  const confidenceMap = useMemo(() => buildConfidenceMap(confuse.type), [confuse.type]);

  // Deduplicated intent list sorted by confidence
  // Ensure we don't show multiple intents with the same duplicate label
  const intentOptions = useMemo(() => {
    const sorted = [...confuse.type].sort((a, b) => b.confidence - a.confidence);
    const seenLabel = new Set<string>();
    const opts: IntentType[] = [];
    
    for (const c of sorted) {
      const label = INTENT_LABELS[c.intent];
      if (!seenLabel.has(label)) {
        seenLabel.add(label);
        opts.push(c.intent);
      }
    }
    return opts;
  }, [confuse.type]);

  // Handle fallback if the default intent was deduplicated out
  const resolvedDefaultIntent = useMemo(() => {
    if (intentOptions.includes(defaultIntent.intent)) {
      return defaultIntent.intent;
    }
    const defaultLabel = INTENT_LABELS[defaultIntent.intent];
    const matchByLabel = intentOptions.find(opt => INTENT_LABELS[opt] === defaultLabel);
    return matchByLabel ?? intentOptions[0] ?? 'idle';
  }, [defaultIntent.intent, intentOptions]);

  const [phase, setPhase] = useState<Phase>('intent');
  const [selectedIntent, setSelectedIntent] = useState<IntentType>(resolvedDefaultIntent);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(defaultIntent.targetId);
  const [selectedDirection, setSelectedDirection] = useState<'forward' | 'back' | null>(defaultIntent.direction ?? null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(defaultIntent.itemId ?? null);

  const needsDetails = selectedIntent === 'move' || selectedIntent === 'use_item';

  const handleIntentSelect = useCallback((intent: IntentType) => {
    setSelectedIntent(intent);
    // Reset sub-options when intent changes
    const bestCandidate = confuse.type.find(c => c.intent === intent);
    setSelectedTargetId(bestCandidate?.targetId ?? null);
    setSelectedDirection(bestCandidate?.direction ?? null);
    setSelectedItemId(bestCandidate?.itemId ?? null);
  }, [confuse.type]);

  const handleProceed = useCallback(() => {
    if (needsDetails && phase === 'intent') {
      setPhase('details');
    } else {
      setPhase('confirm');
    }
  }, [needsDetails, phase]);

  const handleFinalConfirm = useCallback(() => {
    const result: IntentResult = {
      intent: selectedIntent as IntentType,
      targetId: selectedTargetId,
      direction: selectedDirection ?? undefined,
      itemId: selectedItemId ?? undefined,
    };
    onConfirm(result);
  }, [selectedIntent, selectedTargetId, selectedDirection, selectedItemId, onConfirm]);

  const handleBack = useCallback(() => {
    if (phase === 'confirm') {
      setPhase(needsDetails ? 'details' : 'intent');
    } else if (phase === 'details') {
      setPhase('intent');
    }
  }, [phase, needsDetails]);

  // ── Render helpers ──

  const renderIntentPhase = () => (
    <div className="space-y-2">
      {intentOptions.map(intent => {
        const isSelected = intent === selectedIntent;
        const confidence = confidenceMap.get(intent) ?? 0;
        return (
          <button
            key={intent}
            onClick={() => handleIntentSelect(intent)}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
              isSelected
                ? 'bg-amber-500/10 border-amber-500/50 text-amber-100'
                : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600'
            }`}
          >
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-amber-400' : 'bg-zinc-600'}`} />
            <span className="font-medium">{INTENT_LABELS[intent]}</span>
            <ConfidenceBadge confidence={confidence} />
          </button>
        );
      })}
    </div>
  );

  const renderDetailsPhase = () => {
    if (selectedIntent === 'move') {
      return (
        <div className="space-y-3">
          {/* Direction selector (only in transit) */}
          {isInTransit && (
            <div>
              <p className="text-xs text-zinc-400 mb-2 font-medium">方向</p>
              <div className="flex gap-2">
                {(['forward', 'back'] as const).map(dir => {
                  const isSelected = dir === selectedDirection;
                  const confidence = getDirectionConfidence(confuse.type, dir);
                  return (
                    <button
                      key={dir}
                      onClick={() => setSelectedDirection(dir)}
                      className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500/50 text-amber-100'
                          : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      <span>{DIRECTION_LABELS[dir]}</span>
                      <ConfidenceBadge confidence={confidence} />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Target selector */}
          <div>
            <p className="text-xs text-zinc-400 mb-2 font-medium">目标地点</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {/* null target = exit building */}
              <button
                onClick={() => setSelectedTargetId(null)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                  selectedTargetId === null
                    ? 'bg-amber-500/10 border-amber-500/50 text-amber-100'
                    : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800'
                }`}
              >
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${selectedTargetId === null ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                <span>离开当前位置</span>
              </button>
              {connectedNodes.map(node => {
                const isSelected = node.id === selectedTargetId;
                const confidence = getTargetConfidence(confuse.type, 'move', node.id);
                return (
                  <button
                    key={node.id}
                    onClick={() => setSelectedTargetId(node.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                      isSelected
                        ? 'bg-amber-500/10 border-amber-500/50 text-amber-100'
                        : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800'
                    }`}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isSelected ? 'bg-amber-400' : 'bg-zinc-600'}`} />
                    <span>{node.name}</span>
                    <span className="text-[10px] text-zinc-500">{node.type}</span>
                    <ConfidenceBadge confidence={confidence} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    if (selectedIntent === 'use_item') {
      return (
        <div>
          <p className="text-xs text-zinc-400 mb-2 font-medium">选择道具</p>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {inventory.map(item => {
              const isSelected = item.id === selectedItemId;
              const confidence = getItemConfidence(confuse.type, item.id);
              return (
                <button
                  key={item.id}
                  onClick={() => setSelectedItemId(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 text-amber-100'
                      : 'bg-zinc-800/50 border-zinc-700/50 text-zinc-300 hover:bg-zinc-800'
                  }`}
                >
                  <span className="text-lg flex-shrink-0">{item.icon}</span>
                  <div className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{item.name}</span>
                    <span className="text-[10px] text-zinc-500 truncate">{item.description}</span>
                  </div>
                  <ConfidenceBadge confidence={confidence} />
                </button>
              );
            })}
          </div>
        </div>
      );
    }

    return null;
  };

  const renderConfirmPhase = () => {
    const intentLabel = INTENT_LABELS[selectedIntent] ?? selectedIntent;
    const targetNode = connectedNodes.find(n => n.id === selectedTargetId);
    const selectedItem = inventory.find(i => i.id === selectedItemId);

    return (
      <div className="space-y-3">
        <p className="text-sm text-zinc-300 text-center">确认执行以下操作？</p>
        <div className="bg-zinc-800/70 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">意图</span>
            <span className="text-amber-300 font-medium">{intentLabel}</span>
          </div>
          {selectedIntent === 'move' && (
            <>
              {isInTransit && selectedDirection && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-zinc-500">方向</span>
                  <span className="text-zinc-200">{DIRECTION_LABELS[selectedDirection]}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500">目标</span>
                <span className="text-zinc-200">{targetNode?.name ?? '离开当前位置'}</span>
              </div>
            </>
          )}
          {selectedIntent === 'use_item' && selectedItem && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">道具</span>
              <span className="text-zinc-200">{selectedItem.icon} {selectedItem.name}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const phaseTitle = phase === 'intent' ? '选择意图' : phase === 'details' ? '选择详情' : '确认操作';

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[55]"
      />

      {/* Modal */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-[55] bg-zinc-900 border-t border-amber-500/30 rounded-t-2xl max-h-[80vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-200">{phaseTitle}</span>
          </div>
          <button
            onClick={onMinimize}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
            title="收起"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        </div>

        {/* Reason */}
        {phase === 'intent' && confuse.reason && (
          <div className="px-4 pt-3">
            <p className="text-xs text-zinc-400 bg-zinc-800/50 rounded-lg px-3 py-2 leading-relaxed">
              <span className="text-amber-400/80">系统不确定你的意图：</span>{confuse.reason}
            </p>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          <AnimatePresence mode="wait">
            <motion.div
              key={phase}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.15 }}
            >
              {phase === 'intent' && renderIntentPhase()}
              {phase === 'details' && renderDetailsPhase()}
              {phase === 'confirm' && renderConfirmPhase()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800 flex items-center gap-3">
          {phase !== 'intent' && (
            <button
              onClick={handleBack}
              className="px-4 py-2.5 rounded-xl bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors text-sm"
            >
              返回
            </button>
          )}
          <div className="flex-1" />
          {phase === 'confirm' ? (
            <button
              onClick={handleFinalConfirm}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500 text-black font-medium hover:bg-amber-400 transition-colors text-sm"
            >
              <Check className="w-4 h-4" />
              确认执行
            </button>
          ) : (
            <button
              onClick={handleProceed}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 hover:bg-amber-500/30 transition-colors text-sm"
            >
              下一步
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}
