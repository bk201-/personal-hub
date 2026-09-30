import OpenAI, { AzureOpenAI } from 'openai';
import {
  AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_KEY,
  AZURE_OPENAI_TTS_DEPLOYMENT,
  OPENAI_API_KEY,
} from '../config.js';

export const DIGEST_DEPLOYMENT = AZURE_OPENAI_DEPLOYMENT;

/** Returns true when at least one AI provider is configured for chat completions (digest). */
export function isAiConfigured(): boolean {
  return !!(AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY) || !!OPENAI_API_KEY;
}

/**
 * Creates an OpenAI-compatible client for chat completions.
 * - If AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY are set → Azure OpenAI
 * - Otherwise → direct OpenAI API via OPENAI_API_KEY
 */
export function createOpenAiClient(): OpenAI {
  if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY) {
    return new AzureOpenAI({
      endpoint: AZURE_OPENAI_ENDPOINT,
      apiKey: AZURE_OPENAI_KEY,
      apiVersion: '2024-12-01-preview',
      deployment: AZURE_OPENAI_DEPLOYMENT,
    });
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}

/**
 * Returns true when a TTS provider is configured.
 *
 * Azure TTS requires a *separate* deployment from chat completions; if only Azure chat is set
 * we fall back to checking OPENAI_API_KEY (direct OpenAI provider).
 */
export function isTtsConfigured(): boolean {
  if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY && AZURE_OPENAI_TTS_DEPLOYMENT) return true;
  return !!OPENAI_API_KEY;
}

/**
 * Creates an OpenAI-compatible client configured for TTS calls.
 * Throws if no TTS provider is configured — callers should check isTtsConfigured() first.
 */
export function createTtsClient(): OpenAI {
  if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY && AZURE_OPENAI_TTS_DEPLOYMENT) {
    return new AzureOpenAI({
      endpoint: AZURE_OPENAI_ENDPOINT,
      apiKey: AZURE_OPENAI_KEY,
      apiVersion: '2024-12-01-preview',
      deployment: AZURE_OPENAI_TTS_DEPLOYMENT,
    });
  }
  if (OPENAI_API_KEY) {
    return new OpenAI({ apiKey: OPENAI_API_KEY });
  }
  throw new Error('TTS not configured — set OPENAI_API_KEY or AZURE_OPENAI_TTS_DEPLOYMENT');
}
