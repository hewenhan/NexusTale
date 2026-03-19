import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import type { QuestCompletionCeremony } from '../types/game';

// ─── Typewriter click sound (Web Audio, no external files) ─────

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  return audioCtx;
}

function playClickSound(volume = 0.1) {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 600 + Math.random() * 400;
    osc.type = 'square';
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.03);
  } catch { /* silent */ }
}

// ─── Typewriter hook (lightweight, self-contained) ─────────────

function useTypewriter(text: string, active: boolean, charsPerSecond = 8, skip = false) {
  const [displayed, setDisplayed] = useState(0);
  const lastSoundRef = useRef(0);
  const done = displayed >= text.length;

  useEffect(() => {
    if (skip) { setDisplayed(text.length); return; }
    if (!active || done) return;
    setDisplayed(0);
    lastSoundRef.current = 0;
  }, [text, active, skip]);

  useEffect(() => {
    if (skip || !active || done) return;
    const baseInterval = 1000 / charsPerSecond;
    let raf: number;
    let last = performance.now();

    const tick = (now: number) => {
      const elapsed = now - last;
      const jitter = baseInterval * (0.6 + Math.random() * 0.8);
      if (elapsed >= jitter) {
        last = now;
        setDisplayed(prev => {
          const burst = Math.random() < 0.3 ? 2 : 1;
          const next = Math.min(prev + burst, text.length);
          if (next - lastSoundRef.current >= 4) {
            lastSoundRef.current = next;
            playClickSound();
          }
          return next;
        });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, done, text, charsPerSecond, skip]);

  return { displayed: text.slice(0, displayed), done };
}

// ─── Particle generator ────────────────────────────────────────

function generateParticles(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 4 + 2,
    delay: Math.random() * 1.2,
    duration: Math.random() * 2.5 + 1.5,
  }));
}

// ─── Phase definitions ─────────────────────────────────────────

type Phase = 'recap' | 'climax' | 'companion' | 'reward' | 'epilogue';
const PHASE_ORDER: Phase[] = ['recap', 'climax', 'companion', 'reward', 'epilogue'];

const PHASE_HEADERS: Record<Phase, { icon: string; label: string }> = {
  recap:     { icon: '✦', label: '旅途回顾' },
  climax:    { icon: '⚔️', label: '终幕' },
  companion: { icon: '💛', label: '' }, // filled dynamically with companion name
  reward:    { icon: '🏆', label: '丰碑' },
  epilogue:  { icon: '✧', label: '新章' },
};

const STAGE_ICONS = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧'];

// ─── Sub-components ────────────────────────────────────────────

function PhaseHeader({ icon, label }: { icon: string; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex items-center justify-center gap-2 mb-4"
    >
      <span className="text-xl">{icon}</span>
      <span className="text-xs font-bold uppercase tracking-[0.3em] text-amber-400">{label}</span>
      <span className="text-xl">{icon}</span>
    </motion.div>
  );
}

function TypewriterLine({ text, active, className, onDone, skip }: {
  text: string; active: boolean; className?: string; onDone?: () => void; skip?: boolean;
}) {
  const { displayed, done } = useTypewriter(text, active, 8, skip);
  const firedRef = useRef(false);

  useEffect(() => {
    if (done && !firedRef.current) {
      firedRef.current = true;
      onDone?.();
    }
  }, [done, onDone]);

  if (!active && !done) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={className}
    >
      {displayed}
      {active && !done && <span className="animate-pulse text-amber-400">▎</span>}
    </motion.div>
  );
}

// ─── Main Component ────────────────────────────────────────────

interface QuestCeremonyOverlayProps {
  ceremony: QuestCompletionCeremony;
  companionName: string;
  onDismiss: () => void;
}

