import React from 'react'
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { SmtpClient } from './transport/smtp.client'
import { renderEmail } from './templates/render'
import { EmailTemplate, EmailTemplateProps } from './templates/WithButton'
import { EmailFromAddressMap, InvoiceEmailPayload, SendEmailOptions } from './email.types'
import { EMAIL_FROM_KEYS, EmailFromKey } from './email.constants'
import { createClient } from 'redis'

@Injectable()
export class EmailService {
  constructor(
    private smtp: SmtpClient,
    private config: ConfigService,
  ) { }

  private readonly logger = new Logger(EmailService.name)
  private hasValidatedFromAddressMap = false

  private getDefaultFrom() {
    return this.config.get<string>('from')
  }

  private getEmailQueueConfig() {
    const redisUrl = this.config.get<string>('emailQueue.redisUrl')
    const key = this.config.get<string>('emailQueue.key')
    const internalToken = this.config.get<string>('emailQueue.internalToken')
    const fromAddressMap = this.config.get<EmailFromAddressMap | undefined>('emailQueue.fromAddressMap')
    const fromName = this.config.get<string>('emailQueue.fromName')

    if (!redisUrl || !key || !internalToken || !fromAddressMap || !fromName) {
      throw new Error('Email queue config is incomplete')
    }

    if (!this.hasValidatedFromAddressMap) {
      this.validateFromAddressMap(fromAddressMap)
      this.hasValidatedFromAddressMap = true
    }

    return {
      redisUrl,
      key,
      internalToken,
      fromAddressMap,
      fromName,
    }
  }

  private validateFromAddressMap(fromAddressMap: EmailFromAddressMap) {
    const requiredKeys = Object.values(EMAIL_FROM_KEYS)
    const missingKeys = requiredKeys.filter((key) => !fromAddressMap[key])
    if (missingKeys.length > 0) {
      this.logger.warn(`EMAIL_FROM_ADDRESS_MAP missing keys: ${missingKeys.join(', ')}`)
    }
  }

  private async enqueueEmail(payload: InvoiceEmailPayload) {
    const { redisUrl, key } = this.getEmailQueueConfig()
    const client = createClient({ url: redisUrl })
    try {
      await client.connect()
      await client.rPush(key, JSON.stringify(payload))
    } finally {
      if (client.isOpen) {
        await client.quit()
      }
    }
  }

  async send(options: SendEmailOptions) {
    return this.smtp.send({
      from: options.from ?? this.getDefaultFrom(),
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text,
    })
  }

  async sendVerifyEmail(params: {
    to: string
    name: string
    link: string
    subject: string
    fromKey: EmailFromKey
    from?: string
  }) {
    const props: EmailTemplateProps = {
      title: 'Activate your DuitRapi account',
      greeting: `Hello ${params.name},`,
      bodyText: 'We received a request to verify your email address. Click the button below to confirm your account and get started managing your finances securely.',
      buttonText: 'Activate Account',
      buttonUrl: params.link,
      footerText: 'If you didn\'t request this, you can safely ignore this email.',
      iconType: 'verify',
    }

    const html = await renderEmail(
      React.createElement(EmailTemplate, props),
    )
  
    // return html.toString()

    const queueConfig = this.getEmailQueueConfig()
    const fromAddress = queueConfig.fromAddressMap[params.fromKey]
    if (!fromAddress) {
      throw new Error(`Email from address not found for key: ${params.fromKey}`)
    }

    const payload: InvoiceEmailPayload = {
      from: {
        address: fromAddress,
        name: queueConfig.fromName,
      },
      to: [
        {
          email_address: {
            address: params.to,
            name: params.name?.trim() || params.to,
          },
        },
      ],
      subject: params.subject,
      htmlbody: html,
      internal_token: queueConfig.internalToken,
    }

    await this.enqueueEmail(payload)

    return {
      queued: true,
    }
  }
}
