import { Tooltip } from 'antd';
import type { TooltipProps } from 'antd';
import React from 'react';

/**
 * On coarse-pointer (touch) devices tooltips fire on every tap and block the UI.
 * This wrapper renders children directly on such devices, keeping the full
 * Tooltip behaviour on mouse-driven screens.
 *
 * Checked on every render (not cached at module load) so that Chrome DevTools
 * device emulation toggle is reflected immediately without a page reload.
 */
export function MaybeTooltip({ children, ...props }: TooltipProps) {
  const isCoarsePointer = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  if (isCoarsePointer) return <>{children}</>;
  return <Tooltip {...props}>{children}</Tooltip>;
}
