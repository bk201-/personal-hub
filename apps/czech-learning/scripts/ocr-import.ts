/**
 * OCR Import — processes dictionary images via Azure OpenAI GPT-4o Vision
 * and produces a structured JSON file ready for import.
 *
 * Usage:
 *   npm run ocr:import -- ./path/to/images/
 *
 * Output:
 *   data/ocr-output/page-001.json   (raw per-page results)
 *   data/ocr-output/words-final.json (deduplicated, validated)
 *
 * Requires in .env:
 *   AZURE_OPENAI_ENDPOINT
 *   AZURE_OPENAI_API_KEY
 *   AZURE_OPENAI_DEPLOYMENT
 */
import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { resolve, extname, basename } from 'path';

// ─── Config ───────────────────────────────────────────────────────────────────

const ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
const API_KEY = process.env.AZURE_OPENAI_API_KEY;
const DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o-mini';
const API_VERSION = '2025-01-01-preview'; // supports vision on both endpoint formats
const OUTPUT_DIR = resolve('./data/ocr-output');
const DELAY_MS = 1500; // polite delay between requests

if (!ENDPOINT || !API_KEY) {
  console.error('❌ AZURE_OPENAI_ENDPOINT and AZURE_OPENAI_API_KEY must be set in .env');
  process.exit(1);
}

// ─── Args ─────────────────────────────────────────────────────────────────────

const imageDir = process.argv[2];
if (!imageDir) {
  console.error('Usage: npm run ocr:import -- <path-to-images-dir>');
  process.exit(1);
}

const absImageDir = resolve(imageDir);
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

let imageFiles: string[];
try {
  imageFiles = readdirSync(absImageDir)
    .filter((f) => IMAGE_EXTS.has(extname(f).toLowerCase()))
    .sort()
    .map((f) => resolve(absImageDir, f));
} catch {
  console.error(`❌ Cannot read directory: ${absImageDir}`);
  process.exit(1);
}

if (imageFiles.length === 0) {
  console.error(`❌ No image files found in ${absImageDir}`);
  process.exit(1);
}

console.log(`📂 Found ${imageFiles.length} image(s) in ${absImageDir}`);
mkdirSync(OUTPUT_DIR, { recursive: true });

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a precise OCR assistant specializing in Czech-Russian dictionaries.
Your task: extract every vocabulary entry from the image and return a valid JSON array.
Return ONLY the JSON array — no markdown fences, no explanation, no prose.`;

const USER_PROMPT = `This is a page from a Czech-Russian textbook dictionary.

═══ DIACRITICS — BE PRECISE ═══
Czech uses: á é í ó ú ů ý č ď ě ň ř š ť ž
Common OCR mistakes to avoid:
• á ≠ a,  é ≠ e,  í ≠ i,  ů ≠ u
• č ≠ c,  š ≠ s,  ž ≠ z,  ř ≠ r,  ň ≠ n,  ě ≠ e
Always reproduce diacritics exactly as printed. Do NOT replace ě→e, č→c, etc.

═══ COLOR → GENDER (for nouns) ═══
• Light blue text  → gender = "ma"  (masculine animate,   e.g. pan, pes)
• Dark blue text   → gender = "mi"  (masculine inanimate, e.g. hrad, stůl)
• Red text         → gender = "f"   (feminine,            e.g. žena, kost)
• Green text       → gender = "n"   (neuter,              e.g. město, moře)
• No color / black → gender = null

═══ ABBREVIATIONS ═══
• "разг."      → notes: "(разг.)"   — colloquial register
• "диал."      → notes: "(диал.)"   — dialectal
• "уменьш."    → notes: "(уменьш.)" — diminutive form
• "несов."     → aspect: "imperfective"
• "сов."       → aspect: "perfective"
• "сов.+несов."→ aspect: null, add notes: "(сов.+несов.)" — bi-aspectual verb
• "мн. ч."     → number_type: "plural"   (pluralia tantum)
• "ед. ч." or "уд. ч." → number_type: "singular" (singularia tantum)
• Underlined е (e̲)  → the "е" is fleeting; add notes: "(беглое е)"
• Asterisk "*" on a verb → -е conjugation class with stem alternation.
  Set conjugation_class: "I-maze" (sibilant: psát→píšu), "I-pece" (k/h: péct→peču), else "I-nese".
  Strip the * from the czech field.

