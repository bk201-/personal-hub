/**
 * Pre-processes text for TTS playback (both Native and AI).
 *
 * Goal: remove anything that would be awkwardly pronounced as a literal URL
 * (e.g. "h-t-t-p-s colon slash slash example dot com slash some-very-long-slug").
 *
 * Transformations (order matters):
 *  1. Markdown image  `![alt](url)`  → `alt`
 *  2. Markdown link   `[label](url)` → `label`
 *  3. Bare http(s) URLs            → ` `
 *  4. `www.…` URLs                  → ` `
 *  5. `t.me/…` Telegram links      → ` `
 *  6. Collapse runs of whitespace   → single space (per line, preserves \n)
 *
 * Pure / deterministic — same input ⇒ same output. Used both client-side (to
 * sanitize before sending to the AI generation endpoint) and inside
 * `splitSentences` for the native player.
 */
export function sanitizeForTts(text: string): string {
  if (!text) return '';

  let out = text;

  // Markdown image first (its bang prefix would otherwise survive the link regex)
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  // Markdown link — keep visible label, drop URL
  out = out.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');

  // Bare URLs — note: \S+ stops at whitespace, which is what we want
  out = out.replace(/https?:\/\/\S+/gi, ' ');
  // `www.example.com/…`
  out = out.replace(/\bwww\.\S+/gi, ' ');
  // Telegram shortlinks (t.me/foo, t.me/foo/123)
  out = out.replace(/\bt\.me\/\S+/gi, ' ');

  // Collapse runs of spaces/tabs (NOT newlines — paragraphs still matter for splitting)
  out = out.replace(/[ \t]{2,}/g, ' ');
  // Trim each line so a URL at the start of a line doesn't leave a leading space
  out = out
    .split('\n')
    .map((l) => l.replace(/^[ \t]+|[ \t]+$/g, ''))
    .join('\n');

  return out;
}
