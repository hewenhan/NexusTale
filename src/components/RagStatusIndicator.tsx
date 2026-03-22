import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Brain,
  CheckCircle2,
  Download,
  Loader2,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';
import { useRagStatus } from '../hooks/useRagStatus';
import type { RagPhase } from '../lib/rag/ragStatus';

/** 各阶段对应的视觉配置 */
const PHASE_CONFIG: Record<RagPhase, {
  icon: typeof Brain;
  dotColor: string;
  color: string;
  label: string;
  pulse?: boolean;
  spin?: boolean;
  showProgress?: boolean;
}> = {
  idle: {
    icon: Brain,
    dotColor: 'bg-zinc-500',
    color: 'text-zinc-500',
    label: '记忆系统待机',
  },
  downloading: {
    icon: Download,
    dotColor: 'bg-amber-400',
    color: 'text-amber-400',
    label: '首次准备记忆系统',
    showProgress: true,
    pulse: true,
  },
  'loading-model': {
    icon: Loader2,
    dotColor: 'bg-amber-400',
    color: 'text-amber-400',
    label: '加载记忆模型',
    spin: true,
    pulse: true,
  },
  rebuilding: {
    icon: RefreshCw,
    dotColor: 'bg-amber-400',
    color: 'text-amber-400',
    label: '重建记忆索引',
    spin: true,
    showProgress: true,
    pulse: true,
  },
  ready: {
    icon: CheckCircle2,
    dotColor: 'bg-emerald-400',
    color: 'text-emerald-400',
    label: '记忆就绪',
  },
  degraded: {
    icon: AlertTriangle,
    dotColor: 'bg-amber-400',
    color: 'text-amber-400',
    label: '记忆检索降级',
  },
  error: {
    icon: AlertTriangle,
    dotColor: 'bg-red-400',
    color: 'text-red-400',
    label: '记忆系统异常',
    pulse: true,
  },
};

export function RagStatusIndicator() {
  const status = useRagStatus();
  const config = PHASE_CONFIG[status.phase];
  const Icon = config.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      className="fixed right-3 bottom-28 z-20 cursor-pointer select-none"
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      onClick={() => setExpanded(v => !v)}
    >
      {/* 呼吸灯圆点 — 默认态 */}
      <motion.div
        className={`w-2.5 h-2.5 rounded-full ${config.dotColor} shadow-sm`}
        animate={config.pulse ? { opacity: [1, 0.3, 1], scale: [1, 1.3, 1] } : {}}
        transition={config.pulse ? { duration: 2, repeat: Infinity, ease: 'easeInOut' } : {}}
      />

      {/* 展开详情抽屉 */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.9 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-5 right-0 bg-zinc-900/90 backdrop-blur-sm border border-zinc-700 rounded-lg px-3 py-2 shadow-lg min-w-[160px]"
          >
            <div className="flex items-center gap-2">
              <motion.div
                className={config.color}
                animate={config.spin ? { rotate: 360 } : {}}
                transition={config.spin ? { duration: 1, repeat: Infinity, ease: 'linear' } : {}}
              >
                <Icon size={12} />
              </motion.div>
              <span className={`text-[11px] ${config.color} whitespace-nowrap`}>
                {config.label}
                {status.phase === 'ready' && status.indexedCount > 0 && (
                  <span className="text-zinc-500 ml-1">· {status.indexedCount.toLocaleString()}</span>
                )}
              </span>
            </div>

            {/* 进度条 */}
            {config.showProgress && (
              <div className="mt-1.5">
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-amber-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(status.progress * 100, 2)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flex justify-between mt-0.5">
                  <span className="text-[9px] text-zinc-500">{status.progressText}</span>
                  <span className="text-[9px] text-zinc-500">{Math.round(status.progress * 100)}%</span>
                </div>
              </div>
            )}

            {status.degradeReason && (
              <p className="text-[9px] text-zinc-500 mt-1">{status.degradeReason}</p>
            )}

            {status.phase === 'downloading' && (
              <p className="text-[9px] text-zinc-600 mt-1">下载完成后自动启用，仅需一次</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
