import type { Filter, NewsItem } from '@shared/types.ts';

// Filter logic helper — active filters EXCLUDE matching news
export function applyFilters(items: NewsItem[], filters: Filter[]): Set<number> {
  const activeFilters = filters.filter((f) => f.isActive === 1);
  if (activeFilters.length === 0) return new Set(items.map((i) => i.id));

  const tagFilterValues = activeFilters
    .filter((f) => f.type === 'tag')
    .map((f) => f.value.replace(/^#/, '').toLowerCase());

  const keywordFilters = activeFilters.filter((f) => f.type === 'keyword').map((f) => f.value.toLowerCase());

  // Build a Set of normalised tag values for O(1) per-hashtag lookup.
  // For each filter tag "cat" we add both "cat" and "#cat" so we match regardless of
  // whether the hashtag was stored with or without the leading "#".
  const tagFilterSet = new Set<string>();
  for (const tag of tagFilterValues) {
    tagFilterSet.add(tag);
    tagFilterSet.add('#' + tag);
  }

  const passedIds = new Set<number>();

  for (const item of items) {
    const hashtags = (item.hashtags || []).map((h) => h.toLowerCase());
    const text = (item.text || '').toLowerCase();

    // Exclude if any hashtag matches the filter set (O(T) instead of O(F×T))
    if (tagFilterSet.size > 0 && hashtags.some((h) => tagFilterSet.has(h))) continue;

    // Exclude if any keyword is found in the text
    if (keywordFilters.some((kw) => text.includes(kw))) continue;

    passedIds.add(item.id);
  }

  return passedIds;
}
