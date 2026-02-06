import { Module } from '@nestjs/common';
import { PrismaModule } from '@/shared/prisma/prisma.module';
import { UsersRepository } from './users.repository';
import { UserMapper } from './mappers/user.mapper';

@Module({
  imports: [PrismaModule],
  providers: [UsersRepository, UserMapper],
  exports: [UsersRepository, UserMapper],
})
export class UsersModule {}
