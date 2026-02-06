import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly configService: ConfigService) {
    const port = this.configService.get<number>('EMAIL_PORT');
    this.transporter = nodemailer.createTransport({
      host: this.configService.get<string>('EMAIL_HOST'),
      port,
      secure: port === 465, // true for 465, false for other ports
      auth: {
        user: this.configService.get<string>('EMAIL_USER'),
        pass: this.configService.get<string>('EMAIL_PASS'),
      },
    });
  }

  async sendMail(to: string, subject: string, html: string) {
    try {
      const from = this.configService.get<string>('EMAIL_USER');
      await this.transporter.sendMail({
        from: `"Catchy Support" <${from}>`,
        to,
        subject,
        html,
      });
      this.logger.log(`Email sent to ${to}`);
    } catch (error) {
      this.logger.error(`Failed to send email to ${to}`, error.stack);
      throw error;
    }
  }

  async sendOtpEmail(to: string, otp: string) {
    const subject = 'Your Password Reset OTP';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px;">
        <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
        <p style="font-size: 16px; color: #555;">Hello,</p>
        <p style="font-size: 16px; color: #555;">You requested a password reset. Please use the following One-Time Password (OTP) to reset your password. This OTP is valid for <b>2 minutes</b>.</p>
        <div style="background-color: #f4f4f4; padding: 15px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; color: #007bff; border-radius: 5px; margin: 20px 0;">
          ${otp}
        </div>
        <p style="font-size: 14px; color: #888;">If you did not request this, please ignore this email or contact support.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="font-size: 12px; color: #aaa; text-align: center;">&copy; ${new Date().getFullYear()} Catchy. All rights reserved.</p>
      </div>
    `;

    await this.sendMail(to, subject, html);
  }
}
