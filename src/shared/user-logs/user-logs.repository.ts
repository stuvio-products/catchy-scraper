import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { UserLog } from '@/generated/prisma/client';

@Injectable()
export class UserLogsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createLog(data: {
    userId: string;
    action: string;
    ipAddress?: string;
    details?: any;
  }): Promise<UserLog> {
    return this.prisma.client.userLog.create({
      data: {
        userId: data.userId,
        action: data.action,
        ipAddress: data.ipAddress,
        details: data.details,
      },
    });
  }

  async findByUserId(userId: string): Promise<UserLog[]> {
    return this.prisma.client.userLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
