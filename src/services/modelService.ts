/**
 * 统一模型调用服务
 * 所有 AI 模型交互都通过此服务进行，根据 MODEL_CONFIG 路由到对应的供应商
 */

import { ai, SAFETY_SETTINGS_OFF, NOVELTY_CONFIG } from '../lib/gemini';
import { MODEL_CONFIG, type ModelRole } from '../types/modelConfig';

// ─── 公共类型 ───

export interface ImageResult {
  base64?: string;
  prohibited?: boolean;
}

interface TextOptions {
  jsonMode?: boolean;
  novelty?: boolean;
}

interface ImageOptions {
  aspectRatio?: string;
  size?: string;
}

// ─── Gemini 调用 ───

async function geminiText(model: string, prompt: string, opts?: TextOptions): Promise<string | undefined> {
  const result = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      safetySettings: SAFETY_SETTINGS_OFF,
      ...(opts?.jsonMode ? { responseMimeType: 'application/json' } : {}),
      ...(opts?.novelty ? NOVELTY_CONFIG : {}),
    },
  });
  return result.text ?? undefined;
}

async function geminiImage(model: string, prompt: string, opts?: ImageOptions): Promise<ImageResult> {
  const result = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      imageConfig: {
        aspectRatio: opts?.aspectRatio || '1:1',
        imageSize: opts?.size || '512px',
      },
      safetySettings: SAFETY_SETTINGS_OFF,
    },
  });

  const finishReason = result.candidates?.[0]?.finishReason;
  if (finishReason === 'PROHIBITED_CONTENT') {
    console.error('Gemini image blocked: PROHIBITED_CONTENT', result.candidates?.[0]?.finishMessage);
    return { prohibited: true };
  }

  for (const part of result.candidates?.[0]?.content?.parts || []) {
    if (part.inlineData) {
      return { base64: part.inlineData.data };
    }
  }
  return {};
}

// ─── Grok 调用 ───

async function grokImage(model: string, prompt: string, _opts?: ImageOptions): Promise<ImageResult> {
  try {
    const response = await fetch('/api/grok/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        aspectRatio: _opts?.aspectRatio,
        size: _opts?.size,
      }),
    });
    if (!response.ok) {
      console.error(`Grok image proxy error (${response.status})`);
      return {};
    }
    const json = await response.json();
    if (json.prohibited) return { prohibited: true };
    if (json.base64) return { base64: json.base64 };
    return {};
  } catch (e: any) {
    console.error('Grok image generation failed:', e);
    return {};
  }
}

// ─── 统一入口 ───

/**
 * 文本生成（支持 JSON 模式和高创意模式）
 * 当前仅支持 Gemini 供应商
 */
export async function generateText(
  role: ModelRole,
  prompt: string,
  opts?: TextOptions,
): Promise<string | undefined> {
  const route = MODEL_CONFIG[role];
  switch (route.provider) {
    case 'gemini':
      return geminiText(route.model, prompt, opts);
    default:
      throw new Error(`Text generation not supported for provider: ${route.provider}`);
  }
}

/**
 * 图像生成（根据配置路由到 Gemini 或 Grok）
 */
export async function generateImage(
  role: ModelRole,
  prompt: string,
  opts?: ImageOptions,
): Promise<ImageResult> {
  const route = MODEL_CONFIG[role];
  switch (route.provider) {
    case 'gemini':
      return geminiImage(route.model, prompt, opts);
    case 'grok':
      return grokImage(route.model, prompt, opts);
    default:
      throw new Error(`Image generation not supported for provider: ${route.provider}`);
  }
}
