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
  color: string;
  border: string;
  bg: string;
  label: string;
  pulse?: boolean;
  spin?: boolean;
  showProgress?: boolean;
}> = {
  idle: {
    icon: Brain,
    color: 'text-zinc-500',
    border: 'border-zinc-700',
    bg: 'bg-zinc-900/80',
    label: '记忆系统待机',
  },
  downloading: {
    icon: Download,
    color: 'text-amber-400',
    border: 'border-amber-700/50',
    bg: 'bg-zinc-900/90',
    label: '首次准备记忆系统',
    showProgress: true,
  },
  'loading-model': {
    icon: Loader2,
    color: 'text-amber-400',
    border: 'border-amber-700/50',
    bg: 'bg-zinc-900/90',
    label: '加载记忆模型',
    spin: true,
  },
  rebuilding: {
    icon: RefreshCw,
    color: 'text-amber-400',
    border: 'border-amber-700/50',
    bg: 'bg-zinc-900/90',
    label: '重建记忆索引',
    spin: true,
    showProgress: true,
  },
  ready: {
    icon: CheckCircle2,
    color: 'text-emerald-400',
    border: 'border-emerald-700/50',
    bg: 'bg-zinc-900/80',
    label: '记忆就绪',
    pulse: true,
  },
  degraded: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    border: 'border-amber-700/50',
    bg: 'bg-zinc-900/80',
    label: '记忆检索降级',
  },
  error: {
    icon: AlertTriangle,
    color: 'text-red-400',
    border: 'border-red-700/50',
    bg: 'bg-zinc-900/80',
    label: '记忆系统异常',
  },
};

export function RagStatusIndicator() {
  const status = useRagStatus();
  const config = PHASE_CONFIG[status.phase];
  const Icon = config.icon;

  const isExpanded = status.phase !== 'ready' && status.phase !== 'idle';

  return (
    <motion.div
      className={`fixed right-4 bottom-32 z-20 ${config.bg} backdrop-blur-sm border ${config.border} rounded-xl px-3 py-2 shadow-lg`}
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.3 }}
      layout
    >
      <div className="flex items-center gap-2">
        {/* 图标 */}
        <motion.div
          className={config.color}
          animate={config.pulse ? { opacity: [1, 0.5, 1] } : config.spin ? { rotate: 360 } : {}}
          transition={config.pulse
            ? { duration: 2, repeat: Infinity, ease: 'easeInOut' }
            : config.spin
              ? { duration: 1, repeat: Infinity, ease: 'linear' }
              : {}
          }
        >
          <Icon size={14} />
        </motion.div>

        {/* 标签 */}
        <span className={`text-xs ${config.color} whitespace-nowrap`}>
          {config.label}
          {status.phase === 'ready' && status.indexedCount > 0 && (
            <span className="text-zinc-500 ml-1">· {status.indexedCount.toLocaleString()}</span>
          )}
        </span>
      </div>

      {/* 展开区域 */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* 进度条 */}
            {config.showProgress && (
              <div className="mt-2">
                <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-amber-500 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(status.progress * 100, 2)}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-zinc-500">
                    {status.progressText}
                  </span>
                  <span className="text-[10px] text-zinc-500">
                    {Math.round(status.progress * 100)}%
                  </span>
                </div>
              </div>
            )}

            {/* 降级/错误原因 */}
            {status.degradeReason && (
              <p className="text-[10px] text-zinc-500 mt-1">{status.degradeReason}</p>
            )}

            {/* 首次下载说明 */}
            {status.phase === 'downloading' && (
              <p className="text-[10px] text-zinc-600 mt-1">下载完成后自动启用，仅需一次</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
