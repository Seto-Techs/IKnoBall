export interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface InvoiceEmailPayload {
  from: {
    address: string;
    name: string;
  };
  to: Array<{
    email_address: {
      address: string;
      name: string;
    };
  }>;
  subject: string;
  htmlbody: string;
  internal_token: string;
}

export type EmailFromAddressMap = Record<string, string>;
