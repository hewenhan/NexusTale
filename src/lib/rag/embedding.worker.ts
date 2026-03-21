/**
 * Web Worker：隔离 Transformers.js ONNX 推理线程
 *
 * 为什么用 Worker：
 * - WASM 模型加载和推理可能阻塞主线程 50-80ms/条
 * - 批量入库时更明显（3 条 × 70ms = 210ms 主线程冻结）
 * - Worker 隔离后主线程完全不受影响
 *
 * 通信协议：
 * - 主线程 postMessage({ type: 'embed', texts: string[], id: number })
 * - Worker 回复 { type: 'result', id: number, embeddings: number[][] }
 * - Worker 回复 { type: 'error', id: number, message: string }
 * - 主线程 postMessage({ type: 'warmup' }) → 预加载模型
 * - Worker 回复 { type: 'ready' } 或 { type: 'error', message: string }
 */
import { pipeline } from '@huggingface/transformers';

let extractor: any = null;

async function getExtractor() {
  if (!extractor) {
    extractor = await pipeline(
      'feature-extraction',
      'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
      {
        dtype: 'q8',
        progress_callback: (progress: any) => {
          if (progress.status === 'progress' && typeof progress.progress === 'number') {
            self.postMessage({
              type: 'download-progress',
              progress: progress.progress / 100,
              loaded: progress.loaded,
              total: progress.total,
            });
          }
        },
      },
    );
  }
  return extractor;
}

self.onmessage = async (e) => {
  const { type, texts, id } = e.data;

  if (type === 'warmup') {
    try {
      await getExtractor();
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', message: err.message });
    }
    return;
  }

  if (type === 'embed') {
    try {
      const ext = await getExtractor();
      const output = await ext(texts, { pooling: 'mean', normalize: true });
      self.postMessage({ type: 'result', id, embeddings: output.tolist() });
    } catch (err: any) {
      self.postMessage({ type: 'error', id, message: err.message });
    }
  }
};
