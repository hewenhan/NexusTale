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
    const nextPhase = partial.phase !== undefined ? partial.phase : this.current.phase;
    const nextProgress = partial.progress !== undefined ? partial.progress : this.current.progress;
    const nextProgressText = partial.progressText !== undefined ? partial.progressText : this.current.progressText;
    const nextIndexedCount = partial.indexedCount !== undefined ? partial.indexedCount : this.current.indexedCount;
    const nextTotalCount = partial.totalCount !== undefined ? partial.totalCount : this.current.totalCount;
    const nextModelCached = partial.modelCached !== undefined ? partial.modelCached : this.current.modelCached;

    if (
        nextPhase === this.current.phase &&
        nextProgress === this.current.progress &&
        nextProgressText === this.current.progressText &&
        nextIndexedCount === this.current.indexedCount &&
        nextTotalCount === this.current.totalCount &&
        nextModelCached === this.current.modelCached
    ) {
        return; // No actual changes
    }
  
    this.current = {
        phase: nextPhase,
        progress: nextProgress,
        progressText: nextProgressText,
        indexedCount: nextIndexedCount,
        totalCount: nextTotalCount,
        modelCached: nextModelCached,
    };
    this.listeners.forEach(fn => fn(this.current));
  }

  /** UI 组件订阅 */
  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  get snapshot(): RagStatus { return this.current; }
}

export const ragStatusEmitter = new RagStatusEmitter();
