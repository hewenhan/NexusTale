import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Initialize Gemini API
// Note: We use the server-side key for text generation if possible, but for client-side app logic 
// without a proxy, we use the injected process.env.GEMINI_API_KEY.
// The prompt instructions say "Always call Gemini API from the frontend code".
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// Models
export const TEXT_MODEL = "gemini-3-flash-preview";
export const PRO_MODEL = "gemini-3.1-pro-preview";
export const PRO_IMAGE_MODEL = "gemini-3-pro-image-preview";
export const IMAGE_MODEL = "gemini-3.1-flash-image-preview";
export const LITE_MODEL = "gemini-2.5-flash-lite-preview-09-2025";

// Shared safety settings — turn off all content filters for the RPG adventure engine
export const SAFETY_SETTINGS_OFF = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.OFF },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.OFF },
];

export const NOVELTY_CONFIG = {
    temperature: 0.85, 
    topP: 0.9,
    topK: 60
};