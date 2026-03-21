/** RAG 系统运行状态 */
export type RagPhase =
  | 'idle'              // 尚未初始化
  | 'downloading'       // 首次下载 ONNX 模型（~120MB）
  | 'loading-model'     // 从 Cache Storage 加载模型到 WASM
  | 'rebuilding'        // 存档切换/迁移，后台全量重建索引
  | 'ready'             // 正常就绪，增量运行中
  | 'degraded'          // 降级到 BM25（Embedding 不可用）
  | 'error';            // 严重错误（IDB 不可用等）

export interface RagStatus {
  phase: RagPhase;
  /** 当前阶段进度 0-1（仅 downloading / rebuilding 有意义） */
  progress: number;
  /** 进度说明文本 */
  progressText: string;
  /** 向量库已索引文档数 */
  indexedCount: number;
  /** 当前存档总文档数（需索引） */
  totalCount: number;
  /** 模型是否已缓存（非首次） */
  modelCached: boolean;
  /** 降级原因（degraded/error 时） */
  degradeReason?: string;
}
