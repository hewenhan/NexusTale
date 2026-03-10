import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';

interface DriveToastProps {
  visible: boolean;
  onDismiss: () => void;
  onReconnect: () => void;
}

export function DriveToast({ visible, onDismiss, onReconnect }: DriveToastProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (visible) {
      setShow(true);
    }
  }, [visible]);

  const handleDismiss = () => {
    setShow(false);
    onDismiss();
  };

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -40 }}
          transition={{ duration: 0.25 }}
          className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-950/90 border border-red-800 backdrop-blur-md rounded-xl px-4 py-3 shadow-lg shadow-red-950/30"
        >
          <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
          <span className="text-sm text-red-200">Drive 连接异常，图片将无法保存</span>
          <button
            onClick={onReconnect}
            className="text-xs text-red-300 hover:text-white bg-red-800/60 hover:bg-red-700/80 px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap"
          >
            重新连接
          </button>
          <button onClick={handleDismiss} className="text-red-500 hover:text-red-300 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
