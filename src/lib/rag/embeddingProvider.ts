/**
 * 本地 Embedding 封装
 *
 * - 通过 Web Worker 调用 Transformers.js，不阻塞主线程
 * - 模型首次加载后缓存于浏览器 Cache Storage（~120MB 一次性下载）
 * - 批量请求自动排队（Worker 单线程串行）
 * - 失败返回 null，触发上层 BM25 降级
 */
import { ragStatusEmitter } from './ragStatusEmitter';

const DIMENSION = 384;

export class EmbeddingProvider {
  private worker: Worker | null = null;
  private ready: Promise<boolean>;
  private requestId = 0;
  private pending = new Map<number, {
    resolve: (v: Float32Array[] | null) => void;
  }>();

  constructor() {
    this.ready = this.init();
  }

  private async init(): Promise<boolean> {
    try {
      this.worker = new Worker(
        new URL('./embedding.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (e) => this.handleMessage(e);
      this.worker.onerror = () => {
        // Worker 自身异常 — 标记不可用
        this.worker = null;
      };

      return new Promise<boolean>((resolve) => {
        const onReady = (e: MessageEvent) => {
          if (e.data.type === 'ready') {
            this.worker!.removeEventListener('message', onReady);
            resolve(true);
          } else if (e.data.type === 'error' && !e.data.id) {
            this.worker!.removeEventListener('message', onReady);
            resolve(false);
          }
        };
        this.worker!.addEventListener('message', onReady);
        this.worker!.postMessage({ type: 'warmup' });
      });
    } catch {
      return false;
    }
  }

  private handleMessage(e: MessageEvent): void {
    const { type, id, embeddings, progress, loaded, total } = e.data;

    // 模型下载进度转发给 UI
    if (type === 'download-progress') {
      ragStatusEmitter.emit({
        phase: 'downloading',
        progress: progress ?? 0,
        progressText: loaded && total
          ? `${Math.round(loaded / 1024 / 1024)}MB / ${Math.round(total / 1024 / 1024)}MB`
          : '',
      });
      return;
    }

    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);

    if (type === 'result') {
      pending.resolve(embeddings.map((arr: number[]) => new Float32Array(arr)));
    } else {
      pending.resolve(null);
    }
  }

  /** 批量嵌入 */
  async embedTexts(texts: string[]): Promise<Float32Array[] | null> {
    const ok = await this.ready;
    if (!ok || !this.worker) return null;
    const id = ++this.requestId;
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.worker!.postMessage({ type: 'embed', texts, id });
    });
  }

  /** 单条嵌入（检索 query） */
  async embedQuery(text: string): Promise<Float32Array | null> {
    const result = await this.embedTexts([text]);
    return result ? result[0] : null;
  }

  get dimension(): number { return DIMENSION; }
}
