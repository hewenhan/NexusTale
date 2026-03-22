import type { TurnContext } from './types';
import { translatePinyinInput } from '../../services/pinyinTranslateService';

/**
 * Step 018: 输入预处理
 * 当用户开启拼音辅助时，调用 LITE 模型将拼音翻译为语境化中文。
 */
export async function stepInputPreprocess(ctx: TurnContext): Promise<void> {
  const { deps: { state } } = ctx;

  // 功能未开启，直接跳过
  if (!state.pinyinAssist) return;

  // 保存原始输入（调试追溯用）
  ctx.rawUserInput = ctx.userInput;

  const translated = await translatePinyinInput(ctx.userInput, state);

  if (translated !== ctx.userInput) {
    console.log(`[PinyinAssist] "${ctx.userInput}" → "${translated}"`);
    ctx.userInput = translated;
    
    // 同步篡改已写入聊天记录的最新用户输入，使得面板直接显示翻译后的中文
    ctx.deps.updateState(prev => {
      const newHistory = [...prev.history];
      for (let i = newHistory.length - 1; i >= 0; i--) {
        if (newHistory[i].role === 'user') {
          newHistory[i] = { ...newHistory[i], text: translated };
          break;
        }
      }
      return { history: newHistory };
    });

    // 覆盖当前回合管线内的 state 引用，防止同回合内后续步骤读到旧的拼音历史
    const newHistory = [...ctx.deps.state.history];
    for (let i = newHistory.length - 1; i >= 0; i--) {
      if (newHistory[i].role === 'user') {
        newHistory[i] = { ...newHistory[i], text: translated };
        break;
      }
    }
    ctx.deps.state = { ...ctx.deps.state, history: newHistory };
  }
}
