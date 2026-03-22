/**
 * RAG 服务门面 — 单例
 *
 * 提供两个核心 API：
 * - query(queryText, history, worldData): 混合检索（Vector + BM25 RRF），返回带上下文窗口的 ragContext
 * - ingest(history, worldData): 增量入库，自动指纹校验 + SL 回档裁剪
 *
 * 检索策略：
 * 1. 查询改写：剥离元问句壳（"还记得…吗"等），提取真实检索意图
 * 2. 混合检索：Vector + BM25 同时跑，RRF 融合排序
 * 3. 上下文窗口：命中文档向前后扩展 ±WINDOW 条消息，给 AI 完整场景
 * 4. 入库增强：文本前缀注入地点名，提升关键词可达性
 *
 * 整体原则：RAG 模块任何异常不中断回合管线
 */
import type { ChatMessage, WorldData } from '../../types/game';
import { KEEP_RECENT_TURNS } from '../../types/game';
import type { RagDocument, RagResult, SaveFingerprint } from './types';
import { VectorStore } from './vectorStore';
import { EmbeddingProvider } from './embeddingProvider';
import { chunkMessages } from './chunker';
import { bm25Search } from './bm25Fallback';
import { ragStatusEmitter } from './ragStatusEmitter';

const TOP_K = 3;                  // 最终返回条数（精而非多）
const SCORE_THRESHOLD = 0.15;     // 向量阈值放宽（RRF 兜底）
const BATCH_SIZE = 20;
const CONTEXT_WINDOW = 6;         // 命中文档前后各取 N 条消息
const MAX_CONTEXT_CHARS = 3000;   // ragContext 总字符预算
const RRF_K = 60;                 // RRF 平滑常数

class RagService {
  private store: VectorStore;
  private embedding: EmbeddingProvider | null = null;
  private ready: Promise<void> | null = null;
  private lastIngestedIndex = 0;
  private fingerprint: SaveFingerprint | null = null;
  private useEmbedding = true;
  private ingestLock: Promise<void> = Promise.resolve();
  private isMobileApple: boolean;

  constructor() {
    this.store = new VectorStore();
    // iOS / iPadOS 设备检测 — 跳过 ONNX，直接降级 BM25
    this.isMobileApple = /iPhone|iPod|iPad/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (this.isMobileApple) {
      this.useEmbedding = false;
    }
    // 不再在构造时初始化 — 延迟到首次 query/ingest 时按需拉起
  }

  private ensureInit(): Promise<void> {
    if (!this.ready) {
      this.ready = this.init();
    }
    return this.ready;
  }

