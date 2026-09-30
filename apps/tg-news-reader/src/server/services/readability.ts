import type { Readability } from '@mozilla/readability';
import type { JSDOM } from 'jsdom';
import TurndownService from 'turndown';
import { logger } from '../logger.js';

// jsdom + Readability are lazy-loaded on first use, not at import time.
// This keeps worker thread startup fast: if the worker never receives an article
// task, it never pays the ~2s / ~100MB jsdom load cost.
// Each worker thread has its own module scope, so these cached references
// are per-thread — no shared state between workers.
let JSDOMClass: typeof JSDOM | null = null;
let ReadabilityClass: typeof Readability | null = null;

async function getLibs() {
  if (JSDOMClass && ReadabilityClass) return { JSDOM: JSDOMClass, Readability: ReadabilityClass };
  const t = performance.now();
  const [{ JSDOM }, { Readability }] = await Promise.all([import('jsdom'), import('@mozilla/readability')]);
  JSDOMClass = JSDOM;
  ReadabilityClass = Readability;
  logger.info(
    { module: 'readability', ms: Math.round(performance.now() - t) },
    `jsdom loaded in ${Math.round(performance.now() - t)}ms`,
  );
  return { JSDOM, Readability };
}

export interface ExtractedContent {
  title?: string;
  content: string; // plain text (cleaned)
  rawHtml?: string; // raw HTML from Readability — used for Markdown conversion
  textContent: string;
  excerpt?: string;
  siteName?: string;
  byline?: string;
}

export interface BuiltContent {
  content: string;
  format: 'text' | 'markdown';
}

/** Removes empty lines, collapses whitespace, strips leftover HTML tags */
function cleanText(raw: string): string {
  // Strip any leftover HTML tags (fallback for when content is used instead of textContent)
  const stripped = raw.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ');

  return stripped
    .split('\n')
    .map((line) => line.trim())
    .filter((line, i, arr) => {
      if (line.length > 0) return true;
      // Allow at most one consecutive empty line (paragraph break)
      return i > 0 && arr[i - 1].length > 0;
    })
    .join('\n')
    .trim();
}

/** Build a TurndownService instance with sensible defaults for news articles. */
function createTurndown(): TurndownService {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
  });
  // Strip noisy elements Readability sometimes includes
  td.remove(['aside', 'script', 'style', 'noscript', 'button', 'form']);
  // Keep text content from <figure> elements (e.g. Meduza embeds) — removing them
  // entirely would cut off all text after an embedded block mid-article.
  td.addRule('figure', {
    filter: 'figure',
    replacement: (_content, node) => {
      const el = node as unknown as HTMLElement;
      // If the figure contains an <img>, skip it (Turndown handles images natively).
      // Otherwise preserve the text content so nothing gets lost.
      if (el.querySelector?.('img')) return '';
      const text = el.textContent?.trim() ?? '';
      return text ? `\n\n${text}\n\n` : '';
    },
  });
  return td;
}

/**
 * Build final content from extraction result.
 * Returns Markdown when raw HTML is available, plain text otherwise.
 */
export function buildFullContent(extracted: ExtractedContent): BuiltContent {
  // Prefer Markdown conversion from raw HTML
  if (extracted.rawHtml) {
    const td = createTurndown();
    let md = td.turndown(extracted.rawHtml).trim();
    if (!md) {
      // HTML was present but produced empty Markdown — fall through to text
    } else {
      const title = extracted.title?.trim();
      if (title && !md.slice(0, 300).toLowerCase().includes(title.toLowerCase())) {
        md = `# ${title}\n\n${md}`;
      }
      return { content: md, format: 'markdown' };
    }
  }

  // Fallback: plain text
  const text = extracted.textContent || extracted.content;
  const title = extracted.title?.trim();
  if (!title || !text) return { content: text, format: 'text' };
  if (text.slice(0, 300).toLowerCase().includes(title.toLowerCase())) {
    return { content: text, format: 'text' };
  }
  return { content: `${title}\n\n${text}`, format: 'text' };
}

export async function extractContentFromUrl(url: string): Promise<ExtractedContent> {
  const response = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status} for URL: ${url}`);
  }

  const html = await response.text();
  return parseHtml(html, url);
}

/**
 * Parse pre-fetched HTML with jsdom + Readability.
 * CPU-bound — designed to be called from a download worker thread so the
 * main event loop is not blocked.
 */
export async function parseHtml(html: string, url: string): Promise<ExtractedContent> {
  const { JSDOM, Readability } = await getLibs();

  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    const bodyText = dom.window.document.body?.textContent || '';
    return {
      content: '',
      textContent: bodyText.trim().substring(0, 5000),
    };
  }

  return {
    title: article.title ?? undefined,
    content: cleanText(article.content ?? ''),
    rawHtml: article.content ?? undefined,
    textContent: cleanText(article.textContent ?? ''),
    excerpt: article.excerpt ?? undefined,
    siteName: article.siteName ?? undefined,
    byline: article.byline ?? undefined,
  };
}
