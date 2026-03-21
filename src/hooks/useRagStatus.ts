import { useSyncExternalStore } from 'react';
import { ragStatusEmitter } from '../lib/rag/ragStatusEmitter';
import type { RagStatus } from '../lib/rag/ragStatus';

/**
 * 订阅 RAG 状态变化，与 React 18+ 并发模式兼容
 * useSyncExternalStore 保证无 tearing
 */
export function useRagStatus(): RagStatus {
  return useSyncExternalStore(
    ragStatusEmitter.subscribe,
    () => ragStatusEmitter.snapshot,
  );
}
