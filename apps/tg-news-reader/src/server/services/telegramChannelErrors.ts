const unavailableCode =
  /\b(?:CHANNEL_PRIVATE|CHANNEL_INVALID|CHANNEL_PUBLIC_GROUP_NA|USERNAME_INVALID|USERNAME_NOT_OCCUPIED|USER_BANNED_IN_CHANNEL)\b/;

export function isUnavailableTelegramChannelError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const rpcMessage = 'errorMessage' in error ? error.errorMessage : undefined;
  return (
    (typeof rpcMessage === 'string' && unavailableCode.test(rpcMessage)) ||
    unavailableCode.test(error.message) ||
    /^No user has "[^"]+" as username$/.test(error.message)
  );
}

export class ChannelUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Telegram channel is unavailable (deleted, private, or inaccessible)', { cause });
    this.name = 'ChannelUnavailableError';
  }
}
