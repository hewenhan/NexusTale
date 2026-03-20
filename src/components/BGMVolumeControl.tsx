/**
 * BGMVolumeControl — 通用音量控件
 *
 * PC: 喇叭按钮 + hover 弹出滑块
 * 移动端: 同样布局，点击切换静音
 */

import { useState } from 'react';
import { Volume1, Volume2, VolumeX } from 'lucide-react';

interface BGMVolumeControlProps {
  volume: number;
  onChangeVolume: (v: number) => void;
  /** 额外的 className 加在最外层 */
  className?: string;
}

export function BGMVolumeControl({ volume, onChangeVolume, className = '' }: BGMVolumeControlProps) {
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;
  const [showSlider, setShowSlider] = useState(false);

  return (
    <div className={`relative group/vol ${className}`}>
      <button
        onClick={() => {
          // 移动端点击切换静音；PC 端靠 hover 显示滑块
          onChangeVolume(volume === 0 ? 0.5 : 0);
        }}
        onMouseEnter={() => setShowSlider(true)}
        onMouseLeave={() => setShowSlider(false)}
        title={volume === 0 ? '取消静音' : '静音'}
        className="p-2 bg-zinc-900/80 border border-zinc-700/50 rounded-full hover:bg-zinc-800 transition-colors backdrop-blur-sm"
      >
        <VolumeIcon className="w-4 h-4 text-zinc-400" />
      </button>
      <div
        className={`absolute top-full left-1/2 -translate-x-1/2 pt-2 z-50 ${showSlider ? 'block' : 'hidden'} group-hover/vol:block`}
        onMouseEnter={() => setShowSlider(true)}
        onMouseLeave={() => setShowSlider(false)}
      >
        <div className="flex flex-col items-center bg-zinc-900 border border-zinc-800 rounded-xl px-3 py-3 shadow-xl">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={e => onChangeVolume(parseFloat(e.target.value))}
            className="w-24 accent-zinc-400 cursor-pointer"
          />
          <span className="text-[10px] text-zinc-500 mt-1">{Math.round(volume * 100)}%</span>
        </div>
      </div>
    </div>
  );
}
