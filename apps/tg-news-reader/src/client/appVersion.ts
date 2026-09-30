import { version as packageVersion } from '../../package.json';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : packageVersion;
export const APP_BUILD_ID = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'tg-news-reader:development';
