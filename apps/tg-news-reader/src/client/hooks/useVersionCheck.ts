import { useVersionCheck as useSharedVersionCheck } from '@personal-hub/browser/version';
import type { VersionCheckOptions } from '@personal-hub/browser/version';
import { APP_BUILD_ID } from '../appVersion';

type UseVersionCheckOptions = Partial<VersionCheckOptions> & {
  /** Compatibility alias for callers that previously supplied the client identity. */
  clientVersion?: string;
};

export function useVersionCheck({ clientVersion, ...options }: UseVersionCheckOptions = {}) {
  return useSharedVersionCheck({
    clientBuildId: clientVersion ?? APP_BUILD_ID,
    isDev: import.meta.env.DEV,
    ...options,
  });
}
