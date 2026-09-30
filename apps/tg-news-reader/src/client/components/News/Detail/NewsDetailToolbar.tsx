import React from 'react';
import { NewsDetailToolbarPanel } from './Desktop/NewsDetailToolbarPanel';
import { NewsDetailToolbarInline } from './Mobile/NewsDetailToolbarInline';
import type { NewsDetailToolbarProps } from './newsDetailToolbarTypes';

export type { NewsDetailToolbarProps } from './newsDetailToolbarTypes';

export function NewsDetailToolbar(props: NewsDetailToolbarProps) {
  return props.variant === 'inline' ? <NewsDetailToolbarInline {...props} /> : <NewsDetailToolbarPanel {...props} />;
}