═══ GOLDEN RULE ═══
The "czech" field must NEVER contain a comma.
Every distinct Czech word → its own separate JSON object.
NEVER skip an entry because it looks complex — always include it, even if imperfect.

═══ ENTRY FORMATS ═══

1. Single word (most common):
   "dělat несов.  делать"
   → { czech: "dělat", russian: "делать", aspect: "imperfective" }

2. Masculine + Feminine pair on the same line (DIFFERENT colors):
   "Brit, Britka  британец, британка"   (light-blue, red)
   "Afričan, Afričanka  африканец, африканка"
   "Asiat, Asiatka  азиат, азиатка"
   "básník, básnířka  поэт, поэтесса"
   → ALWAYS TWO entries. N-th Czech word → N-th Russian word:
     { czech: "Brit",    russian: "британец", gender: "ma", declension_class: "pan" }
     { czech: "Britka",  russian: "британка", gender: "f",  declension_class: "zena" }
   ⚠ DO NOT output only one word and drop the other.

3. Main word + colloquial variant ("разг." before Czech word):
   "babička, разг. babi  бабушка, бабуля"
   → TWO entries:
     { czech: "babička", russian: "бабушка", gender: "f" }
     { czech: "babi",    russian: "бабуля",  gender: "f", notes: "(разг.)" }

4. Multi-line entries — two Czech words on consecutive lines, each with its own Russian:
   Line 1: "blond,         блондин(ка),"
   Line 2: "blonďatý       белокурый"
   These are TWO separate entries (comma after "блондин(ка)" signals continuation):
     { czech: "blond",     russian: "блондин(ка)", pos: "noun" }
     { czech: "blonďatý",  russian: "белокурый",   pos: "adjective" }
   ⚠ DO NOT merge both Russian translations into one entry. DO NOT drop the second Czech word.

5. Variant spellings (same color, same/similar Russian):
   "aerobic, aerobik  аэробика"
   "brambor, brambora  картофель, картофелина"
   → TWO entries (split, pair N-th Czech with N-th Russian, or repeat if only one Russian):
     { czech: "aerobic", russian: "аэробика", gender: "mi" }
     { czech: "aerobik", russian: "аэробика", gender: "mi" }

6. Bi-aspectual verb:
   "adoptovat сов.+несов.  адаптировать, усыновить, удочерить"
   → ONE entry: { czech: "adoptovat", russian: "адаптировать, усыновить, удочерить", aspect: null, notes: "(сов.+несов.)" }
   Join multi-line Russian translations with ", ".

7. Verb shown with its 1st-person present tense (may look VERY different):
   "brát* si, beru si  жениться, венчаться"
   "brát*, beru  брать"
   "bát se, bojím se  бояться"
   "jít, jdu  идти"
   The SECOND form is the conjugated present — NOT a separate word.
   → ALWAYS ONE entry using the INFINITIVE (first form):
     { czech: "brát si", russian: "жениться, венчаться", pos: "verb", conjugation_class: "I-nese" }
     { czech: "brát",    russian: "брать",               pos: "verb", conjugation_class: "I-nese" }
     { czech: "bát se",  russian: "бояться",             pos: "verb" }
   Strip * from the czech field. NEVER skip these entries.

8. Imperfective / perfective pair (slash-separated):
   "dělat / udělat  делать / сделать"
   → TWO entries:
     { czech: "dělat",  russian: "делать",  aspect: "imperfective", verb_pair: "udělat" }
     { czech: "udělat", russian: "сделать", aspect: "perfective",   verb_pair: "dělat"  }

═══ OUTPUT SCHEMA ═══
Each entry must be a JSON object:
{
  "czech":             string (required — infinitive for verbs, no *, no conjugated forms),
  "russian":           string (required — full translation, join multi-line with ", "),
  "pos":               "noun"|"verb"|"adjective"|"adverb"|"pronoun"|"numeral"|
                       "preposition"|"conjunction"|"interjection"|"phrase" | null,
  "gender":            "ma"|"mi"|"f"|"n" | null,
  "number_type":       "singular"|"plural" | null,
  "aspect":            "perfective"|"imperfective" | null,
  "verb_pair":         string | null,
  "conjugation_class": "I-nese"|"I-bere"|"I-maze"|"I-pece"|"II-tiskne"|
                       "III-kryje"|"III-kupuje"|"IV-prosi"|"IV-trpi"|"IV-sazi"|
                       "V-dela" | null,
  "declension_class":  "pan"|"muz"|"soudce"|"predseda"|"hrad"|"stroj"|
                       "zena"|"ruze"|"pisen"|"kost"|"mesto"|"more"|"kure"|
                       "staveni" | null,
  "notes":             string | null,
  "lesson":            number | null
}

