import { createHash } from 'crypto';

/**
 * Returns the SHA-256 hex digest of the cache key components.
 * Identical text + voice + model always maps to the same hash → free dedup.
 */
export function computeTtsHash(text: string, voice: string, model: string): string {
  return createHash('sha256').update(`${text}|${voice}|${model}`).digest('hex');
}

/**
 * Splits text into chunks of at most `maxChunkSize` characters, preferring sentence
 * boundaries (`.!?…`) and falling back to whitespace if a single sentence is too long.
 *
 * Used to keep each TTS request under the OpenAI `audio.speech.create` limit (4096 chars).
 *
 * Guarantees:
 *  - Every chunk is `<= maxChunkSize` characters
 *  - No chunk is empty
 *  - Concatenating all chunks reproduces the input modulo whitespace normalisation
 */
export function chunkTextForTts(text: string, maxChunkSize: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChunkSize) return [trimmed];

  // First split into sentence-sized atoms; longer-than-limit "sentences" get a second
  // pass of word-level splitting below.
  const sentenceRe = /[^.!?…]+[.!?…]+|[^.!?…]+$/g;
  const sentences = trimmed
    .match(sentenceRe)
    ?.map((s) => s.trim())
    .filter(Boolean) ?? [trimmed];

  const atoms: string[] = [];
  for (const s of sentences) {
    if (s.length <= maxChunkSize) {
      atoms.push(s);
      continue;
    }
    // Sentence longer than the cap (rare — very long paragraph without punctuation).
    // Fall back to greedy word packing.
    const words = s.split(/(\s+)/); // keep separators so we don't lose spacing
    let current = '';
    for (const w of words) {
      if ((current + w).length > maxChunkSize) {
        if (current.trim()) atoms.push(current.trim());
        current = w.trimStart();
      } else {
        current += w;
      }
    }
    if (current.trim()) atoms.push(current.trim());
  }

  // Pack atoms greedily into chunks (joined by single space — TTS doesn't care about exact whitespace)
  const chunks: string[] = [];
  let buffer = '';
  for (const atom of atoms) {
    if (!buffer) {
      buffer = atom;
      continue;
    }
    if (buffer.length + 1 + atom.length <= maxChunkSize) {
      buffer += ` ${atom}`;
    } else {
      chunks.push(buffer);
      buffer = atom;
    }
  }
  if (buffer) chunks.push(buffer);

  return chunks;
}
