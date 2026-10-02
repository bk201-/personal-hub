import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

export type SocialIcon = Record<string, string | AstroComponentFactory>;
