import { useVersionCheck as useSharedVersionCheck } from '@personal-hub/browser/version';
import type { VersionCheckOptions } from '@personal-hub/browser/version';
import { APP_BUILD_ID } from '../appVersion';

export function useVersionCheck(options: Partial<VersionCheckOptions> = {}) {
  return useSharedVersionCheck({
    clientBuildId: APP_BUILD_ID,
    isDev: import.meta.env.DEV,
    ...options,
  });
}
