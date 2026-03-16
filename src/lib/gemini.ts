import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

// Initialize Gemini API
export const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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