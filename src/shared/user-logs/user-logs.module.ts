import { Module } from '@nestjs/common';
import { UserLogsRepository } from './user-logs.repository';
import { PrismaModule } from '@/shared/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [UserLogsRepository],
  exports: [UserLogsRepository],
})
export class UserLogsModule {}
