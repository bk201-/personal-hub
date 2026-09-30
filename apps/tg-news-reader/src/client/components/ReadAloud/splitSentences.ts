/**
 * Splits arbitrary text (plain or markdown) into sentence-sized chunks suitable for
 * sequential playback via the Web Speech API. Pure function — no DOM access.
 *
 * Strategy:
 *  1. Strip markdown noise (links → label, code fences/inline code, emphasis chars)
 *  2. Split into paragraphs on one-or-more newlines
 *  3. Inside each paragraph, split on sentence-ending punctuation (`.!?…`)
 *     keeping the punctuation with the sentence
 *  4. Trim and drop empties
 *  5. Fallback: if no punctuation at all, return the whole trimmed text as one sentence
 */
export function splitSentences(text: string): string[] {
  if (!text || !text.trim()) return [];

  const cleaned = text
    // ![alt](url) and [text](url) → keep visible label
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    // fenced code blocks
    .replace(/```[\s\S]*?```/g, ' ')
    // inline `code`
    .replace(/`([^`]+)`/g, '$1')
    // markdown punctuation that would otherwise be pronounced
    .replace(/[*_~#>|]/g, '');

  const sentences: string[] = [];
  // Sentence regex: greedy run of non-terminator chars, optionally ended by one+ terminators
  const sentenceRe = /[^.!?…]+(?:[.!?…]+|$)/g;

  for (const para of cleaned.split(/\n+/)) {
    const trimmedPara = para.trim();
    if (!trimmedPara) continue;

    const matches = trimmedPara.match(sentenceRe);
    if (matches && matches.length > 0) {
      for (const s of matches) {
        const t = s.trim();
        if (t) sentences.push(t);
      }
    } else {
      sentences.push(trimmedPara);
    }
  }

  return sentences;
}
