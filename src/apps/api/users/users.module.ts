import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersModule as SharedUsersModule } from '@/shared/users-service/users.module';

@Module({
  imports: [SharedUsersModule],
  controllers: [UsersController],
  providers: [],
  exports: [],
})
export class UsersModule {}
