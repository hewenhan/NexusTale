/**
 * jsonRecovery — LLM JSON 修复逻辑（通用工具）
 *
 * 多级 JSON 解析策略：
 * 1. 清洗 markdown fence + trim
 * 2. JSON.parse
 * 3. 正则提取首个平衡的 {} 块
 * 4. 放弃
 */

export function cleanJsonText(raw: string): string {
  return raw.replace(/```json/g, '').replace(/```/g, '').trim();
}

export function parseJsonSafe<T = any>(raw: string): T | null {
  // Step 1: clean and try direct parse
  const cleaned = cleanJsonText(raw);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Step 2: try extracting first balanced {} block
    const start = cleaned.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < cleaned.length; i++) {
        if (cleaned[i] === '{') depth++;
        else if (cleaned[i] === '}') {
          depth--;
          if (depth === 0) { end = i; break; }
        }
      }
      if (end !== -1) {
        try {
          return JSON.parse(cleaned.slice(start, end + 1));
        } catch {
          // fall through
        }
      }
    }
    // Step 3: try brace regex as last resort
    const braceMatch = cleaned.match(/\{[^}]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        // give up
      }
    }
  }
  return null;
}
