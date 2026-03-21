/**
 * Step 015: RAG 语义检索
 *
 * 在摘要维护之后、意图提取之前执行。
 * 用 userInput 作为 query，从向量库中召回 top-K 相关历史片段，
 * 格式化后写入 ctx.ragContext，供 ⑪ stepLlmCall 读取。
 *
 * 完全容错：ragService 未就绪或检索失败时 ragContext 保持空字符串。
 */
import type { TurnContext } from './types';
import { ragService } from '../../lib/rag';

export async function stepRagRetrieve(ctx: TurnContext): Promise<void> {
  try {
    console.log('[Turn Step 015] Retrieving RAG Context for query:', ctx.userInput);
    ctx.ragContext = await ragService.query(
      ctx.userInput,
      ctx.deps.state.history,
      ctx.deps.state.worldData,
    );
    if (ctx.ragContext) {
      console.log('[Turn Step 015] RAG Context injected successfully');
    }
  } catch (err) {
    console.warn('[Turn Step 015] RAG Retrieval failed:', err);
    // RAG 异常不中断回合
    ctx.ragContext = '';
  }
}
