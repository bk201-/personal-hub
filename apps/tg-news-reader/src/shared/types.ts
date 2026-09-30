export type ChannelType = 'news' | 'news_link' | 'media' | 'blog';

export type DownloadType = 'media' | 'article' | 'image';
export type DownloadStatus = 'pending' | 'processing' | 'done' | 'failed';

export interface DownloadTask {
  id: number;
  newsId: number;
  type: DownloadType;
  url?: string | null;
  priority: number;
  status: DownloadStatus;
  error?: string | null;
  createdAt: number;
  processedAt?: number | null;
  // Context joined from news + channels
  newsText?: string;
  channelId?: number;
  channelName?: string;
  // Result fields (populated on done tasks so client can update cache in-place)
  localMediaPath?: string | null;
  localMediaPaths?: string[] | null; // album: all downloaded paths
}

export interface Group {
  id: number;
  name: string;
  color: string;
  hasPIN: boolean;
  sortOrder: number;
  createdAt: number;
}

export interface Channel {
  id: number;
  telegramId: string;
  name: string;
  description?: string;
  channelType: ChannelType;
  groupId?: number | null;
  sortOrder: number;
  filterForwards: number;
  lastFetchedAt?: number;
  lastReadAt?: number;
  isUnavailable: number;
  unreadCount: number;
  totalNewsCount: number;
  createdAt: number;
  /** Computed server-side: false for media channels where digest is not meaningful */
  supportsDigest: boolean;
}

/** Logical file bytes in this channel's server directory; excludes shared DB/TTS and browser cache. */
export interface ChannelStorageStats {
  bytes: number;
  fileCount: number;
  /** Unix seconds when the directory scan completed. */
  checkedAt: number;
}

export interface NewsItem {
  id: number;
  channelId: number;
  telegramMsgId: number;
  text: string;
  links: string[];
  hashtags: string[];
  mediaType?: string;
  isRead: number;
  postedAt: number;
  fullContent?: string;
  localMediaPath?: string;
  localMediaPaths?: string[]; // album: all downloaded paths (JSON-decoded)
  albumMsgIds?: number[]; // album: full list of Telegram msg IDs — length = expected total, even before download
  mediaSize?: number;
  /** 1 = post text shown in collapsible top panel (media channels); 0/absent = inline */
  textInPanel?: number;
  /** 1 = "Load article" button available (news_link items with a link but no fullContent yet) */
  canLoadArticle?: number;
  /** Format of fullContent: 'markdown' for newly extracted articles, 'text' for legacy plain-text */
  fullContentFormat?: 'text' | 'markdown';
  /** Name of the channel/user this post was forwarded from (if it's a repost) */
  forwardFromName?: string;
}

export interface Filter {
  id: number;
  channelId: number;
  name: string;
  type: 'tag' | 'keyword';
  value: string;
  isActive: number;
  createdAt: number;
}

export interface FilterStat {
  filterId: number;
  hitsLast7: number;
  hitsTotal: number;
  lastHitDate: string | null; // 'YYYY-MM-DD'
}
