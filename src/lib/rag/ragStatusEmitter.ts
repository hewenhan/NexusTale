/**
 * 轻量发布/订阅：ragService 内部更新状态 → UI 组件订阅渲染
 * 不引入额外状态库，保持 RAG 模块独立性
 */
import type { RagStatus } from './ragStatus';

type Listener = (status: RagStatus) => void;

class RagStatusEmitter {
  private listeners = new Set<Listener>();
  private current: RagStatus = {
    phase: 'idle',
    progress: 0,
    progressText: '',
    indexedCount: 0,
    totalCount: 0,
    modelCached: false,
  };

  /** ragService 内部调用 */
  emit(partial: Partial<RagStatus>): void {
    Object.assign(this.current, partial);
    this.listeners.forEach(fn => fn({ ...this.current }));
  }

  /** UI 组件订阅 */
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    fn({ ...this.current });
    return () => this.listeners.delete(fn);
  };

  get snapshot(): RagStatus { return { ...this.current }; }
}

export const ragStatusEmitter = new RagStatusEmitter();
