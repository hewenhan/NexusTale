/**
 * Step 150: RAG 增量入库
 *
 * 在 ⑭ stepBagAndCeremony 之后执行（回合最末尾）。
 * 将本轮新产生的消息（用户输入 + AI 回复）嵌入并写入向量库。
 * 异步执行，不阻塞回合结束。
 */
import type { TurnContext } from './types';
import { ragService } from '../../lib/rag';

export async function stepRagIngest(ctx: TurnContext): Promise<void> {
  // fire-and-forget：不 await，不阻塞回合完成
  ragService.ingest(ctx.deps.state.history).catch(() => {});
}
