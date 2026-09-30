/**
 * Heuristic language detection for TTS purposes.
 *
 * The Web Speech API picks a voice based on `utterance.lang`. If we don't set it,
 * the browser uses its default (usually English) and reads Cyrillic text letter-by-letter
 * as broken phonemes. This function classifies a text snippet by counting characters
 * of each script and returning a BCP 47 tag that the synthesizer can use.
 *
 * Supported outputs:
 *  - `'ru-RU'` — Cyrillic-dominant
 *  - `'en-US'` — Latin-dominant (or empty/punctuation-only text)
 *
 * The classifier is intentionally simple — it counts script "letters" only and ignores
 * digits/whitespace/punctuation. Ties default to English.
 */
export type TtsLang = 'ru-RU' | 'en-US';

const CYRILLIC_RE = /[\u0400-\u04FF]/g;
const LATIN_RE = /[A-Za-z]/g;

export function detectTtsLang(text: string): TtsLang {
  if (!text) return 'en-US';
  const cyrillic = (text.match(CYRILLIC_RE) || []).length;
  const latin = (text.match(LATIN_RE) || []).length;
  return cyrillic > latin ? 'ru-RU' : 'en-US';
}
