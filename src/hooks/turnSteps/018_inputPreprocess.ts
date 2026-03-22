import type { TurnContext } from './types';

/**
 * Step 018: 输入预处理（标记层）
 *
 * 实际翻译已在 useChatLogic.handleTurn 中完成（addMessage 之前），
 * 此步骤仅记录 rawUserInput 供调试追溯。
 */
export async function stepInputPreprocess(ctx: TurnContext): Promise<void> {
  // 拼音翻译已在 handleTurn 中提前完成，此处仅做调试标记
  if (ctx.deps.state.pinyinAssist) {
    ctx.rawUserInput = ctx.userInput;
  }
}
