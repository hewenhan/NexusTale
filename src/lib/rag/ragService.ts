/**
 * RAG 服务门面 — 单例
 *
 * 提供两个核心 API：
 * - query(queryText, currentHistoryLength): 语义检索，返回格式化 ragContext
 * - ingest(history): 增量入库，自动指纹校验 + SL 回档裁剪
 *
 * 降级链：语义检索 → BM25 关键词 → 空 ragContext
 * 整体原则：RAG 模块任何异常不中断回合管线
 */
import type { ChatMessage } from '../../types/game';
import { KEEP_RECENT_TURNS } from '../../types/game';
import type { RagDocument, RagResult, SaveFingerprint } from './types';
import { VectorStore } from './vectorStore';
import { EmbeddingProvider } from './embeddingProvider';
import { chunkMessages } from './chunker';
import { bm25Search } from './bm25Fallback';
import { ragStatusEmitter } from './ragStatusEmitter';

const TOP_K = 5;
const SCORE_THRESHOLD = 0.3;
const BATCH_SIZE = 20;

class RagService {
  private store: VectorStore;
  private embedding: EmbeddingProvider;
  private ready: Promise<void>;
  private lastIngestedIndex = 0;
  private fingerprint: SaveFingerprint | null = null;
  private useEmbedding = true;

  constructor() {
    this.store = new VectorStore();
    this.embedding = new EmbeddingProvider();
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    await this.store.initialize('rag_store');

    // 读取已有 meta
    const meta = await this.store.getMeta();
    this.fingerprint = meta.fingerprint;
    this.lastIngestedIndex = meta.lastIngestedIndex;

    // 检查模型是否已缓存
    let modelCached = false;
    try {
      modelCached = await caches.has('transformers-cache');
    } catch {
      // caches API 不可用
    }

    ragStatusEmitter.emit({
      phase: modelCached ? 'loading-model' : 'downloading',
      modelCached,
      indexedCount: this.store.size,
      progressText: modelCached ? '加载模型中...' : '首次准备记忆系统...',
    });

    // 等待 embedding 就绪（Worker warmup）
    const embeddingOk = await this.embedding.embedQuery('test');
    if (embeddingOk === null) {
      this.useEmbedding = false;
      ragStatusEmitter.emit({
        phase: 'degraded',
        degradeReason: '模型加载失败，使用关键词检索',
      });
    } else {
      ragStatusEmitter.emit({
        phase: 'ready',
        progressText: '',
      });
    }
  }

  /**
   * 语义检索（供 015_ragRetrieve step 调用）
   *
   * 自动排除最近 KEEP_RECENT_TURNS 轮（这些已在 prompt history 中），
   * 避免重复注入。
   */
  async query(queryText: string, currentHistoryLength: number): Promise<string> {
    await this.ready;

    if (this.store.size === 0) return '';

    // 排除最近 N 轮的 turnIndex 下界
    const recentCutoff = Math.max(0, currentHistoryLength - KEEP_RECENT_TURNS * 8);

    if (this.useEmbedding) {
      console.log(`[RAG Query] Embedding Search query="${queryText.slice(0, 30)}..."`);
      const queryVec = await this.embedding.embedQuery(queryText);
      if (queryVec) {
        const results = this.store.search(queryVec, TOP_K + 5, SCORE_THRESHOLD);
        // 过滤掉最近轮的文档
        const filtered = results
          .filter(r => r.document.metadata.turnIndex < recentCutoff)
          .slice(0, TOP_K);
        console.log(`[RAG Query] Vector Results found=${filtered.length}`, filtered);
        return formatRagContext(filtered);
      }
    }

    // 降级到 BM25
    console.log(`[RAG Query] BM25 Fallback Search query="${queryText.slice(0, 30)}..."`);
    const allTexts = this.store.getAllTexts();
    const eligibleTexts = allTexts.filter(t => t.turnIndex < recentCutoff);
    const hits = bm25Search(queryText, eligibleTexts, TOP_K);
    console.log(`[RAG Query] BM25 Results found=${hits.length}`, hits);
    return formatBm25Context(hits, allTexts);
  }

