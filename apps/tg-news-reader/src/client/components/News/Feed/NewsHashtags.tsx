import { FilterOutlined, PlusOutlined } from '@ant-design/icons';
import { Dropdown, Tag } from 'antd';
import type { MenuProps } from 'antd';
import { createStyles } from 'antd-style';
import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const CURSOR_POINTER_STYLE = { cursor: 'pointer' };
const STOP_PROPAGATION = (e: React.MouseEvent) => e.stopPropagation();
const DROPDOWN_TRIGGER: ['click'] = ['click'];
const ICON_FILTER = <FilterOutlined />;
const ICON_PLUS = <PlusOutlined />;

const useStyles = createStyles(({ css }) => ({
  tags: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  `,
  tag: css`
    margin: 0;
  `,
}));

interface NewsHashtagsProps {
  hashtags: string[];
  /** If provided, tags show a dropdown menu (show / addFilter) and stop click propagation. */
  onTagClick?: (tag: string, action: 'show' | 'addFilter') => void;
  /** Extra class on the wrapper div */
  className?: string;
  /** Limit visible tags (rest shown as "+N") */
  maxVisible?: number;
}

/** Single hashtag with its own dropdown menu — keeps the menu prop stable per tag. */
function HashtagDropdown({
  tag,
  onTagClick,
  className,
}: {
  tag: string;
  onTagClick: (tag: string, action: 'show' | 'addFilter') => void;
  className: string;
}) {
  const { t } = useTranslation();

  const menu = useMemo<MenuProps>(
    () => ({
      items: [
        { key: 'show', label: t('news.list.tag_show'), icon: ICON_FILTER },
        { key: 'addFilter', label: t('news.list.tag_add_filter'), icon: ICON_PLUS },
      ],
      onClick: ({ key, domEvent }) => {
        domEvent.stopPropagation();
        onTagClick(tag, key as 'show' | 'addFilter');
      },
    }),
    [t, onTagClick, tag],
  );

  return (
    <Dropdown trigger={DROPDOWN_TRIGGER} menu={menu}>
      <Tag color="blue" className={className} style={CURSOR_POINTER_STYLE} onClick={STOP_PROPAGATION}>
        {tag}
      </Tag>
    </Dropdown>
  );
}

/**
 * Shared hashtag component used in NewsListItem (collapsed) and NewsDetailToolbar (expanded).
 * When `onTagClick` is provided each tag shows a dropdown instead of plain text.
 * Clicks always call `stopPropagation` so parent clickable areas (accordion collapse) are not triggered.
 */
export function NewsHashtags({ hashtags, onTagClick, className, maxVisible }: NewsHashtagsProps) {
  const { styles, cx } = useStyles();

  if (hashtags.length === 0) return null;

  const visible = maxVisible !== undefined ? hashtags.slice(0, maxVisible) : hashtags;
  const overflow = maxVisible !== undefined ? hashtags.length - maxVisible : 0;

  return (
    <div className={cx(styles.tags, className)}>
      {visible.map((tag) =>
        onTagClick ? (
          <HashtagDropdown key={tag} tag={tag} onTagClick={onTagClick} className={styles.tag} />
        ) : (
          <Tag key={tag} color="blue" className={styles.tag} onClick={STOP_PROPAGATION}>
            {tag}
          </Tag>
        ),
      )}
      {overflow > 0 && <Tag className={styles.tag}>+{overflow}</Tag>}
    </div>
  );
}
