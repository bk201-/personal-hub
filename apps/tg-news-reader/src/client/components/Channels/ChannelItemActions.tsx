import { InfoCircleOutlined } from '@ant-design/icons';
import type { Channel } from '@shared/types.ts';
import { Button, Popover } from 'antd';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsMd } from '../../hooks/breakpoints';
import { ChannelInfoContent } from './ChannelInfoContent';
import { ChannelItemMenu } from './ChannelItemMenu';

const ICON_INFO = <InfoCircleOutlined />;
const HOVER_TRIGGER: 'hover'[] = ['hover'];
const NO_TRIGGER: 'hover'[] = [];
// Ant Design opens hover popovers on touchstart; explicit clicks own touch activation.
const stopTouch = (e: React.TouchEvent) => e.stopPropagation();

interface Props {
  channel: Channel;
  isFetching: boolean;
  onFetch: (channel: Channel) => void;
  onEdit: (channel: Channel) => void;
  onDelete: (channel: Channel) => void;
}

export function ChannelItemActions({ channel, ...menuProps }: Props) {
  const { t } = useTranslation();
  const isMobile = !useIsMd();
  const [infoMode, setInfoMode] = useState<'closed' | 'hover' | 'pinned'>('closed');
  const infoOpen = infoMode !== 'closed';
  const closeInfo = useCallback(() => setInfoMode('closed'), []);
  const openInfo = useCallback(() => setInfoMode('pinned'), []);
  const toggleInfo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setInfoMode((mode) => (mode === 'pinned' ? 'closed' : 'pinned'));
  }, []);
  const handleInfoHover = useCallback(
    (open: boolean) => {
      if (isMobile) return;
      setInfoMode((mode) => (mode === 'pinned' ? mode : open ? 'hover' : 'closed'));
    },
    [isMobile],
  );
  const infoContent = useMemo(
    () => (
      <>
        {infoOpen && (
          <ChannelInfoContent channel={channel} onClose={closeInfo} showClose={isMobile || infoMode === 'pinned'} />
        )}
      </>
    ),
    [channel, infoOpen, infoMode, closeInfo, isMobile],
  );
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && infoOpen) {
        e.stopPropagation();
        closeInfo();
      }
    },
    [closeInfo, infoOpen],
  );
  const menu = <ChannelItemMenu channel={channel} {...menuProps} onInfo={isMobile ? openInfo : undefined} />;

  return (
    <>
      <Popover
        content={infoContent}
        open={infoOpen}
        onOpenChange={handleInfoHover}
        trigger={isMobile ? NO_TRIGGER : HOVER_TRIGGER}
        mouseEnterDelay={0.4}
        placement={isMobile ? 'bottomRight' : 'right'}
        destroyOnHidden
        fresh
      >
        <span onKeyDown={handleKeyDown}>
          {isMobile ? (
            menu
          ) : (
            <Button
              icon={ICON_INFO}
              size="small"
              type="text"
              onClick={toggleInfo}
              onTouchStart={stopTouch}
              aria-label={t('channels.info.open', { name: channel.name })}
              aria-expanded={infoOpen}
              aria-haspopup="dialog"
            />
          )}
        </span>
      </Popover>
      {!isMobile && menu}
    </>
  );
}
