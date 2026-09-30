import { Tag } from 'antd';
import React, { useCallback } from 'react';

const CURSOR_POINTER = { cursor: 'pointer' as const };

// Explicit type guard — avoids IDE false-positive "ReactNode can't be string"
const isString = (v: unknown): v is string => typeof v === 'string';

// Matches both [N] and [N,M,P] (model sometimes groups refs despite instructions)
const REF_SPLIT = /(\[\d[\d,\s]*])/g;
const REF_PARSE = /^\[(\d[\d,\s]*)]$/;

/** Single clickable citation chip — stable click handler bound to its newsId. */
function RefChip({
  label,
  newsId,
  onRefClick,
  className,
}: {
  label: number;
  newsId: number;
  onRefClick: (newsId: number) => void;
  className: string;
}) {
  const handleClick = useCallback(() => onRefClick(newsId), [onRefClick, newsId]);
  return (
    <Tag color="blue" className={className} style={CURSOR_POINTER} onClick={handleClick}>
      {label}
    </Tag>
  );
}

/**
 * Recursively walks React children, replacing [N] citation markers with
 * clickable Tag chips that navigate to the referenced news item.
 *
 * Works with any depth of React element nesting (e.g. [1] inside <strong>
 * inside <li> inside <p> is handled correctly via React.cloneElement).
 *
 * @param children   - ReactNode passed to a ReactMarkdown component renderer
 * @param refMap     - citation index → newsId (1-based)
 * @param onRefClick - called with the newsId when a chip is clicked
 * @param chipClass  - CSS class applied to each chip Tag
 */
export function inlineRefs(
  children: React.ReactNode,
  refMap: Record<number, number>,
  onRefClick: (newsId: number) => void,
  chipClass: string,
): React.ReactNode {
  if (isString(children)) {
    const parts = children.split(REF_SPLIT);
    if (parts.length === 1) return children; // fast path: no [N] in this string

    const result: React.ReactNode[] = [];
    let key = 0;

    for (const part of parts) {
      const m = REF_PARSE.exec(part);
      if (m) {
        const nums = m[1]
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

        for (const n of nums) {
          const newsId = refMap[n];
          if (newsId !== null && newsId !== undefined) {
            result.push(
              <RefChip key={key++} label={n} newsId={newsId} onRefClick={onRefClick} className={chipClass} />,
            );
          } else {
            result.push(<React.Fragment key={key++}>[{n}]</React.Fragment>);
          }
        }
      } else {
        if (part) result.push(part);
      }
    }

    return result;
  }

  if (Array.isArray(children)) {
    // Parsed React tree nodes have no stable identity — index key is the correct choice here
    // oxlint-disable-next-line react/no-array-index-key
    return (children as React.ReactNode[]).map((child, i) => (
      // oxlint-disable-next-line react/no-array-index-key
      <React.Fragment key={i}>{inlineRefs(child, refMap, onRefClick, chipClass)}</React.Fragment>
    ));
  }

  if (React.isValidElement<{ children?: React.ReactNode }>(children)) {
    const el = children as React.ReactElement<{ children?: React.ReactNode }>;
    const processed = inlineRefs(el.props.children, refMap, onRefClick, chipClass);
    if (processed === el.props.children) return el; // nothing changed — skip cloneElement
    return React.cloneElement(el, { children: processed } as Record<string, unknown>);
  }

  return children;
}
