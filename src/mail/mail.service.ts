import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';
import type { AppConfig } from '../config/index.js';

interface InviteEmailOptions {
  orgName: string;
  inviterName: string;
  roleLabel: string;
  inviteUrl: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly resend: Resend;
  private readonly from: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.resend = new Resend(this.config.get('resendApiKey', { infer: true }));
    this.from = this.config.get('resendFrom', { infer: true });
  }

  async sendInvite(to: string, opts: InviteEmailOptions): Promise<void> {
    await this.send(to, opts, false);
  }

  async sendInviteReminder(
    to: string,
    opts: InviteEmailOptions,
  ): Promise<void> {
    await this.send(to, opts, true);
  }

  private async send(
    to: string,
    opts: InviteEmailOptions,
    isReminder: boolean,
  ): Promise<void> {
    const subject = isReminder
      ? `Reminder: You've been invited to join ${opts.orgName}`
      : `You've been invited to join ${opts.orgName}`;

    const { error } = await this.resend.emails.send({
      from: this.from,
      to,
      subject,
      html: this.buildHtml(opts, isReminder),
    });

    if (error) {
      this.logger.error(
        `Failed to send invite email to ${to}: ${error.message}`,
      );
      throw new Error(`Email delivery failed: ${error.message}`);
    }

    this.logger.log(`Invite email sent to ${to} for org "${opts.orgName}"`);
  }

  private buildHtml(opts: InviteEmailOptions, isReminder: boolean): string {
    const headline = isReminder
      ? `Reminder: You've been invited to join ${opts.orgName}`
      : `You've been invited to join ${opts.orgName}`;

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background:#1a1a2e;padding:32px 40px;">
              <p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.3px;">llmpath</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h1 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#111827;">${headline}</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#6b7280;line-height:1.6;">
                ${opts.inviterName} has invited you to join <strong>${opts.orgName}</strong> as a <strong>${opts.roleLabel}</strong>.
              </p>
              <p style="margin:0 0 32px;font-size:15px;color:#6b7280;line-height:1.6;">
                Click the button below to set up your account. This link expires in 7 days.
              </p>
              <!-- CTA -->
              <table cellpadding="0" cellspacing="0">
                <tr>
                  <td style="border-radius:6px;background:#2563eb;">
                    <a href="${opts.inviteUrl}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              <p style="margin:24px 0 0;font-size:13px;color:#9ca3af;">
                Or copy this link into your browser:<br />
                <a href="${opts.inviteUrl}" style="color:#2563eb;word-break:break-all;">${opts.inviteUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;border-top:1px solid #f3f4f6;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                If you weren't expecting this invitation, you can safely ignore this email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }
}