export function QuestCeremonyOverlay({ ceremony, companionName, onDismiss }: QuestCeremonyOverlayProps) {
  const [particles] = useState(() => generateParticles(60));
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [recapLine, setRecapLine] = useState(0);
  // Track which recap lines are done
  const [recapDone, setRecapDone] = useState(0);
  const [climaxDone, setClimaxDone] = useState(false);
  const [companionDone, setCompanionDone] = useState(false);
  const [rewardDescDone, setRewardDescDone] = useState(false);
  const [epilogueDone, setEpilogueDone] = useState(false);
  const [skipConfirm, setSkipConfirm] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const currentPhase = PHASE_ORDER[phaseIndex];

  // Skip all animations: reveal everything instantly
  const handleSkipAll = useCallback(() => {
    setSkipped(true);
    setPhaseIndex(PHASE_ORDER.length - 1);
    setRecapLine(ceremony.recap.length - 1);
    setRecapDone(ceremony.recap.length);
    setClimaxDone(true);
    setCompanionDone(true);
    setRewardDescDone(true);
    setEpilogueDone(true);
  }, [ceremony.recap.length]);

  // Auto-scroll to bottom as content grows
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }
  }, [recapDone, climaxDone, companionDone, rewardDescDone, epilogueDone, phaseIndex, recapLine]);

  // Recap: advance to next line after each line finishes
  const handleRecapLineDone = useCallback(() => {
    setRecapDone(prev => prev + 1);
  }, []);

  useEffect(() => {
    if (currentPhase !== 'recap') return;
    if (recapDone > recapLine && recapLine < ceremony.recap.length - 1) {
      const timer = setTimeout(() => setRecapLine(prev => prev + 1), 600);
      return () => clearTimeout(timer);
    }
    if (recapDone >= ceremony.recap.length) {
      // All recap lines done → advance phase
      const timer = setTimeout(() => setPhaseIndex(1), 800);
      return () => clearTimeout(timer);
    }
  }, [recapDone, recapLine, ceremony.recap.length, currentPhase]);

  // Climax done → advance
  useEffect(() => {
    if (climaxDone) {
      const timer = setTimeout(() => setPhaseIndex(2), 800);
      return () => clearTimeout(timer);
    }
  }, [climaxDone]);

  // Companion done → advance
  useEffect(() => {
    if (companionDone) {
      const timer = setTimeout(() => setPhaseIndex(3), 800);
      return () => clearTimeout(timer);
    }
  }, [companionDone]);

  // Reward done → advance to epilogue
  useEffect(() => {
    if (rewardDescDone) {
      const timer = setTimeout(() => setPhaseIndex(4), 800);
      return () => clearTimeout(timer);
    }
  }, [rewardDescDone]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="fixed inset-0 z-[250] flex flex-col items-center justify-center"
    >
      {/* Hide scrollbar for WebKit */}
      <style>{`.ceremony-scroll::-webkit-scrollbar { display: none; }`}</style>
      {/* Dark backdrop */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-lg" />

      {/* Gold particles */}
      {particles.map(p => (
        <motion.div
          key={p.id}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 0.8, 0],
            scale: [0, 1, 0],
            y: [0, -(Math.random() * 150 + 50)],
            x: [(Math.random() - 0.5) * 60],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            repeatDelay: Math.random() * 3,
            ease: 'easeOut',
          }}
          style={{
            position: 'absolute',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            background: `radial-gradient(circle, #fbbf24, #f59e0b)`,
            boxShadow: `0 0 ${p.size * 3}px rgba(251, 191, 36, 0.6)`,
            pointerEvents: 'none',
          }}
        />
      ))}

      {/* Content area */}
      <div
        ref={scrollRef}
        className="ceremony-scroll relative z-10 w-full max-h-[100vh] overflow-y-auto px-8 py-12"
        style={{
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          maskImage: 'linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)',
          WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 6%, black 94%, transparent 100%)',
        }}
      >
        <div className="max-w-2xl mx-auto">
        {/* ── Phase: Recap ── */}
        {phaseIndex >= 0 && (
          <div className="mb-8">
            <PhaseHeader icon={PHASE_HEADERS.recap.icon} label={PHASE_HEADERS.recap.label} />
            <div className="space-y-3">
              {ceremony.recap.map((line, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-amber-500 font-bold text-sm mt-0.5 shrink-0">{STAGE_ICONS[i] || `${i + 1}`}</span>
                  <TypewriterLine
                    text={line}
                    active={skipped || (currentPhase === 'recap' && i <= recapLine)}
                    className="text-sm text-zinc-300 leading-relaxed"
                    onDone={i <= recapLine ? handleRecapLineDone : undefined}
                    skip={skipped}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Phase: Climax ── */}
        <AnimatePresence>
          {phaseIndex >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-8"
            >
              <PhaseHeader icon={PHASE_HEADERS.climax.icon} label={PHASE_HEADERS.climax.label} />
              <TypewriterLine
                text={ceremony.climax}
                active={skipped || currentPhase === 'climax'}
                className="text-base text-amber-100 leading-relaxed text-center font-medium"
                onDone={() => setClimaxDone(true)}
                skip={skipped}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Phase: Companion Reaction ── */}
        <AnimatePresence>
          {phaseIndex >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-8"
            >
              <PhaseHeader icon={PHASE_HEADERS.companion.icon} label={companionName} />
              <TypewriterLine
                text={ceremony.companionReaction}
                active={skipped || currentPhase === 'companion'}
                className="text-sm text-zinc-300 leading-relaxed text-center italic"
                onDone={() => setCompanionDone(true)}
                skip={skipped}
              />
              {/* Affection fly-in */}
              {companionDone && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.5, x: 30 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  transition={{ type: 'spring', damping: 12, stiffness: 200 }}
                  className="flex items-center justify-center gap-1 mt-3 text-rose-400"
                >
                  <span className="text-lg">❤️</span>
                  <span className="font-bold text-lg">+{ceremony.affectionDelta}</span>
                </motion.div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Phase: Reward card ── */}
        <AnimatePresence>
          {phaseIndex >= 3 && (
            <motion.div
              initial={{ scale: 0.6, opacity: 0, rotateY: -10 }}
              animate={{ scale: 1, opacity: 1, rotateY: 0 }}
              transition={{ type: 'spring', damping: 15, stiffness: 180 }}
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.06))',
                border: '1px solid rgba(245, 158, 11, 0.4)',
                boxShadow: '0 0 60px rgba(245, 158, 11, 0.2), 0 0 120px rgba(245, 158, 11, 0.1)',
              }}
            >
              {/* Metal sheen */}
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '200%' }}
                transition={{ duration: 1.5, delay: 0.3, ease: 'easeInOut' }}
                className="absolute inset-0 pointer-events-none"
                style={{
                  background: 'linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.12) 45%, rgba(255,255,255,0.04) 55%, transparent 60%)',
                }}
              />

              {/* Top line */}
              <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)' }} />

              <div className="p-6 text-center">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', delay: 0.2, damping: 10 }}
                  className="text-4xl mb-3"
                >
                  🏆
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-xs font-bold uppercase tracking-[0.3em] text-amber-400 mb-2"
                >
                  任务完成
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="text-xl font-bold text-white mb-3"
                >
                  {ceremony.reward.title}
                </motion.h2>

                <TypewriterLine
                  text={ceremony.reward.description}
                  active={skipped || currentPhase === 'reward'}
                  className="text-sm text-zinc-300 leading-relaxed"
                  onDone={() => setRewardDescDone(true)}
                  skip={skipped}
                />
              </div>

              {/* Bottom line */}
              <div className="h-1 w-full" style={{ background: 'linear-gradient(90deg, transparent, #f59e0b, transparent)' }} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Phase: Epilogue ── */}
        <AnimatePresence>
          {phaseIndex >= 4 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
              className="mb-8 mt-8"
            >
              <PhaseHeader icon={PHASE_HEADERS.epilogue.icon} label={PHASE_HEADERS.epilogue.label} />
              <TypewriterLine
                text={ceremony.epilogue}
                active={skipped || currentPhase === 'epilogue'}
                className="text-sm text-zinc-400 leading-relaxed text-center italic"
                onDone={() => setEpilogueDone(true)}
                skip={skipped}
              />
              {/* Dismiss button */}
              {epilogueDone && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  onClick={onDismiss}
                  className="mt-6 mx-auto block px-6 py-2 rounded-full bg-amber-600/20 border border-amber-500/40 text-amber-300 text-sm font-medium hover:bg-amber-600/30 transition-colors"
                >
                  继续冒险
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </div>

      {/* Skip button (bottom-right), hidden once epilogue dismiss is available */}
      {!epilogueDone && (
        <div className="fixed bottom-6 right-6 z-[260] flex items-center gap-2">
          <AnimatePresence>
            {skipConfirm && (
              <motion.span
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="text-xs text-zinc-400"
              >
                确定跳过？
              </motion.span>
            )}
          </AnimatePresence>
          <button
            onClick={() => {
              if (skipConfirm) { handleSkipAll(); setSkipConfirm(false); } else { setSkipConfirm(true); }
            }}
            onBlur={() => setSkipConfirm(false)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
              skipConfirm
                ? 'bg-red-600/30 border border-red-500/50 text-red-300 hover:bg-red-600/50'
                : 'bg-zinc-800/60 border border-zinc-700/40 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600'
            }`}
          >
            {skipConfirm ? '确认跳过' : '跳过 ⏭'}
          </button>
        </div>
      )}
    </motion.div>
  );
}
