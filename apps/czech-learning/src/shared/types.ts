// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AuthUser {
  id: number;
  email: string;
  role: string;
  hasTOTP?: boolean;
}

// ─── Words (Phase 2) ──────────────────────────────────────────────────────────

export type WordGender = 'ma' | 'mi' | 'f' | 'n'; // ma=masc.animate, mi=masc.inanimate
export type WordSource = 'textbook' | 'manual';
export type WordPos =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'pronoun'
  | 'numeral'
  | 'preposition'
  | 'conjunction'
  | 'interjection'
  | 'phrase';
export type WordAspect = 'perfective' | 'imperfective';
export type WordNumber = 'singular' | 'plural'; // singularia/pluralia tantum

// Noun declension paradigms (14 classes; named after the model noun)
export type WordDeclensionClass =
  | 'pan' // m.an.: pán  — sg. gen. pána
  | 'muz' // m.an.: muž  — sg. gen. muže
  | 'soudce' // m.an.: soudce (soft -ce)
  | 'predseda' // m.an.: předseda (borrowed -a stem)
  | 'hrad' // m.in.: hrad — sg. gen. hradu
  | 'stroj' // m.in.: stroj — sg. gen. stroje
  | 'zena' // f.: žena — sg. gen. ženy
  | 'ruze' // f.: růže — sg. gen. růže
  | 'pisen' // f.: píseň — sg. gen. písně
  | 'kost' // f.: kost — sg. gen. kosti
  | 'mesto' // n.: město — sg. gen. města
  | 'more' // n.: moře — sg. gen. moře
  | 'kure' // n.: kuře — sg. gen. kuřete
  | 'staveni'; // n.: stavení — sg. gen. stavení (indecl. -í)

// Verb conjugation classes (by ending of 3rd-person sg. present)
export type WordConjugationClass =
  | 'I-nese' // nese, bere — thematic -e (consonant stem)
  | 'I-bere' // bere subtype
  | 'I-maze' // maže subtype (alternation ž/ž)
  | 'I-pece' // peče subtype (k/č alternation)
  | 'II-tiskne' // tiskne — suffix -ne
  | 'III-kryje' // kryje — suffix -je (non-productive)
  | 'III-kupuje' // kupuje — suffix -uje (productive -ovat)
  | 'IV-prosi' // prosí — suffix -í (2nd soft)
  | 'IV-trpi' // trpí — suffix -í (2nd hard)
  | 'IV-sazi' // sází — suffix -í (2nd sibilant)
  | 'V-dela'; // dělá — suffix -á (1st)

export interface Word {
  id: number;
  czech: string;
  russian: string;
  pos: WordPos | null;
  gender: WordGender | null; // noun only
  numberType: WordNumber | null; // noun only (pluralia/singularia tantum)
  declensionClass: WordDeclensionClass | null; // noun only
  aspect: WordAspect | null; // verb only
  verbPair: string | null; // verb only (paired perfective/imperfective)
  conjugationClass: WordConjugationClass | null; // verb only
  notes: string | null;
  lesson: number | null;
  source: WordSource | null;
  seznamUrl: string | null;
  createdAt: number;
}

// ─── Cards / FSRS (Phase 4) ───────────────────────────────────────────────────

export type CardMode = 'cz_ru' | 'ru_cz' | 'recognition';
export type CardState = 0 | 1 | 2 | 3; // New | Learning | Review | Relearning

export interface Card {
  id: number;
  wordId: number;
  userId: number;
  mode: CardMode;
  due: number | null;
  stability: number | null;
  difficulty: number | null;
  elapsedDays: number | null;
  scheduledDays: number | null;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: number | null;
}

export interface ReviewCard extends Card {
  czech: string;
  russian: string;
  gender: WordGender | null;
  notes: string | null;
}

export interface ReviewSession {
  cards: ReviewCard[];
  newCount: number;
  dueCount: number;
}

export interface ReviewResult {
  cardId: number;
  rating: 1 | 2 | 3 | 4; // Again | Hard | Good | Easy
  durationMs: number;
}

// ─── Grammar (Phase 7) ────────────────────────────────────────────────────────

export type GrammarContentType = 'image' | 'markdown';

export interface GrammarSection {
  id: number;
  title: string;
  lesson: number | null;
  sortOrder: number;
  contentType: GrammarContentType;
  content: string | null;
  imagePath: string | null;
  createdAt: number;
}

// ─── User Settings (Phase 5) ─────────────────────────────────────────────────

export interface UserSettings {
  userId: number;
  dailyNewLimit: number;
  modes: CardMode[];
  updatedAt: number;
}
