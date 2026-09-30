import {
  DeleteOutlined,
  EditOutlined,
  InfoCircleOutlined,
  LinkOutlined,
  MoreOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { Channel } from '@shared/types.ts';
import { Button, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

const ICON_MORE = <MoreOutlined />;
const ICON_LINK = <LinkOutlined />;
const ICON_EDIT = <EditOutlined />;
const ICON_DELETE = <DeleteOutlined />;
const TRIGGER: 'click'[] = ['click'];
const stopPropagation = (e: React.MouseEvent) => e.stopPropagation();

interface Props {
  channel: Channel;
  isFetching: boolean;
  onFetch: (channel: Channel) => void;
  onEdit: (channel: Channel) => void;
  onDelete: (channel: Channel) => void;
  onInfo?: () => void;
}

export function ChannelItemMenu({ channel, isFetching, onFetch, onEdit, onDelete, onInfo }: Props) {
  const { t } = useTranslation();
  const menu = useMemo<MenuProps>(
    () => ({
      items: [
        ...(onInfo
          ? [
              {
                key: 'info',
                icon: <InfoCircleOutlined />,
                label: t('channels.info.title'),
                onClick: ({ domEvent }: { domEvent: React.MouseEvent | React.KeyboardEvent }) => {
                  domEvent.stopPropagation();
                  onInfo();
                },
              },
            ]
          : []),
        {
          key: 'open',
          icon: ICON_LINK,
          label: (
            <a href={`https://t.me/${channel.telegramId}`} target="_blank" rel="noopener noreferrer">
              {t('channels.open_tg_tooltip')}
            </a>
          ),
        },
        {
          key: 'fetch',
          icon: <ReloadOutlined spin={isFetching} />,
          label: t('channels.fetch_tooltip'),
          disabled: isFetching,
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
            onFetch(channel);
          },
        },
        {
          key: 'edit',
          icon: ICON_EDIT,
          label: t('channels.edit_tooltip'),
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
            onEdit(channel);
          },
        },
        {
          key: 'delete',
          icon: ICON_DELETE,
          label: t('channels.delete_tooltip'),
          danger: true,
          onClick: ({ domEvent }) => {
            domEvent.stopPropagation();
            onDelete(channel);
          },
        },
      ],
      onClick: ({ domEvent }) => domEvent.stopPropagation(),
    }),
    [channel, isFetching, onFetch, onEdit, onDelete, onInfo, t],
  );
  return (
    <Dropdown menu={menu} trigger={TRIGGER} placement="bottomRight" destroyOnHidden>
      <Button
        icon={ICON_MORE}
        size="small"
        type="text"
        onClick={stopPropagation}
        aria-label={t('channels.info.actions')}
      />
    </Dropdown>
  );
}
