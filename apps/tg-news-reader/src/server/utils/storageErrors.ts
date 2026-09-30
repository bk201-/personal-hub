export class StoragePausedError extends Error {
  readonly code = 'STORAGE_PAUSED';

  constructor(message: string) {
    super(message);
    this.name = 'StoragePausedError';
  }
}

export function isStorageCapacityError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ('code' in err && ['ENOSPC', 'EDQUOT', 'SQLITE_FULL', 'STORAGE_PAUSED'].includes(String(err.code))) return true;
  return (
    ('message' in err &&
      /ENOSPC|EDQUOT|SQLITE_FULL|STORAGE_PAUSED|no space left|disk full|disk quota exceeded/i.test(
        String(err.message),
      )) ||
    ('cause' in err && err.cause !== err && isStorageCapacityError(err.cause))
  );
}
