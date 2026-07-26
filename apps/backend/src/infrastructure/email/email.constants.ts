export const EMAIL_FROM_KEYS = {
  verify: 'verify',
  reset: 'reset',
  loginOtp: 'loginOtp',
  reminder: 'reminder',
} as const;

export type EmailFromKey = (typeof EMAIL_FROM_KEYS)[keyof typeof EMAIL_FROM_KEYS];
