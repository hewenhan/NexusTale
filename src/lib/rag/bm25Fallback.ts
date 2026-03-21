/**
 * BM25 关键词匹配检索（混合检索模式下与向量检索并行）
 * - 中文：unigram + bigram（双字滑窗，大幅提升短语召回）
 * - 英文：按空格分词
 * - 零外部依赖，纯字符串处理
 */

const K1 = 1.5;
const B = 0.75;

function isCJK(code: number): boolean {
  return (
    (code >= 0x4E00 && code <= 0x9FFF) ||
    (code >= 0x3040 && code <= 0x30FF) ||
    (code >= 0xAC00 && code <= 0xD7AF)
  );
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  const wordRegex = /[a-zA-Z]+/g;
  let match;
  while ((match = wordRegex.exec(text)) !== null) {
    tokens.push(match[0].toLowerCase());
  }
  // CJK: unigram + bigram
  const cjk: string[] = [];
  for (const ch of text) {
    if (isCJK(ch.codePointAt(0)!)) {
      cjk.push(ch);
    } else if (cjk.length > 0) {
      flushCJK(cjk, tokens);
      cjk.length = 0;
    }
  }
  if (cjk.length > 0) flushCJK(cjk, tokens);
  return tokens;
}

function flushCJK(chars: string[], out: string[]): void {
  for (let i = 0; i < chars.length; i++) {
    out.push(chars[i]);
    if (i + 1 < chars.length) out.push(chars[i] + chars[i + 1]);
  }
}

export function bm25Search(
  query: string,
  documents: { id: string; text: string }[],
  topK: number,
): { id: string; score: number }[] {
  if (documents.length === 0) return [];

  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  // 文档预处理
  const docTokens = documents.map(d => tokenize(d.text));
  const avgDl = docTokens.reduce((sum, t) => sum + t.length, 0) / docTokens.length;
  const N = documents.length;

  // IDF 计算
  const df = new Map<string, number>();
  for (const tokens of docTokens) {
    const seen = new Set(tokens);
    for (const t of seen) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  const results: { id: string; score: number }[] = [];

  for (let i = 0; i < documents.length; i++) {
    const tokens = docTokens[i];
    const dl = tokens.length;

    // 词频
    const tf = new Map<string, number>();
    for (const t of tokens) {
      tf.set(t, (tf.get(t) || 0) + 1);
    }

    let score = 0;
    for (const qt of queryTokens) {
      const n = df.get(qt) || 0;
      const idf = Math.log((N - n + 0.5) / (n + 0.5) + 1);
      const freq = tf.get(qt) || 0;
      score += idf * (freq * (K1 + 1)) / (freq + K1 * (1 - B + B * dl / avgDl));
    }

    if (score > 0) {
      results.push({ id: documents[i].id, score });
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, topK);
}
