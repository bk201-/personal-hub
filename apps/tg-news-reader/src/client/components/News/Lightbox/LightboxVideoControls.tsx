import { RotateLeftOutlined, RotateRightOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface LightboxVideoControlsProps {
  className: string;
  onRotate: (direction: -1 | 1) => void;
}

export function LightboxVideoControls({ className, onRotate }: LightboxVideoControlsProps) {
  const { t } = useTranslation();
  const left = useCallback(() => onRotate(-1), [onRotate]);
  const right = useCallback(() => onRotate(1), [onRotate]);
  return (
    <>
      <Button
        size="small"
        className={className}
        icon={<RotateLeftOutlined />}
        onClick={left}
        title={t('lightbox.rotate_left')}
        aria-label={t('lightbox.rotate_left')}
      />
      <Button
        size="small"
        className={className}
        icon={<RotateRightOutlined />}
        onClick={right}
        title={t('lightbox.rotate_right')}
        aria-label={t('lightbox.rotate_right')}
      />
    </>
  );
}
