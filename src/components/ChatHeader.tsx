/**
 * ChatHeader — 顶部栏 (PC + 移动端菜单)
 */

import { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle, Backpack, ChevronsRight, Heart, Home,
  Map, MoreHorizontal, RefreshCw, Save, Volume1, Volume2, VolumeX,
} from 'lucide-react';
import type { TextSpeed } from './TypewriterMessage';

interface ChatHeaderProps {
  characterName: string;
  portraitUrl: string | null;
  tensionLevel: number;
  hp: number;
  affection: number;
  affectionDelta: number | null;
  affectionAnimKey: number;
  // Drive
  driveError: any;
  isAuthenticated: boolean;
  isReconnecting: boolean;
  onReconnectDrive: () => void;
  // Volume
  volume: number;
  onChangeVolume: (v: number) => void;
  // Text speed
  textSpeed: TextSpeed;
  onCycleTextSpeed: () => void;
  speedLabel: string;
  // Actions
  onExportSave: () => void;
  onShowMap: () => void;
  onShowStatus: () => void;
}

export function ChatHeader({
  characterName, portraitUrl, tensionLevel, hp, affection,
  affectionDelta, affectionAnimKey,
  driveError, isAuthenticated, isReconnecting, onReconnectDrive,
  volume, onChangeVolume,
  textSpeed, onCycleTextSpeed, speedLabel,
  onExportSave, onShowMap, onShowStatus,
}: ChatHeaderProps) {
  const navigate = useNavigate();
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const VolumeIcon = volume === 0 ? VolumeX : volume < 0.5 ? Volume1 : Volume2;

  // 点击菜单外部关闭‹⋯›菜单
  useEffect(() => {
    if (!showMoreMenu) return;
    const handler = (e: MouseEvent | TouchEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(e.target as Node)) {
        setShowMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [showMoreMenu]);

  return (
    <div className="flex items-center justify-between p-3 sm:p-4 bg-zinc-900/50 backdrop-blur-md border-b border-zinc-800 z-30 relative">
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <div className="w-10 h-10 rounded-lg bg-zinc-800 overflow-hidden border border-zinc-700 flex items-center justify-center shrink-0">
          {portraitUrl ? (
            <img src={portraitUrl} alt={characterName} className="w-full h-full object-cover" />
          ) : (
            <span className="text-zinc-500 font-medium">{characterName[0]}</span>
          )}
        </div>
        <div>
          <h1 className="font-medium text-zinc-100">{characterName}</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-400">
              {tensionLevel === 0 && "和平"}
              {tensionLevel === 1 && "冒险"}
              {tensionLevel === 2 && "冲突"}
              {tensionLevel === 3 && "危机"}
              {tensionLevel === 4 && "灾难"}
            </span>
            <div className="hidden sm:flex gap-0.5">
              {[0, 1, 2, 3, 4].map(level => (
                <div
                  key={level}
                  className={`w-1.5 h-1.5 rounded-full ${
                    level <= tensionLevel
                      ? (level >= 3 ? 'bg-red-500' : level >= 1 ? 'bg-amber-500' : 'bg-emerald-500')
                      : 'bg-zinc-800'
                  }`}
                />
              ))}
            </div>
            <span className={`text-xs whitespace-nowrap ${hp <= 30 ? 'text-red-400' : hp <= 60 ? 'text-amber-400' : 'text-zinc-400'}`}>
              HP {hp}
            </span>
            <span className={`text-xs flex items-center gap-0.5 relative whitespace-nowrap ${affection >= 80 ? 'text-pink-400' : affection >= 60 ? 'text-rose-400' : affection >= 20 ? 'text-zinc-400' : 'text-zinc-600'}`}>
              <Heart className="w-3 h-3" fill={affection >= 60 ? 'currentColor' : 'none'} />
              {affection}
              <AnimatePresence>
                {affectionDelta !== null && (
                  <motion.span
                    key={affectionAnimKey}
                    initial={{ opacity: 1, y: 0 }}
                    animate={{ opacity: 0, y: -18 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                    className={`absolute -top-1 left-full ml-1 text-xs font-bold whitespace-nowrap pointer-events-none ${affectionDelta > 0 ? 'text-pink-400' : 'text-blue-400'}`}
                  >
                    {affectionDelta > 0 ? `+${affectionDelta}` : affectionDelta}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {driveError ? (
          <button
            onClick={onReconnectDrive}
            disabled={isReconnecting}
            className="flex items-center gap-1.5 text-xs text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20 hover:bg-red-500/20 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${isReconnecting ? 'animate-spin' : ''}`} />
            <span>{isReconnecting ? '重连中...' : 'Drive 异常 · 点击重连'}</span>
          </button>
        ) : isAuthenticated ? (
          <div className="flex items-center gap-1 text-xs text-emerald-500 bg-emerald-500/10 px-1 sm:px-2 py-1 rounded-full border border-emerald-500/20">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="hidden sm:inline">Drive 已连接</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-xs text-amber-500 bg-amber-500/10 px-1 sm:px-2 py-1 rounded-full border border-amber-500/20">
            <AlertCircle className="w-3 h-3" />
            <span className="hidden sm:inline">未连接 Drive</span>
          </div>
        )}

        {/* === PC: 所有按钮一字排开 === */}
        <div className="hidden sm:flex items-center gap-2">
          <div className="relative group/vol">
            <button
              onClick={() => onChangeVolume(volume === 0 ? 0.5 : 0)}
              title={volume === 0 ? '取消静音' : '静音'}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
            >
              <VolumeIcon className="w-4 h-4 text-zinc-400" />
            </button>
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 hidden group-hover/vol:block z-50">
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
          <button
            onClick={onCycleTextSpeed}
            title={`打字速度: ${speedLabel}`}
            className={`p-2 border rounded-full transition-colors ${
              textSpeed === 'normal'
                ? 'bg-zinc-900 border-zinc-800 hover:bg-zinc-800'
                : textSpeed === 'fast'
                ? 'bg-amber-500/20 border-amber-500/40 hover:bg-amber-500/30'
                : 'bg-red-500/20 border-red-500/40 hover:bg-red-500/30'
            }`}
          >
            <div className="relative w-4 h-4 flex items-center justify-center">
              <ChevronsRight className={`w-4 h-4 ${
                textSpeed === 'normal' ? 'text-zinc-400' : textSpeed === 'fast' ? 'text-amber-400' : 'text-red-400'
              }`} />
              <span className={`absolute -top-1 -right-1.5 text-[8px] font-bold ${
                textSpeed === 'normal' ? 'text-zinc-500' : textSpeed === 'fast' ? 'text-amber-400' : 'text-red-400'
              }`}>{speedLabel}</span>
            </div>
          </button>
          <button
            onClick={onExportSave}
            title="保存存档 (Ctrl+S)"
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
          >
            <Save className="w-4 h-4 text-zinc-400" />
          </button>
          <button
            onClick={onShowMap}
            title="世界地图"
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
          >
            <Map className="w-4 h-4 text-zinc-400" />
          </button>
          <button
            onClick={onShowStatus}
            title="背包与状态"
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
          >
            <Backpack className="w-4 h-4 text-zinc-400" />
          </button>

          {/* 分隔符 */}
          <div className="w-px h-5 bg-zinc-700 mx-1" />

          {/* 破坏性操作：视觉区分 + 确认 */}
          <button
            onClick={() => {
              if (window.confirm('确定要返回首页吗？当前游戏进度将中断。')) navigate('/');
            }}
            title="返回首页"
            className="p-2 bg-zinc-900 border border-zinc-700 rounded-full hover:bg-red-500/20 hover:border-red-500/40 transition-colors"
          >
            <Home className="w-4 h-4 text-zinc-500" />
          </button>
        </div>

        {/* === 移动端: pinned 按钮 + ⋯ 菜单 === */}
        <div className="flex sm:hidden items-center gap-2">
          <button
            onClick={onShowMap}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
          >
            <Map className="w-4 h-4 text-zinc-400" />
          </button>
          <button
            onClick={onShowStatus}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
          >
            <Backpack className="w-4 h-4 text-zinc-400" />
          </button>
          <div className="relative" ref={moreMenuRef}>
            <button
              onClick={() => setShowMoreMenu(v => !v)}
              className="p-2 bg-zinc-900 border border-zinc-800 rounded-full hover:bg-zinc-800 transition-colors"
            >
              <MoreHorizontal className="w-4 h-4 text-zinc-400" />
            </button>
            <AnimatePresence>
              {showMoreMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute top-full right-0 mt-2 z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl overflow-hidden min-w-[160px]"
                >
                  <button
                    onClick={() => { onCycleTextSpeed(); }}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-zinc-800 transition-colors text-sm text-zinc-300"
                  >
                    <ChevronsRight className={`w-4 h-4 ${
                      textSpeed === 'normal' ? 'text-zinc-400' : textSpeed === 'fast' ? 'text-amber-400' : 'text-red-400'
                    }`} />
                    <span>打字速度 {speedLabel}</span>
                  </button>
                  <button
                    onClick={() => { onExportSave(); }}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-zinc-800 transition-colors text-sm text-zinc-300"
                  >
                    <Save className="w-4 h-4 text-zinc-400" />
                    <span>保存存档</span>
                  </button>
                  <div className="border-t border-zinc-800 px-4 py-3">
                    <div className="flex items-center gap-3 text-sm text-zinc-300 mb-2">
                      <VolumeIcon className="w-4 h-4 text-zinc-400 shrink-0" />
                      <span>音量 {Math.round(volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.01}
                      value={volume}
                      onChange={e => onChangeVolume(parseFloat(e.target.value))}
                      className="w-full accent-zinc-400 cursor-pointer"
                    />
                  </div>
                  <div className="border-t border-zinc-800" />
                  <button
                    onClick={() => {
                      if (window.confirm('确定要返回首页吗？')) {
                        setShowMoreMenu(false);
                        navigate('/');
                      }
                    }}
                    className="flex items-center gap-3 w-full px-4 py-3 hover:bg-red-500/10 transition-colors text-sm text-red-400"
                  >
                    <Home className="w-4 h-4" />
                    <span>返回首页</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
