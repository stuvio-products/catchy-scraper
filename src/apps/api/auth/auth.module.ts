import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AuthMapper } from './auth.mapper';
import { UsersModule } from '@/shared/users-service/users.module';
import { OtpService } from './otp/otp.service';
import { PrismaModule } from '@/shared/prisma/prisma.module';
import { UserLogsModule } from '@/shared/user-logs/user-logs.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('JWT_SECRET'),
        signOptions: { expiresIn: '7d' },
      }),
      inject: [ConfigService],
    }),
    UsersModule,
    PrismaModule,
    UserLogsModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthMapper, JwtStrategy, OtpService],
  exports: [AuthService, JwtModule, OtpService],
})
export class AuthModule {}
