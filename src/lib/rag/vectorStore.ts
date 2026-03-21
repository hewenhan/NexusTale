/**
 * 基于 IndexedDB 的向量存储
 *
 * 设计要点（面向无限游戏时长）：
 * - 启动时从 IDB 加载全量向量到内存
 * - 写入时同步更新内存 + 异步刷盘 IDB
 * - 检索时纯内存暴力余弦相似度搜索
 * - 当文档量超过阈值时，可选接入 Voy HNSW 加速
 *
 * 内存管理：
 * - 5K 文档：~7.5MB 内存（无压力）
 * - 25K 文档：~37MB 内存（可接受）
 * - 50K+ 文档：考虑仅加载最近 N 条到内存，远期文档走 IDB 按需查
 */
import type { RagDocument, RagResult, SaveFingerprint } from './types';

const STORE_NAME = 'documents';
const META_STORE = 'meta';
const IDB_VERSION = 1;

// 余弦相似度 — 纯内存计算
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export class VectorStore {
  private documents = new Map<string, RagDocument>();
  private db: IDBDatabase | null = null;

  /** 初始化：打开/创建 IndexedDB，加载已有向量到内存 */
  async initialize(dbName: string): Promise<void> {
    try {
      this.db = await this.openDB(dbName);
      await this.loadAll();
    } catch {
      // IDB 不可用 → 纯内存模式
      this.db = null;
    }
  }

  private openDB(dbName: string): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, IDB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private async loadAll(): Promise<void> {
    if (!this.db) return;
    return new Promise((resolve, reject) => {
      const tx = this.db!.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        const rows = request.result as any[];
        for (const row of rows) {
          this.documents.set(row.id, {
            ...row,
            embedding: new Float32Array(row.embedding),
          });
        }
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  /** 批量写入文档（去重：已存在的 id 跳过） */
  async upsert(docs: RagDocument[]): Promise<void> {
    const newDocs = docs.filter(d => !this.documents.has(d.id));
    if (newDocs.length === 0) return;

    // 内存写入
    for (const doc of newDocs) {
      this.documents.set(doc.id, doc);
    }

    // IDB 异步刷盘
    if (this.db) {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const doc of newDocs) {
          store.put({
            ...doc,
            // Float32Array → 普通数组以便 IDB 序列化
            embedding: Array.from(doc.embedding),
          });
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        // IDB 写入失败 — 静默忽略，下次重试
      }
    }
  }

  /** 语义检索 top-K（暴力余弦相似度） */
  search(queryEmbedding: Float32Array, topK: number, threshold: number): RagResult[] {
    const results: RagResult[] = [];
    for (const doc of this.documents.values()) {
      const score = cosineSimilarity(queryEmbedding, doc.embedding);
      if (score >= threshold) {
        results.push({ document: doc, score });
      }
    }
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, topK);
  }

  /** 清空（新游戏时调用） */
  async clear(): Promise<void> {
    this.documents.clear();
    if (this.db) {
      try {
        const tx = this.db.transaction([STORE_NAME, META_STORE], 'readwrite');
        tx.objectStore(STORE_NAME).clear();
        tx.objectStore(META_STORE).clear();
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        // 静默
      }
    }
  }

  /** 删除 turnIndex >= threshold 的所有文档（SL 回档时裁剪） */
  async removeFrom(turnIndexThreshold: number): Promise<void> {
    const toRemove: string[] = [];
    for (const [id, doc] of this.documents) {
      if (doc.metadata.turnIndex >= turnIndexThreshold) {
        toRemove.push(id);
      }
    }
    for (const id of toRemove) {
      this.documents.delete(id);
    }

    if (this.db && toRemove.length > 0) {
      try {
        const tx = this.db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const id of toRemove) {
          store.delete(id);
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        // 静默
      }
    }
  }

  /** 获取所有文档文本（供 BM25 检索用） */
  getAllTexts(): { id: string; text: string; turnIndex: number }[] {
    return Array.from(this.documents.values()).map(d => ({
      id: d.id,
      text: d.text,
      turnIndex: d.metadata.turnIndex,
    }));
  }

  /** 按 ID 获取单个文档 */
  getDocument(id: string): RagDocument | undefined {
    return this.documents.get(id);
  }

  /** 已存储文档数量 */
  get size(): number {
    return this.documents.size;
  }

  // ── IDB meta 表操作 ──

  /** 读取存档指纹 + lastIngestedIndex */
  async getMeta(): Promise<{ fingerprint: SaveFingerprint | null; lastIngestedIndex: number }> {
    if (!this.db) return { fingerprint: null, lastIngestedIndex: 0 };
    return new Promise((resolve) => {
      const tx = this.db!.transaction(META_STORE, 'readonly');
      const store = tx.objectStore(META_STORE);
      const fpReq = store.get('fingerprint');
      const idxReq = store.get('lastIngestedIndex');
      tx.oncomplete = () => {
        resolve({
          fingerprint: fpReq.result ?? null,
          lastIngestedIndex: idxReq.result ?? 0,
        });
      };
      tx.onerror = () => resolve({ fingerprint: null, lastIngestedIndex: 0 });
    });
  }

  /** 写入存档指纹 + lastIngestedIndex */
  async setMeta(fingerprint: SaveFingerprint, lastIngestedIndex: number): Promise<void> {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(META_STORE, 'readwrite');
      const store = tx.objectStore(META_STORE);
      store.put(fingerprint, 'fingerprint');
      store.put(lastIngestedIndex, 'lastIngestedIndex');
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // 静默
    }
  }
}
