import React, { useState } from 'react';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'motion/react';
import { Upload, Globe, Plus, History, AlertTriangle } from 'lucide-react';
import { APP_TITLE, APP_SUBTITLE } from '../lib/appMeta';
import { BackgroundImage } from '../components/BackgroundImage';

export default function Home() {
  const { state, updateState, loadSave, resetGame } = useGame();
  const { isAuthenticated, login, refreshSession } = useAuth();
  const navigate = useNavigate();
  const [tempLanguage, setTempLanguage] = useState<'zh' | 'en'>(() => {
    return state.language || 'zh';
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingSaveText, setPendingSaveText] = useState<string | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [showNewGameConfirm, setShowNewGameConfirm] = useState(false);

  const hasSave = state.history && state.history.length > 0;

  const handleReconnect = async () => {
    setIsRefreshing(true);
    const success = await refreshSession();
    if (!success) {
      // If refresh fails, try full login
      login();
    }
    setIsRefreshing(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      try {
        const parsed = JSON.parse(text);
        if (!parsed.language) {
          setPendingSaveText(text);
          setShowLanguageModal(true);
        } else {
          if (loadSave(text)) {
            navigate('/chat');
          } else {
            alert("存档格式无效。");
          }
        }
      } catch (err) {
        alert("存档格式无效。");
      }
    };
    reader.readAsText(file);
  };

  const handleLanguageSelectForSave = (lang: 'zh' | 'en') => {
    if (pendingSaveText) {
      try {
        const parsed = JSON.parse(pendingSaveText);
        parsed.language = lang;
        if (loadSave(JSON.stringify(parsed))) {
          navigate('/chat');
        } else {
          alert("存档格式无效。");
        }
      } catch (err) {
        alert("存档处理失败。");
      }
    }
    setShowLanguageModal(false);
    setPendingSaveText(null);
  };

  const handleStartGame = () => {
    if (!isAuthenticated) {
      alert("请先连接 Google Drive 以启用图片保存功能。");
      return;
    }
    if (hasSave) {
      setShowNewGameConfirm(true);
      return;
    }
    confirmStartNewGame();
  };

  const confirmStartNewGame = () => {
    setShowNewGameConfirm(false);
    resetGame();
    updateState({ 
      language: tempLanguage,
      isFirstRun: true 
    });
    navigate('/setup');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-end pb-6 p-4 font-sans">
      <BackgroundImage trigger={0} />

      {/* Title — floats over the character area */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed top-0 left-0 right-0 z-10 text-center pt-8 pb-4 px-4"
        style={{ textShadow: '0 2px 20px rgba(0,0,0,1), 0 0 40px rgba(0,0,0,0.8)' }}
      >
        <h1 className="text-4xl font-bold tracking-tighter text-white">
          {APP_TITLE}
        </h1>
        <p className="text-zinc-100 text-base font-medium leading-relaxed mt-1">{APP_SUBTITLE}</p>
      </motion.div>

      {/* Bottom panel — compact controls */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-md w-full space-y-4 relative z-10"
      >
        <div className="bg-zinc-950/85 border border-zinc-800/60 p-5 rounded-2xl space-y-5 backdrop-blur-xl">
          
          {/* Auth Status */}
          <div className="flex items-center justify-between p-3 bg-zinc-900 rounded-xl border border-zinc-800">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isAuthenticated ? 'bg-emerald-500' : 'bg-red-500'}`} />
              <span className="text-sm font-medium">
                {isAuthenticated ? 'Google Drive 已连接' : 'Drive 未连接'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {isAuthenticated && (
                <button 
                  onClick={handleReconnect}
                  disabled={isRefreshing}
                  className="text-xs bg-zinc-800 text-zinc-300 px-3 py-1.5 rounded-full font-medium hover:bg-zinc-700 transition-colors disabled:opacity-50"
                >
                  {isRefreshing ? '刷新中...' : '重新连接'}
                </button>
              )}
              {!isAuthenticated && (
                <button 
                  onClick={login}
                  className="text-xs bg-white text-black px-3 py-1.5 rounded-full font-medium hover:bg-zinc-200 transition-colors"
                >
                  连接
                </button>
              )}
            </div>
          </div>

          {/* Language */}
          <div className="space-y-1">
            <label className="text-xs text-zinc-500">AI 回复语言</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 'zh', label: '中文' },
                { value: 'en', label: 'English' }
              ].map((l) => (
                <button
                  key={l.value}
                  onClick={() => setTempLanguage(l.value as 'zh' | 'en')}
                  className={`p-2 rounded-xl text-xs border transition-colors ${
                    tempLanguage === l.value 
                      ? 'bg-white text-black border-white' 
                      : 'bg-zinc-950 border-zinc-800 text-zinc-400 hover:bg-zinc-900'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2.5">
            <button 
              onClick={() => hasSave && navigate('/chat')}
              disabled={!hasSave}
              className={`flex items-center justify-center gap-2 p-3.5 rounded-xl transition-colors ${
                hasSave 
                  ? 'bg-white hover:bg-zinc-200 text-black' 
                  : 'bg-zinc-900/50 border border-zinc-800/50 text-zinc-600 cursor-not-allowed'
              }`}
            >
              <History className="w-5 h-5" />
              <span className="text-sm font-medium">继续游戏</span>
            </button>

            <label className="flex items-center justify-center gap-2 p-3.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl cursor-pointer transition-colors group">
              <Upload className="w-5 h-5 text-zinc-400 group-hover:text-white transition-colors" />
              <span className="text-sm font-medium">读取存档</span>
              <input type="file" accept=".json" onChange={handleFileUpload} className="hidden" />
            </label>

            <button 
              onClick={handleStartGame}
              className={`flex items-center justify-center gap-2 p-3.5 rounded-xl transition-colors ${
                !hasSave 
                  ? 'bg-white hover:bg-zinc-200 text-black' 
                  : 'bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-white'
              }`}
            >
              <Plus className="w-5 h-5" />
              <span className="text-sm font-medium">开始新游戏</span>
            </button>
          </div>
        </div>
      </motion.div>

      <AnimatePresence>
        {showNewGameConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-xl text-center space-y-5"
            >
              <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto" />
              <div>
                <h2 className="text-lg font-bold mb-2">覆盖存档确认</h2>
                <p className="text-zinc-400 text-sm leading-relaxed">
                  开始新游戏将覆盖当前存档，此操作不可撤销。确定要继续吗？
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setShowNewGameConfirm(false)}
                  className="p-3 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-colors text-sm font-medium"
                >
                  取消
                </button>
                <button
                  onClick={confirmStartNewGame}
                  className="p-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white transition-colors text-sm font-medium"
                >
                  确定开始
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showLanguageModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 max-w-sm w-full shadow-xl text-center space-y-6"
            >
              <Globe className="w-12 h-12 text-zinc-400 mx-auto" />
              <div>
                <h2 className="text-xl font-bold mb-2">选择语言 / Select Language</h2>
                <p className="text-zinc-400 text-sm">
                  此存档未包含语言设置。请选择 AI 回复的语言。<br/>
                  This save file does not contain a language setting. Please select the language for AI responses.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => handleLanguageSelectForSave('zh')}
                  className="p-4 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-colors"
                >
                  <div className="font-medium">中文</div>
                </button>
                <button
                  onClick={() => handleLanguageSelectForSave('en')}
                  className="p-4 rounded-xl border border-zinc-700 hover:bg-zinc-800 transition-colors"
                >
                  <div className="font-medium">English</div>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
