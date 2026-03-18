/**
 * AI 模型路由配置
 * 通过修改 MODEL_CONFIG 即可实现不同功能使用不同模型供应商
 */

export type ModelProvider = 'gemini' | 'grok';

/** 模型角色：每个角色对应一种功能场景 */
export type ModelRole =
  | 'text'       // 通用文本生成 (叙事、摘要、loading messages 等)
  | 'pro'        // 复杂任务 (世界观初始化、角色设计)
  | 'lite'       // 快速分类 (意图识别)
  | 'image'      // 场景图生成
  | 'portrait'   // 角色肖像生成
  | 'map';       // 世界地图生成

export interface ModelRoute {
  provider: ModelProvider;
  model: string;
}

/**
 * 默认模型配置表
 * 修改某个 role 的 provider/model 即可切换该功能的模型
 * 例如：将 image 改为 { provider: 'grok', model: 'grok-imagine-image' }
 */
export const MODEL_CONFIG: Record<ModelRole, ModelRoute> = {
  text:     { provider: 'gemini', model: 'gemini-3-flash-preview' },
  pro:      { provider: 'gemini', model: 'gemini-3.1-pro-preview' },
  // lite:     { provider: 'gemini', model: 'gemini-2.5-flash-lite-preview-09-2025' },
  lite:     { provider: 'gemini', model: 'gemini-3.1-flash-lite-preview' },
  image:    { provider: 'grok', model: 'grok-imagine-image' },
  portrait: { provider: 'grok', model: 'grok-imagine-image' },
  map:      { provider: 'gemini', model: 'gemini-3-pro-image-preview' },
};

/** 获取指定角色当前使用的模型名称 */
export function getModelName(role: ModelRole): string {
  return MODEL_CONFIG[role].model;
}

/** 获取指定角色当前使用的供应商 */
export function getModelProvider(role: ModelRole): ModelProvider {
  return MODEL_CONFIG[role].provider;
}
