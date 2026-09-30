export const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-in-production';
export const JWT_ACCESS_EXPIRES_SEC = 15 * 60; // 15 min
export const REFRESH_EXPIRES_DAYS = 7;

export const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT ?? '';
export const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY ?? '';
export const AZURE_OPENAI_DEPLOYMENT = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o';

if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'dev-secret-change-in-production') {
  throw new Error('JWT_SECRET env variable must be set in production!');
}

