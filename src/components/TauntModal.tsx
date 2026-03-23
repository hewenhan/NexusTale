import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { createPortal } from 'react-dom';

interface TauntModalProps {
  isOpen: boolean;
  isGenerating: boolean;
  countdownSeconds: number;
  onDismiss: () => void;
  onAutoStory: () => void;
}

export function TauntModal({ isOpen, isGenerating, countdownSeconds, onDismiss, onAutoStory }: TauntModalProps) {
  const [countdown, setCountdown] = useState(countdownSeconds);
  // 防止倒计时归零后重复触发
  const firedRef = useRef(false);
  // 稳定引用，避免 effect 链因回调引用变化而反复触发
  const onAutoStoryRef = useRef(onAutoStory);
  onAutoStoryRef.current = onAutoStory;

  // 弹窗打开时重置状态
  useEffect(() => {
    if (isOpen) {
      firedRef.current = false;
      setCountdown(countdownSeconds);
    }
  }, [isOpen, countdownSeconds]);

  // 倒计时逻辑（countdownSeconds === 0 表示无限时间，不倒计时）
  useEffect(() => {
    if (!isOpen || isGenerating || countdownSeconds === 0) return;
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, isGenerating, countdownSeconds]);

  // 倒计时到 0 自动触发（仅一次；countdownSeconds === 0 时禁用自动触发）
  useEffect(() => {
    if (countdownSeconds === 0) return;
    if (isOpen && countdown === 0 && !isGenerating && !firedRef.current) {
      firedRef.current = true;
      onAutoStoryRef.current();
    }
  }, [isOpen, countdown, isGenerating, countdownSeconds]);

  const modal = (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[150] flex items-center justify-center overflow-hidden"
        >
          {/* 深色背景 + CRT 扫描线效果 */}
          <div className="absolute inset-0 bg-black/90" onClick={onDismiss} />
          <div
            className="absolute inset-0 pointer-events-none opacity-10"
            style={{
              backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.03) 2px, rgba(255,255,255,0.03) 4px)',
            }}
          />

          {/* 主容器 */}
          <motion.div
            initial={{ scale: 0.3, rotate: -5 }}
            animate={{ scale: 1, rotate: 0 }}
            exit={{ scale: 0.5, opacity: 0, y: 100 }}
            transition={{ type: 'spring', damping: 12, stiffness: 200 }}
            className="relative z-10 max-w-md w-full mx-4 text-center"
          >
            {/* 闪烁标题 — 白色文字 + 红色 glow + Z 轴透视摇摆 */}
            <motion.div
              animate={{
                rotateY: [0, 8, -8, 5, -5, 0],
                rotateX: [0, -3, 3, -2, 2, 0],
                scale: [1, 1.04, 0.97, 1.02, 0.99, 1],
                textShadow: [
                  '0 0 20px #ff0000, 0 0 40px #ff0000, 0 0 80px #ff000088',
                  '0 0 10px #ff4444, 0 0 25px #ff4444, 0 0 50px #ff444488',
                  '0 0 30px #ff0000, 0 0 60px #ff0000, 0 0 100px #ff000088',
                  '0 0 10px #ff4444, 0 0 25px #ff4444, 0 0 50px #ff444488',
                  '0 0 20px #ff0000, 0 0 40px #ff0000, 0 0 80px #ff000088',
                  '0 0 15px #ff4444, 0 0 30px #ff4444, 0 0 60px #ff444488',
                ],
              }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="text-4xl sm:text-5xl font-black text-white mb-2 select-none"
              style={{ fontFamily: '"Microsoft YaHei", "Heiti SC", sans-serif', perspective: 400 }}
            >
              你他妈会编故事吗？
            </motion.div>

            {/* 副标题闪烁 */}
            <motion.p
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-zinc-400 text-sm mb-8 tracking-widest uppercase"
            >
              CONTINUE?
            </motion.p>

            {/* 倒计时（countdownSeconds === 0 时不显示） */}
            {!isGenerating && countdownSeconds > 0 && (
              <motion.div
                key={countdown}
                initial={{ scale: 1.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="mb-8"
              >
                <motion.span
                  animate={{
                    color: countdown <= 3
                      ? ['#ef4444', '#ffffff', '#ef4444']
                      : ['#facc15', '#f59e0b', '#facc15'],
                    textShadow: countdown <= 3
                      ? ['0 0 20px #ef4444', '0 0 40px #ef4444', '0 0 20px #ef4444']
                      : ['0 0 10px #facc15', '0 0 20px #facc15', '0 0 10px #facc15'],
                  }}
                  transition={{ duration: 0.5, repeat: Infinity }}
                  className="text-7xl font-black tabular-nums"
                  style={{ fontFamily: 'monospace' }}
                >
                  {countdown}
                </motion.span>
              </motion.div>
            )}

            {/* 生成中状态 */}
            {isGenerating && (
              <div className="mb-8">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                  className="w-10 h-10 border-2 border-amber-400 border-t-transparent rounded-full mx-auto mb-3"
                />
                <p className="text-amber-400 text-sm animate-pulse">正在替你编故事...</p>
              </div>
            )}

            {/* 两个按钮 — 极具反差 */}
            <div className="flex flex-col gap-4 items-center">
              {/* "不耻下问" — 巨大闪烁高亮 */}
              <motion.button
                onClick={onAutoStory}
                disabled={isGenerating}
                animate={{
                  boxShadow: [
                    '0 0 15px rgba(245, 158, 11, 0.5), 0 0 30px rgba(245, 158, 11, 0.3)',
                    '0 0 25px rgba(245, 158, 11, 0.8), 0 0 50px rgba(245, 158, 11, 0.5)',
                    '0 0 15px rgba(245, 158, 11, 0.5), 0 0 30px rgba(245, 158, 11, 0.3)',
                  ],
                }}
                transition={{ duration: 1.2, repeat: Infinity }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                className="w-full max-w-xs px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 text-black font-black text-xl rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? '编故事中...' : '🙏 不耻下问'}
              </motion.button>

              {/* "会啊" — 低调暗色 */}
              <button
                onClick={onDismiss}
                disabled={isGenerating}
                className="px-6 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors disabled:opacity-30"
              >
                会啊，滚开
              </button>
            </div>

            {/* 底部嘲讽小字 */}
            <motion.p
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="mt-8 text-zinc-600 text-xs"
            >
              {isGenerating
                ? '小模型正在替你想...'
                : countdownSeconds === 0
                  ? '慢慢想吧，不急'
                  : countdown > 0
                    ? `${countdown} 秒后自动帮你编`
                    : '时间到！'}
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
