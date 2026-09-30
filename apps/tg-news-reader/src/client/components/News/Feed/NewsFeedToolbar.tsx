import React from 'react';
import { NewsFeedToolbarDesktop } from './Desktop/NewsFeedToolbarDesktop';
import { NewsFeedToolbarMobile } from './Mobile/NewsFeedToolbarMobile';
import type { NewsFeedToolbarProps } from './newsFeedToolbarTypes';

export type { NewsFeedToolbarProps } from './newsFeedToolbarTypes';

export function NewsFeedToolbar(props: NewsFeedToolbarProps) {
  return props.isMobile ? <NewsFeedToolbarMobile {...props} /> : <NewsFeedToolbarDesktop {...props} />;
}
