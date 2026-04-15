export const emailConfig = () => ({
  smtp: {
    host: process.env.EMAIL_SMTP_HOST,
    port: Number(process.env.EMAIL_SMTP_PORT || 465),
    user: process.env.EMAIL_SMTP_USER,
    pass: process.env.EMAIL_SMTP_PASS,
    secure: true,
  },
  from: 'DuitRapi <no-reply@setotechs.com>',
  emailQueue: {
    redisUrl: process.env.EMAIL_QUEUE_REDIS_URL,
    key: process.env.EMAIL_QUEUE_KEY,
    internalToken: process.env.EMAIL_INTERNAL_TOKEN,
    fromAddressMap: process.env.EMAIL_FROM_ADDRESS_MAP
      ? JSON.parse(process.env.EMAIL_FROM_ADDRESS_MAP)
      : undefined,
    fromName: process.env.EMAIL_FROM_NAME,
  },
})