  /**
   * 增量入库（供 150_ragIngest step 调用）
   *
   * 自动指纹校验：
   * - 指纹匹配且 index 合法 → 差量入库
   * - 指纹不匹配（切存档）→ 清空 + 从 history[0] 全量重建
   * - SL 回档（lastIngestedIndex > history.length）→ 裁剪 + 差量
   */
  async ingest(history: ChatMessage[]): Promise<void> {
    await this.ready;

    if (history.length === 0) return;

    // 计算当前存档指纹
    const currentFp: SaveFingerprint = {
      firstMessageId: history[0].id,
      firstMessageTs: history[0].timestamp,
    };

    // 指纹校验
    const fpMatch = this.fingerprint &&
      this.fingerprint.firstMessageId === currentFp.firstMessageId &&
      this.fingerprint.firstMessageTs === currentFp.firstMessageTs;

    console.log(`[RAG Ingest] Input size: ${history.length}, fpMatch: ${!!fpMatch}, lastIngestedIndex: ${this.lastIngestedIndex}`);

    if (!fpMatch) {
      // 不同存档 → 全量重建
      console.log(`[RAG Ingest] Started Full Rebuild...`);
      await this.store.clear();
      this.lastIngestedIndex = 0;
      this.fingerprint = currentFp;
      await this._batchRebuild(history);
      return;
    }

    // SL 回档检测
    if (this.lastIngestedIndex > history.length) {
      console.log(`[RAG Ingest] SL rewind detected: ${this.lastIngestedIndex} -> ${history.length}`);
      await this.store.removeFrom(history.length);
      this.lastIngestedIndex = history.length;
    }

    // 增量入库
    if (this.lastIngestedIndex < history.length) {
      const chunks = chunkMessages(history, this.lastIngestedIndex);
      console.log(`[RAG Ingest] Incremental update: ${chunks.length} new chunks`);
      if (chunks.length > 0) {
        await this._embedAndStore(chunks);
      }
      this.lastIngestedIndex = history.length;
      await this.store.setMeta(currentFp, this.lastIngestedIndex);
    }

    ragStatusEmitter.emit({ indexedCount: this.store.size });
  }

  /**
   * 全量重建：分批处理（每批 BATCH_SIZE 条），每批后更新进度
   */
  private async _batchRebuild(history: ChatMessage[]): Promise<void> {
    const allChunks = chunkMessages(history, 0);
    const total = allChunks.length;

    if (total === 0) return;

    ragStatusEmitter.emit({
      phase: 'rebuilding',
      progress: 0,
      totalCount: total,
      indexedCount: 0,
      progressText: `0/${total}`,
    });

    for (let i = 0; i < total; i += BATCH_SIZE) {
      const batch = allChunks.slice(i, i + BATCH_SIZE);
      await this._embedAndStore(batch);

      const done = Math.min(i + BATCH_SIZE, total);
      ragStatusEmitter.emit({
        progress: done / total,
        indexedCount: this.store.size,
        progressText: `${done}/${total}`,
      });
    }

    const fp: SaveFingerprint = {
      firstMessageId: history[0].id,
      firstMessageTs: history[0].timestamp,
    };
    this.lastIngestedIndex = history.length;
    await this.store.setMeta(fp, this.lastIngestedIndex);

    ragStatusEmitter.emit({
      phase: this.useEmbedding ? 'ready' : 'degraded',
      progress: 1,
      progressText: '',
    });
  }

  /** 嵌入 + 写入（增量/重建共享逻辑） */
  private async _embedAndStore(chunks: Omit<RagDocument, 'embedding'>[]): Promise<void> {
    if (this.useEmbedding) {
      const texts = chunks.map(c => c.text);
      const embeddings = await this.embedding.embedTexts(texts);
      if (embeddings) {
        const docs: RagDocument[] = chunks.map((c, i) => ({
          ...c,
          embedding: embeddings[i],
        }));
        await this.store.upsert(docs);
        return;
      }
      // embedding 失败 → 标记降级
      this.useEmbedding = false;
      ragStatusEmitter.emit({
        phase: 'degraded',
        degradeReason: 'Embedding 推理失败，使用关键词检索',
      });
    }

    // 降级模式：存储空 embedding（仅用于 BM25 文本检索）
    const zeroDim = this.embedding.dimension;
    const docs: RagDocument[] = chunks.map(c => ({
      ...c,
      embedding: new Float32Array(zeroDim),
    }));
    await this.store.upsert(docs);
  }

  /** 重置（新游戏时调用） */
  async reset(): Promise<void> {
    await this.ready;
    await this.store.clear();
    this.lastIngestedIndex = 0;
    this.fingerprint = null;
    ragStatusEmitter.emit({ indexedCount: 0, totalCount: 0 });
  }
}

/** 单例导出 */
export const ragService = new RagService();

// ── 格式化工具函数 ──

function formatRagContext(results: RagResult[]): string {
  if (results.length === 0) return '';
  const lines = results.map(r => {
    const m = r.document.metadata;
    const loc = m.nodeId ?? '未知';
    const t = m.tensionLevel !== undefined ? `T${m.tensionLevel}` : '';
    return `[第${m.turnIndex}轮 · ${loc} · ${t}] ${r.document.text}`;
  });
  return `=== 相关历史回忆 ===\n${lines.join('\n')}\n===`;
}

function formatBm25Context(
  hits: { id: string; score: number }[],
  allTexts: { id: string; text: string; turnIndex: number }[],
): string {
  if (hits.length === 0) return '';
  const textMap = new Map(allTexts.map(t => [t.id, t]));
  const lines = hits.map(h => {
    const doc = textMap.get(h.id);
    return doc ? `[第${doc.turnIndex}轮] ${doc.text}` : '';
  }).filter(Boolean);
  return `=== 相关历史回忆 ===\n${lines.join('\n')}\n===`;
}
