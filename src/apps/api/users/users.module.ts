import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersModule as SharedUsersModule } from '@/shared/users-service/users.module';

import { UserLogsModule } from '@/shared/user-logs/user-logs.module';

@Module({
  imports: [SharedUsersModule, UserLogsModule],
  controllers: [UsersController],
  providers: [],
  exports: [],
})
export class UsersModule {}
