import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { OtpType } from '@/prisma/client';
import { getEnumKeyAsType } from '@/shared/lib/util';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class OtpService {
  private readonly SALT_ROUNDS = 10;
  private readonly OTP_EXPIRY_MINUTES = 2;
  private readonly THROTTLE_MINUTES = 1;

  constructor(private readonly prisma: PrismaService) {}

  async generateOtp(userId: string, type: OtpType): Promise<string> {
    // Check for throttle
    const lastOtp = await this.prisma.client.otp.findFirst({
      where: { userId, type: getEnumKeyAsType(OtpType, type) as OtpType },
      orderBy: { createdAt: 'desc' },
    });

    if (lastOtp) {
      const now = new Date();
      const diff = now.getTime() - lastOtp.createdAt.getTime();
      const diffMinutes = diff / (1000 * 60);

      if (diffMinutes < this.THROTTLE_MINUTES) {
        throw new BadRequestException(
          `Please wait ${Math.ceil(this.THROTTLE_MINUTES - diffMinutes)} minute(s) before requesting a new OTP`,
        );
      }

      // Delete existing OTP as per requirement: "same user generates an otp and there is existing one than delete it"
      await this.prisma.client.otp.deleteMany({
        where: { userId, type: getEnumKeyAsType(OtpType, type) as OtpType },
      });
    }

    // Generate 6-digit OTP
    const otp = crypto.randomInt(100000, 999999).toString();
    const hash = await bcrypt.hash(otp, this.SALT_ROUNDS);

    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

    await this.prisma.client.otp.create({
      data: {
        userId,
        type: getEnumKeyAsType(OtpType, type) as OtpType,
        hash,
        expiresAt,
      },
    });

    return otp;
  }

  async verifyOtp(
    userId: string,
    type: OtpType,
    otp: string,
  ): Promise<boolean> {
    const otpRecord = await this.prisma.client.otp.findFirst({
      where: {
        userId,
        type: getEnumKeyAsType(OtpType, type) as OtpType,
        expiresAt: { gt: new Date() },
      },
    });

    if (!otpRecord) return false;

    const isValid = await bcrypt.compare(otp, otpRecord.hash);

    if (isValid) {
      // Cleanup: "do proper cleanup of otp once used"
      await this.prisma.client.otp.delete({
        where: { id: otpRecord.id },
      });
    }

    return isValid;
  }

  async deleteExpiredOtps() {
    await this.prisma.client.otp.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
  }
}
