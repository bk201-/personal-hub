import type { NewsItem } from '@shared/types.ts';

export interface NewsDetailToolbarProps {
  item: NewsItem;
  links: string[];
  topPanel: 'links' | 'text' | null;
  onTogglePanel: (panel: 'links' | 'text') => void;
  articleLoading: boolean;
  articleQueued: boolean;
  onExtractClick: () => void;
  isRead: boolean;
  onMarkRead: () => void;
  markReadPending: boolean;
  onRefresh: () => void;
  refreshPending: boolean;
  /** URL to open when the Open button is clicked (firstLink if available, otherwise Telegram deep-link) */
  openUrl: string;
  /** true when openUrl is an external link from the post (false = Telegram fallback) */
  isExternalLink: boolean;
  /** 'panel' = classic date+tags header; 'inline' = accordion with title+date+tags */
  variant?: 'panel' | 'inline';
  /** Title text shown in inline variant */
  title?: string;
  /** Clicking the left (title/meta) area collapses the accordion item */
  onHeaderClick?: () => void;
  /** Tag click handler — if provided tags show a dropdown menu (show / addFilter) */
  onTagClick?: (tag: string, action: 'show' | 'addFilter') => void;
  /** Share button handler — Web Share API on mobile, clipboard fallback on desktop */
  onShare: () => void;
}