Return ONLY a valid JSON array of these objects.`;


// ─── Post-processing: split any remaining comma-merged entries ────────────────

/** Infer gender for the second word in a pair from its ending */
function inferSecondGender(word: string, firstGender: string | null | undefined): 'ma' | 'mi' | 'f' | 'n' | null {
  const w = word.toLowerCase().replace(/[^a-záéíóúůýčďěňřšťž]/g, '');
  // Feminine endings: -a, -ka, -ička, -yně, -ice
  if (/[aá]$/.test(w) || w.endsWith('ka') || w.endsWith('ice') || w.endsWith('yně')) return 'f';
  return (firstGender as 'ma' | 'mi' | 'f' | 'n' | null) ?? null;
}

/** Infer declension class from gender + ending */
function inferDeclension(word: string, gender: string | null): string | null {
  if (!gender) return null;
  const w = word.toLowerCase();
  if (gender === 'f') {
    if (w.endsWith('ost') || w.endsWith('ěst')) return 'kost';
    if (w.endsWith('ě') || w.endsWith('e') || w.endsWith('ní')) return 'ruze';
    if (w.endsWith('ň') || w.endsWith('ě')) return 'pisen';
    return 'zena'; // default feminine
  }
  if (gender === 'ma') return 'pan';
  if (gender === 'mi') return 'hrad';
  if (gender === 'n') return 'mesto';
  return null;
}

/**
 * Recovery: if an entry has a single Czech word but TWO Russian translations
 * that look like a masc/fem pair (e.g. "африканец, африканка"),
 * and we can infer the feminine Czech form, split it.
 *
 * Common Czech feminine suffixes from masculine:
 *   -an → -anka  (Brit→Britka, Australan→Australanka)
 *   -ec → -ka    (Němec→Němka)
 *   -ník → -nice (básník→básnířka — too irregular, skip)
 */
function recoverMissingFeminine(entries: WordEntry[]): WordEntry[] {
  const result: WordEntry[] = [];

  for (const entry of entries) {
    // Only applies to nouns where czech has no comma (single word)
    if (entry.czech.includes(',') || entry.pos !== 'noun') {
      result.push(entry);
      continue;
    }

    const ruParts = entry.russian.split(/,\s+/).map(s => s.trim()).filter(Boolean);
    if (ruParts.length < 2) {
      result.push(entry);
      continue;
    }

    // Check if Russian looks like a masc/fem pair:
    // last part ends with -ка/-ица/-иня while first part doesn't
    const lastRu = ruParts[ruParts.length - 1];
    const firstRu = ruParts[0];
    const looksLikeFemRu = /[кц]а$|иня$|ница$/.test(lastRu) && !/[кц]а$|иня$|ница$/.test(firstRu);

    if (!looksLikeFemRu) {
      result.push(entry);
      continue;
    }

    // Try to build feminine Czech form
    const cz = entry.czech;
    let femCzech: string | null = null;

    if (/an$/i.test(cz))       femCzech = cz.replace(/an$/i, 'anka');     // Australan→Australanka
    else if (/[aá]n$/i.test(cz)) femCzech = cz + 'ka';                    // Brit→Britka (Brit+ka)
    else if (/[^aeiouáéíóúů]$/i.test(cz) && cz.length > 3) femCzech = cz + 'ka'; // fallback

    if (!femCzech) {
      result.push(entry); // can't infer — leave merged
      continue;
    }

    // Output masculine entry
    result.push({
      ...entry,
      russian: firstRu,
      gender: entry.gender ?? 'ma',
      declension_class: entry.declension_class ?? 'pan',
    });
    // Output feminine entry
    result.push({
      ...entry,
      czech: femCzech,
      russian: lastRu,
      gender: 'f',
      declension_class: inferDeclension(femCzech, 'f') ?? 'zena',
      notes: null,
    });
    continue;
  }

  return result;
}

/**
 * Split any entry where `czech` still contains a comma after OCR.
 * The model is instructed not to do this, but this is a safety net.
 */
function splitCommaEntries(entries: WordEntry[]): WordEntry[] {
  const result: WordEntry[] = [];

  for (const entry of entries) {
    if (!entry.czech.includes(',')) {
      result.push(entry);
      continue;
    }

    // Split czech parts: "Asiat, Asiatka" → ["Asiat", "Asiatka"]
    const czechParts = entry.czech.split(/,\s+/).map((s) => s.trim()).filter(Boolean);
    if (czechParts.length < 2) { result.push(entry); continue; }

    // Check if the second part looks like a 1st-person verb form — if so, don't split
    // Pattern: infinitive ends in -t/-ct, second part ends in -u/-m/-ím/-ím se etc.
    const looksLikeConjugated = (inf: string, conj: string) => {
      const c = conj.toLowerCase().replace(/\*/, '');
      return /[uíím](\s+se|\s+si)?$/.test(c) && /[tc](\s+se|\s+si)?$/.test(inf.toLowerCase().replace(/\*/, ''));
    };
    if (czechParts.length === 2 && looksLikeConjugated(czechParts[0], czechParts[1])) {
      // Keep only the infinitive
      result.push({ ...entry, czech: czechParts[0].replace(/\*/, '').trim() });
      continue;
    }

    // Split russian parts: "азиат, азиатка" → ["азиат", "азиатка"]
    const russianParts = entry.russian.split(/,\s+/).map((s) => s.trim()).filter(Boolean);

    for (let i = 0; i < czechParts.length; i++) {
      const czechWord = czechParts[i];
      // Strip leading annotations like "разг." from czech word
      const cleanCzech = czechWord.replace(/^[а-яёА-ЯЁ][а-яёА-ЯЁ]+\.\s+/, '').trim();
      const isColloquial = czechWord !== cleanCzech; // had a Russian annotation prefix

      const russianWord = russianParts[i] ?? russianParts[russianParts.length - 1];

      const gender = i === 0
        ? entry.gender
        : inferSecondGender(cleanCzech, entry.gender);

      const declension = i === 0
        ? entry.declension_class
        // @ts-ignore
        : (inferDeclension(cleanCzech, gender) ?? entry.declension_class);

      // Notes: apply разг. to colloquial variants, otherwise keep original on first only
      let notes: string | null = null;
      if (isColloquial) {
        notes = '(разг.)';
      } else if (i === 0 && !entry.notes?.includes('разг.')) {
        notes = entry.notes ?? null;
      } else if (i === czechParts.length - 1 && entry.notes?.includes('разг.')) {
        notes = entry.notes;
      }

      result.push({
        ...entry,
        czech: cleanCzech,
        russian: russianWord,
        gender,
        declension_class: declension,
        notes,
      });
    }
  }

  return result;
}

// ─── JSON repair: recover a truncated array ──────────────────────────────────

function repairTruncatedJson(raw: string): string {
  // Already valid?
  try { JSON.parse(raw); return raw; } catch { /* continue */ }

  // Find the last complete object: last occurrence of "}," or "}\n" before the truncation
  // Strategy: cut after the last well-formed "}" that closes a top-level array element
  let lastGood = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\' && inString) { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{' || ch === '[') depth++;
    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 1) lastGood = i; // closed a top-level object inside the array
    }
  }

  if (lastGood === -1) return '[]';

  const trimmed = raw.slice(0, lastGood + 1).trimEnd().replace(/,$/, '');
  return trimmed + '\n]';
}

// ─── Azure OpenAI call ────────────────────────────────────────────────────────

interface WordEntry {
  czech: string;
  russian: string;
  pos?: string | null;
  gender?: string | null;
  number_type?: string | null;
  aspect?: string | null;
  verb_pair?: string | null;
  conjugation_class?: string | null;
  declension_class?: string | null;
  notes?: string | null;
  lesson?: number | null;
}

async function processImage(imagePath: string): Promise<WordEntry[]> {
  const ext = extname(imagePath).toLowerCase().slice(1);
  const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const mime = mimeMap[ext] ?? 'image/png';
  const base64 = readFileSync(imagePath).toString('base64');
  const dataUrl = `data:${mime};base64,${base64}`;

  const url = `${ENDPOINT}/openai/deployments/${DEPLOYMENT}/chat/completions?api-version=${API_VERSION}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': API_KEY!,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: dataUrl, detail: 'high' } },
            { type: 'text', text: USER_PROMPT },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 16000,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Azure OpenAI error ${response.status}: ${errText}`);
  }

  const data = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };

  const rawContent = data.choices[0]?.message?.content ?? '[]';

  // Strip markdown code fences if present
  const cleaned = rawContent
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  try {
    const repaired = repairTruncatedJson(cleaned);
    const wasRepaired = repaired !== cleaned;
    const parsed = JSON.parse(repaired) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error(`Response is not a JSON array.\nRaw: ${cleaned.slice(0, 500)}`);
    }
    if (wasRepaired) {
      process.stdout.write(`(⚠ truncated, recovered ${parsed.length} entries) `);
    }
    return parsed as WordEntry[];
  } catch (e) {
    const msg = e instanceof SyntaxError
      ? `Failed to parse JSON: ${e.message}\nRaw: ${cleaned.slice(0, 500)}`
      : (e as Error).message;
    throw new Error(msg);
  }
}

// ─── Main loop ────────────────────────────────────────────────────────────────

const allWords: WordEntry[] = [];
let pageErrors = 0;

for (let i = 0; i < imageFiles.length; i++) {
  const filePath = imageFiles[i];
  const pageNum = String(i + 1).padStart(3, '0');
  const outFile = resolve(OUTPUT_DIR, `page-${pageNum}.json`);

  process.stdout.write(`  [${i + 1}/${imageFiles.length}] ${basename(filePath)}… `);

  try {
    const entries = await processImage(filePath);
    const recovered = recoverMissingFeminine(entries);
    const split = splitCommaEntries(recovered);
    const added = split.length - entries.length;
    writeFileSync(outFile, JSON.stringify(split, null, 2), 'utf-8');
    const suffix = added > 0 ? ` (+${added} auto-split/recovered)` : '';
    console.log(`✓ ${split.length} entries → ${basename(outFile)}${suffix}`);
    allWords.push(...split);
  } catch (e) {
    console.error(`✗ ERROR: ${(e as Error).message}`);
    pageErrors++;
  }

  // Rate-limit delay (skip after last image)
  if (i < imageFiles.length - 1) {
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }
}

console.log(`\n📊 Raw total: ${allWords.length} entries across ${imageFiles.length} pages (${pageErrors} page error(s))`);

// ─── Deduplicate + validate ───────────────────────────────────────────────────

const VALID_POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'numeral', 'preposition', 'conjunction', 'interjection', 'phrase']);
const VALID_GENDER = new Set(['ma', 'mi', 'f', 'n']);
const VALID_ASPECT = new Set(['perfective', 'imperfective']);
const VALID_NUMBER = new Set(['singular', 'plural']);

const seenCzech = new Set<string>();
const finalWords: WordEntry[] = [];
let dupeCount = 0;
let invalidCount = 0;

for (const w of allWords) {
  const czech = w.czech?.trim();
  const russian = w.russian?.trim();

  if (!czech || !russian) { invalidCount++; continue; }
  if (seenCzech.has(czech.toLowerCase())) { dupeCount++; continue; }

  seenCzech.add(czech.toLowerCase());
  finalWords.push({
    czech,
    russian,
    pos: w.pos && VALID_POS.has(w.pos) ? w.pos : null,
    gender: w.gender && VALID_GENDER.has(w.gender) ? w.gender : null,
    number_type: w.number_type && VALID_NUMBER.has(w.number_type) ? w.number_type : null,
    aspect: w.aspect && VALID_ASPECT.has(w.aspect) ? w.aspect : null,
    verb_pair: w.verb_pair?.trim() || null,
    conjugation_class: w.conjugation_class?.trim() || null,
    declension_class: w.declension_class?.trim() || null,
    notes: w.notes?.trim() || null,
    lesson: typeof w.lesson === 'number' && !isNaN(w.lesson) ? w.lesson : null,
  });
}

const finalPath = resolve(OUTPUT_DIR, 'words-final.json');
writeFileSync(finalPath, JSON.stringify(finalWords, null, 2), 'utf-8');

console.log(`\n✅ Deduplication complete:`);
console.log(`   Valid unique words : ${finalWords.length}`);
console.log(`   Duplicates removed : ${dupeCount}`);
console.log(`   Invalid entries    : ${invalidCount}`);
console.log(`\n📄 Output: ${finalPath}`);
console.log(`\nNext step:`);
console.log(`   npm run import:words -- --email admin@example.com --password <pass>`);

