import { motion } from 'motion/react';
import { AlertTriangle, ChevronUp } from 'lucide-react';

interface PendingIntentBannerProps {
  reason: string | null;
  onRestore: () => void;
}

export function PendingIntentBanner({ reason, onRestore }: PendingIntentBannerProps) {
  return (
    <motion.div
      initial={{ y: 10, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 10, opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <button
        onClick={onRestore}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl hover:bg-amber-500/15 transition-colors group"
      >
        <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="text-sm text-amber-200/90 truncate flex-1 text-left">
          {reason ? `待确认：${reason}` : '有待确认的意图选择'}
        </span>
        <ChevronUp className="w-4 h-4 text-amber-400/60 group-hover:text-amber-400 transition-colors flex-shrink-0" />
      </button>
    </motion.div>
  );
}
