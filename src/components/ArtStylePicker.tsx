import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles } from 'lucide-react';
import { ART_STYLE_PRESETS, ArtStyleOption } from '../types/artStyles';

interface ArtStylePickerProps {
  onSelect: (option: ArtStyleOption | 'system') => void;
}

export function ArtStylePicker({ onSelect }: ArtStylePickerProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const allOptions = [
    ...ART_STYLE_PRESETS,
    {
      name: '系统推荐',
      description: '系统根据用户选择的世界卡片自动推荐出图风格方案',
      prompt: '',
    },
  ];

  const handleClick = (index: number) => {
    if (selectedIndex !== null) return; // 已选择，不再响应
    setSelectedIndex(index);
    if (index === allOptions.length - 1) {
      onSelect('system');
    } else {
      onSelect(ART_STYLE_PRESETS[index]);
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center space-y-1">
        <h3 className="text-lg font-bold text-zinc-100">选择出图风格</h3>
        <p className="text-sm text-zinc-400">决定游戏中所有生成图片的视觉风格</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {allOptions.map((opt, idx) => {
          const isSelected = selectedIndex === idx;
          const isSystemRecommend = idx === allOptions.length - 1;

          return (
            <div key={idx} className="relative">
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                onClick={() => handleClick(idx)}
                onMouseEnter={() => setHoveredIndex(idx)}
                onMouseLeave={() => setHoveredIndex(null)}
                onTouchStart={() => setHoveredIndex(idx)}
                onTouchEnd={() => setHoveredIndex(null)}
                disabled={selectedIndex !== null && !isSelected}
                className={`
                  w-full p-4 rounded-xl border text-center transition-all relative overflow-hidden
                  ${isSelected
                    ? 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/30 text-emerald-300'
                    : selectedIndex !== null
                      ? 'border-zinc-800 bg-zinc-900/30 text-zinc-600 cursor-not-allowed'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-600 hover:bg-zinc-800 cursor-pointer'
                  }
                `}
              >
                {isSystemRecommend && (
                  <Sparkles className="w-5 h-5 mx-auto mb-1 text-amber-400" />
                )}
                <span className="text-sm font-medium">{opt.name}</span>
                {isSelected && (
                  <div className="text-xs text-emerald-400 mt-1">已选择</div>
                )}
              </motion.button>

              {/* 悬浮/按住显示描述 */}
              <AnimatePresence>
                {hoveredIndex === idx && !isSelected && selectedIndex === null && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-56 p-3 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl text-xs text-zinc-300 pointer-events-none"
                  >
                    {opt.description}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
