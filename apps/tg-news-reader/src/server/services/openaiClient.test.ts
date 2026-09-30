import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Must mock config before importing openaiClient
vi.mock('../config.js', () => ({
  AZURE_OPENAI_ENDPOINT: '',
  AZURE_OPENAI_KEY: '',
  AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
  OPENAI_API_KEY: '',
}));

describe('openaiClient', { timeout: 15_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isAiConfigured returns false when no keys set', async () => {
    vi.doMock('../config.js', () => ({
      AZURE_OPENAI_ENDPOINT: '',
      AZURE_OPENAI_KEY: '',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
      OPENAI_API_KEY: '',
    }));
    const { isAiConfigured } = await import('./openaiClient.js');
    expect(isAiConfigured()).toBe(false);
  });

  it('isAiConfigured returns true when Azure keys set', async () => {
    vi.doMock('../config.js', () => ({
      AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/',
      AZURE_OPENAI_KEY: 'key-123',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
      OPENAI_API_KEY: '',
    }));
    const { isAiConfigured } = await import('./openaiClient.js');
    expect(isAiConfigured()).toBe(true);
  });

  it('isAiConfigured returns true when OpenAI key set', async () => {
    vi.doMock('../config.js', () => ({
      AZURE_OPENAI_ENDPOINT: '',
      AZURE_OPENAI_KEY: '',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
      OPENAI_API_KEY: 'sk-test',
    }));
    const { isAiConfigured } = await import('./openaiClient.js');
    expect(isAiConfigured()).toBe(true);
  });

  it('createOpenAiClient returns AzureOpenAI when Azure keys set', async () => {
    vi.doMock('../config.js', () => ({
      AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/',
      AZURE_OPENAI_KEY: 'key-123',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
      OPENAI_API_KEY: '',
    }));
    const { createOpenAiClient } = await import('./openaiClient.js');
    const { AzureOpenAI } = await import('openai');
    const client = createOpenAiClient();
    expect(client).toBeInstanceOf(AzureOpenAI);
  });

  it('createOpenAiClient returns OpenAI when only OpenAI key set', async () => {
    vi.doMock('../config.js', () => ({
      AZURE_OPENAI_ENDPOINT: '',
      AZURE_OPENAI_KEY: '',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
      OPENAI_API_KEY: 'sk-test',
    }));
    const { createOpenAiClient } = await import('./openaiClient.js');
    const OpenAI = (await import('openai')).default;
    const client = createOpenAiClient();
    expect(client).toBeInstanceOf(OpenAI);
  });
});
