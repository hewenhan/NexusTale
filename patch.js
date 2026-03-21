const fs = require('fs');
const content = fs.readFileSync('src/lib/rag/embeddingProvider.ts', 'utf-8');
const newContent = content
  .replace(/try\s*\{\s*this\.worker = new Worker\([\s\S]*?\)\s*\{\s*type: 'module'\s*\}\s*\);\s*this\.worker\.onmessage = \(e\) => this\.handleMessage\(e\);\s*this\.worker\.onerror = \(\) => \{\s*\/\/[^\n]*\n\s*this\.worker = null;\s*\};\s*return new Promise<boolean>\(\(resolve\) => \{[\s\S]*?\}\);\s*\}\s*catch\s*\{\s*return false;\s*\}/g, 
  `try {
      this.worker = new Worker(
        new URL('./embedding.worker.ts', import.meta.url),
        { type: 'module' },
      );
      this.worker.onmessage = (e) => this.handleMessage(e);
      this.worker.onerror = (err) => {
        console.error('[EmbeddingProvider] Web Worker 加载或运行期抛出严重异常:', err);
        // Worker 自身异常 — 标记不可用
        this.worker = null;
      };

      return new Promise<boolean>((resolve) => {
        const onReady = (e: MessageEvent) => {
          if (e.data.type === 'ready') {
            this.worker!.removeEventListener('message', onReady);
            console.log('[EmbeddingProvider] Web Worker 模型预加载(Warmup)完成, 状态就绪。');
            resolve(true);
          } else if (e.data.type === 'error' && !e.data.id) {
            this.worker!.removeEventListener('message', onReady);
            console.error('[EmbeddingProvider] Web Worker 在预加载阶段抛出错误，模型请求降级:', e.data.message);
            resolve(false);
          }
        };
        this.worker!.addEventListener('message', onReady);
        this.worker!.postMessage({ type: 'warmup' });
      });
    } catch (err) {
      console.error('[EmbeddingProvider] 创建 worker 时发生错误:', err);
      return false;
    }`)
    .replace(/const \{ type, id, embeddings, progress, loaded, total \} = e.data;/g, 
`const { type, id, embeddings, progress, loaded, total, message } = e.data;
    if (type === 'error') {
      console.error('[EmbeddingProvider] 收到 Worker 内部埋点错误返回 (类型:', type, ' ID:', id, ')，原因:', message);
    }`);
fs.writeFileSync('src/lib/rag/embeddingProvider.ts', newContent);
