import { RateLimitBanner as SharedRateLimitBanner } from '@personal-hub/browser/ui';
import { useTranslation } from 'react-i18next';
import { useRateLimitStore } from '../../store/rateLimitStore';

export function RateLimitBanner() {
  const { t } = useTranslation();
  const { until, clear } = useRateLimitStore();
  return (
    <SharedRateLimitBanner
      until={until}
      onExpired={clear}
      message={(secs) => t('rateLimit.message', { secs })}
      description={t('rateLimit.description')}
    />
  );
}
