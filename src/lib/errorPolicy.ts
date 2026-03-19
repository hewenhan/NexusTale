/**
 * errorPolicy — 统一错误处理策略
 *
 * 4 个等级：
 * - critical: showRetry + 阻塞（世界初始化、LLM 回合调用）
 * - retryable: showRetry + 非阻塞（地图/头像生成）
 * - degraded: console.warn + fallback 值（装备预设、自定义 loading messages）
 * - silent: console.error（非关键 UI 装饰）
 */

export type ErrorLevel = 'critical' | 'retryable' | 'degraded' | 'silent';

export interface HandleErrorOptions {
  retry?: () => Promise<void>;
  showRetry?: (title: string, message: string, retryFn: () => Promise<void>) => Promise<boolean>;
}

export function handleError(
  level: ErrorLevel,
  label: string,
  error: unknown,
  options?: HandleErrorOptions,
): void {
  const msg = error instanceof Error ? error.message : String(error);

  switch (level) {
    case 'critical':
      console.error(`[CRITICAL] ${label}:`, error);
      if (options?.showRetry && options.retry) {
        options.showRetry(label, msg, options.retry);
      }
      break;
    case 'retryable':
      console.warn(`[RETRYABLE] ${label}:`, error);
      if (options?.showRetry && options.retry) {
        options.showRetry(label, msg, options.retry);
      }
      break;
    case 'degraded':
      console.warn(`[DEGRADED] ${label}: ${msg}`);
      break;
    case 'silent':
      console.error(`[SILENT] ${label}:`, error);
      break;
  }
}
