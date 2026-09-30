import { VersionBanner as SharedVersionBanner } from '@personal-hub/browser/version';
import { useTranslation } from 'react-i18next';
import { useVersionCheck } from '../../hooks/useVersionCheck';

export function VersionBanner() {
  const { t } = useTranslation();
  const version = useVersionCheck();
  return (
    <SharedVersionBanner
      {...version}
      message={t('common.newVersionAvailable')}
      reloadLabel={t('common.newVersionReload')}
      dismissLabel={t('common.close')}
    />
  );
}
