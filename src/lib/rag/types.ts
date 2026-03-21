/** 向量存储中的单条文档 */
export interface RagDocument {
  id: string;                          // 对应 ChatMessage.id（合并文档使用首条 id）
  text: string;                        // 原始文本（合并后的完整文本）
  embedding: Float32Array;             // 384 维向量（多语言模型）
  metadata: {
    role: 'user' | 'model' | 'narrator';
    nodeId?: string;                   // 所在地图节点
    houseId?: string | null;
    tensionLevel?: number;             // 紧张度
    timestamp: number;
    turnIndex: number;                 // history 中的索引位置
  };
}

/** 检索结果 */
export interface RagResult {
  document: RagDocument;
  score: number;                       // 余弦相似度 0-1
}

/** 存档指纹：用于检测当前存档是否与 RAG 索引匹配 */
export interface SaveFingerprint {
  firstMessageId: string;              // history[0].id — 每局游戏唯一
  firstMessageTs: number;              // history[0].timestamp — 双重校验
}

/** RAG 服务配置 */
export interface RagConfig {
  topK: number;                        // 返回条数，默认 5
  scoreThreshold: number;              // 最低相似度阈值，默认 0.3
  modelId: string;                     // 默认 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
  dbName: string;                      // IndexedDB 数据库名
}