  private async init(): Promise<void> {
    await this.store.initialize('rag_store');

    // 读取已有 meta
    const meta = await this.store.getMeta();
    this.fingerprint = meta.fingerprint;
    this.lastIngestedIndex = meta.lastIngestedIndex;

    // iOS 降级：跳过整个 embedding 预热
    if (this.isMobileApple) {
      console.warn('[RagService] iOS 设备检测到，跳过 ONNX 模型加载，使用 BM25 关键词检索。');
      ragStatusEmitter.emit({
        phase: 'degraded',
        degradeReason: '移动端记忆降级为关键词检索',
        indexedCount: this.store.size,
      });
      return;
    }

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

    // 按需创建 EmbeddingProvider
    this.embedding = new EmbeddingProvider();

    // 等待 embedding 就绪（Worker warmup）
    const embeddingOk = await this.embedding.embedQuery('test');
    if (embeddingOk === null) {
      console.error('[RagService] 模型加载失败，自动降级为 BM25 关键词检索。请检查网络环境或模型缓存状况。');
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
   * 混合检索（供 015_ragRetrieve step 调用）
   *
   * 1. 查询改写 → 剥离元问句壳
   * 2. Vector + BM25 并行 → RRF 融合
   * 3. 按 turnIndex 扩展上下文窗口
   * 4. 格式化输出（带地名）
   */
  async query(
    queryText: string,
    history: ChatMessage[],
    worldData: WorldData | null,
  ): Promise<string> {
    await this.ensureInit();

    if (this.store.size === 0) return '';

    const currentHistoryLength = history.length;
    // 排除最近 N 轮的 turnIndex 下界（每轮 ≈ 3-4 条消息）
    const recentCutoff = Math.max(0, currentHistoryLength - KEEP_RECENT_TURNS * 4);

    // ── 1. 查询改写 ──
    const cleaned = stripMetaQuestion(queryText);
    console.log(`[RAG Query] Original="${queryText.slice(0, 40)}" → Cleaned="${cleaned.slice(0, 40)}"`);

    // ── 2. 混合检索 ──
    const vectorHits: { id: string; score: number }[] = [];
    const bm25Hits: { id: string; score: number }[] = [];

    // Vector 检索
    if (this.useEmbedding && this.embedding) {
      const queryVec = await this.embedding.embedQuery(cleaned);
      if (queryVec) {
        const results = this.store.search(queryVec, TOP_K * 5, SCORE_THRESHOLD);
        for (const r of results) {
          if (r.document.metadata.turnIndex < recentCutoff) {
            vectorHits.push({ id: r.document.id, score: r.score });
          }
        }
      }
    }

    // BM25 检索（始终执行，不仅是降级）
    const allTexts = this.store.getAllTexts();
    const eligibleTexts = allTexts.filter(t => t.turnIndex < recentCutoff);
    const bm25Raw = bm25Search(cleaned, eligibleTexts, TOP_K * 5);
    bm25Hits.push(...bm25Raw);

    // ── 3. RRF 融合 ──
    const rrfScores = new Map<string, number>();
    vectorHits.forEach((h, rank) => {
      rrfScores.set(h.id, (rrfScores.get(h.id) || 0) + 1 / (RRF_K + rank + 1));
    });
    bm25Hits.forEach((h, rank) => {
      rrfScores.set(h.id, (rrfScores.get(h.id) || 0) + 1 / (RRF_K + rank + 1));
    });

    const merged = Array.from(rrfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOP_K);

    if (merged.length === 0) return '';

    // console.log(`[RAG Query] RRF merged top-${TOP_K}:`, merged.map(([id, s]) => `${id.slice(0, 8)}…=${s.toFixed(4)}`));
    // 打印每个命中文档文本前 30 字
    let consoleTextArr: string[] = [];
    merged.forEach(([id]) => {
      const doc = this.store.getDocument(id);
      if (doc) {
        consoleTextArr.push(doc.text.slice(0, 30));
      }
    });
    console.log(`[RAG Query] Merged hits sample texts:`, consoleTextArr);

    // ── 4. 上下文窗口扩展 ──
    // 从命中文档的 turnIndex 出发，在 history 中前后各取 CONTEXT_WINDOW 条
    const hitTurnIndices = new Set<number>();
    for (const [id] of merged) {
      const doc = this.store.getDocument(id);
      if (doc) hitTurnIndices.add(doc.metadata.turnIndex);
    }

    const nodeNameMap = buildNodeNameMap(worldData);
    const windows = expandContextWindows(
      Array.from(hitTurnIndices),
      history,
      recentCutoff,
      nodeNameMap,
    );

    console.log(`[RAG Query] Context windows: ${windows.length} segments, ${windows.reduce((n, w) => n + w.length, 0)} chars`);

    return windows.length > 0
      ? `=== 相关历史回忆 ===\n${windows.join('\n---\n')}\n===`
      : '';
  }

  /**
   * 增量入库（供 150_ragIngest step 调用）
   *
   * 自动指纹校验：
   * - 指纹匹配且 index 合法 → 差量入库
   * - 指纹不匹配（切存档）→ 清空 + 从 history[0] 全量重建
   * - SL 回档（lastIngestedIndex > history.length）→ 裁剪 + 差量
   */
  async ingest(history: ChatMessage[], worldData?: WorldData | null): Promise<void> {
    // 串行化：等待上一次 ingest 完成，防止并发 ONNX 推理崩溃
    const prev = this.ingestLock;
    let unlock: () => void;
    this.ingestLock = new Promise<void>(r => { unlock = r; });
    try {
      await prev;
    } catch { /* 忽略上一次的错误 */ }

    try {
      await this._ingestCore(history, worldData);
    } finally {
      unlock!();
    }
  }

  private async _ingestCore(history: ChatMessage[], worldData?: WorldData | null): Promise<void> {
    await this.ensureInit();

    if (history.length === 0) return;

    // 构建 nodeId → 地名映射
    const nodeNameMap = worldData ? buildNodeNameMap(worldData) : new Map<string, string>();

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
      await this._batchRebuild(history, nodeNameMap);
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
      const chunks = chunkMessages(history, this.lastIngestedIndex, nodeNameMap);
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
  private async _batchRebuild(history: ChatMessage[], nodeNameMap: Map<string, string>): Promise<void> {
    const allChunks = chunkMessages(history, 0, nodeNameMap);
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
    if (this.useEmbedding && this.embedding) {
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
    const zeroDim = this.embedding?.dimension ?? 384;
    const docs: RagDocument[] = chunks.map(c => ({
      ...c,
      embedding: new Float32Array(zeroDim),
    }));
    await this.store.upsert(docs);
  }

  /** 重置（新游戏时调用） */
  async reset(): Promise<void> {
    await this.ensureInit();
    await this.store.clear();
    this.lastIngestedIndex = 0;
    this.fingerprint = null;
    ragStatusEmitter.emit({ indexedCount: 0, totalCount: 0 });
  }
}

/** 单例导出 */
export const ragService = new RagService();

// ── 查询改写：剥离元问句壳 ──

const META_PATTERNS: RegExp[] = [
  /^.*?还记得/,
  /^.*?你记得/,
  /^.*?你忘了/,
  /^.*?想起来/,
  /^.*?回忆一下/,
  /你[还能]?记得吗[？?]?$/,
  /你忘了吗[？?]?$/,
  /[？?]$/,
  /^当时/,
  /的时候/g,
];

function stripMetaQuestion(query: string): string {
  let q = query.trim();
  for (const pat of META_PATTERNS) {
    q = q.replace(pat, '');
  }
  q = q.trim();
  // 如果剥壳后太短（可能剥过头），fallback 到原始 query
  return q.length >= 4 ? q : query.trim();
}

// ── nodeId → 地名映射 ──

function buildNodeNameMap(worldData: WorldData | null): Map<string, string> {
  const map = new Map<string, string>();
  if (!worldData) return map;
  for (const node of worldData.nodes) {
    map.set(node.id, node.name);
    for (const house of node.houses) {
      map.set(house.id, `${node.name}·${house.name}`);
    }
  }
  return map;
}

// ── 上下文窗口扩展 ──

function expandContextWindows(
  hitIndices: number[],
  history: ChatMessage[],
  recentCutoff: number,
  nodeNameMap: Map<string, string>,
): string[] {
  // 将命中点扩展为 [start, end] 范围，然后合并重叠区间
  const ranges: [number, number][] = hitIndices
    .map(idx => [
      Math.max(0, idx - CONTEXT_WINDOW),
      Math.min(recentCutoff - 1, idx + CONTEXT_WINDOW),
    ] as [number, number])
    .filter(([s, e]) => s <= e);

  if (ranges.length === 0) return [];

  // 合并重叠区间
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const last = merged[merged.length - 1];
    if (ranges[i][0] <= last[1] + 1) {
      last[1] = Math.max(last[1], ranges[i][1]);
    } else {
      merged.push(ranges[i]);
    }
  }

  // 从 history 中提取窗口文本，带 token 预算控制
  let totalChars = 0;
  const windows: string[] = [];

  for (const [start, end] of merged) {
    if (totalChars >= MAX_CONTEXT_CHARS) break;
    const lines: string[] = [];
    for (let i = start; i <= end && i < history.length; i++) {
      const msg = history[i];
      if (!msg.text || msg.text.length < 5) continue;
      const loc = msg.currentNodeId
        ? (nodeNameMap.get(msg.currentNodeId) ?? msg.currentNodeId)
        : '';
      const house = msg.currentHouseId
        ? (nodeNameMap.get(msg.currentHouseId) ?? '')
        : '';
      const place = house || loc;
      const prefix = msg.role === 'user' ? '[玩家]'
        : msg.role === 'model' ? `[${msg.npcName || 'AI'}]`
        : '[旁白]';
      const line = place
        ? `${prefix}(${place}) ${msg.text}`
        : `${prefix} ${msg.text}`;
      lines.push(line);
    }
    const window = `[第${start}-${end}轮]\n${lines.join('\n')}`;
    if (totalChars + window.length > MAX_CONTEXT_CHARS && windows.length > 0) break;
    totalChars += window.length;
    windows.push(window);
  }

  return windows;
}
