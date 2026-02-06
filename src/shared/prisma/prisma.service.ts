import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { prisma, ExtendedPrismaClient } from '@/shared/prisma/prisma-client.provider';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  // This is your gateway to the DB with Read Replicas
  public readonly client: ExtendedPrismaClient = prisma;

  async onModuleInit(): Promise<void> {
    // Connects to the database when the module starts
    await (this.client as unknown as { $connect(): Promise<void> }).$connect();
  }

  async onModuleDestroy(): Promise<void> {
    // Closes the connection pool when the app shuts down
    await (
      this.client as unknown as { $disconnect(): Promise<void> }
    ).$disconnect();
  }
}
