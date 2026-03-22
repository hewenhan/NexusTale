import type { GameState } from '../types/game';
import { generateText } from './modelService';
import { formatRecentConversation } from './intentHelpers';

/**
 * 基于世界观上下文，将拼音/混合输入翻译为语境化中文。
 * 如果输入已经是中文，原样返回。
 */
export async function translatePinyinInput(
  userInput: string,
  state: GameState,
): Promise<string> {
  // 超短输入不处理
  if (userInput.trim().length < 2) return userInput;

  const prompt = buildPinyinTranslatePrompt(userInput, state);

  try {
    const result = await generateText('lite', prompt, { jsonMode: true });
    if (!result) return userInput;

    const parsed = JSON.parse(result);
    if (parsed.translated && typeof parsed.translated === 'string' && parsed.translated.trim()) {
      return parsed.translated.trim();
    }
    return userInput;
  } catch {
    return userInput; // 降级：保留原始输入
  }
}

function buildPinyinTranslatePrompt(userInput: string, state: GameState): string {
  const currentNode = state.worldData?.nodes.find(n => n.id === state.currentNodeId);
  const currentHouse = currentNode?.houses.find(h => h.id === state.currentHouseId);
  const companionName = state.companionProfile.name || '同伴';
  const playerName = state.playerProfile.name || '玩家';

  return `你是一个文本冒险游戏的输入预处理器。
你的唯一任务是：将玩家的拼音输入翻译成最合理的中文句子。

**规则：**
1. 如果输入已经是完整的中文，原样输出。
2. 如果输入是拼音（无声调的罗马拼音），根据下方语境翻译成最合理的中文。
3. 如果输入是中英/拼音混合，只翻译拼音部分，保留已有中文和英文。
4. 翻译必须尊重世界观语境 —— 同音字的选择应符合当前场景。
5. 不要添加、删除或改写玩家的原始意思，只做文字形式转换。
6. 不要输出任何解释，只输出翻译结果。
7. 翻译格式要求：说话（独白/场景描述），单纯的对话比如“我感到很高兴”，复合场景比如“操！（我大喊一声，挥刀冲上了去）你个王八蛋！（我边骂边挥刀乱砍，我真感觉我是个笨蛋）”

**当前语境：**
- 世界观：${state.worldview.slice(0, 200)}
- 当前位置：${currentNode?.name || '未知'}${currentHouse ? ` > ${currentHouse.name}` : ' (户外)'}
- 危机级别：${state.pacingState.tensionLevel} (0=和平, 4=极危)
- 玩家名：${playerName}
- 同伴名：${companionName}
- 同伴性格：${state.companionProfile.personality || '未知'}
- 近期对话：
${formatRecentConversation(state)}

**玩家输入：**
"${userInput}"

请只输出纯 JSON：
{ "translated": "<翻译后的中文，或原样返回>" }`;
}