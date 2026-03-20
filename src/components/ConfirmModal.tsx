import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, LucideIcon } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string | React.ReactNode;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmButtonClass?: string;
  icon?: LucideIcon;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "确定",
  cancelText = "取消",
  onConfirm,
  onCancel,
  confirmButtonClass = "bg-amber-600 hover:bg-amber-500 text-white",
  icon: Icon = AlertTriangle
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-xl text-center space-y-5"
          >
            <Icon className="w-12 h-12 text-amber-400 mx-auto" />
            <div>
              <h2 className="text-lg font-bold mb-2 text-white">{title}</h2>
              <div className="text-zinc-400 text-sm leading-relaxed">
                {message}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onCancel}
                className="p-3 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-colors text-sm font-medium text-white"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className={`p-3 rounded-xl transition-colors text-sm font-medium ${confirmButtonClass}`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}