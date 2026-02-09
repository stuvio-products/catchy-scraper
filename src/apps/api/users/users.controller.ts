import {
  Body,
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  UseGuards,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { UsersRepository } from '@/shared/users-service/users.repository';
import { JwtAuthGuard } from '@/apps/api/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/apps/api/auth/decorators/current-user.decorator';
import { CreateUserStyleProfileDto } from '@/shared/users-service/dto/create-user-style-profile.dto';
import { UpdateUserDto } from '@/shared/users-service/dto/update-user.dto';
import { UserMapper } from '@/shared/users-service/mappers/user.mapper';
import type { User } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly userMapper: UserMapper,
  ) {}

  @Delete('me')
  @UseGuards(JwtAuthGuard)
  async deleteMe(@CurrentUser() user: User) {
    return this.usersRepository.softDelete(user.id);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  async updateMe(@CurrentUser() user: User, @Body() body: UpdateUserDto) {
    if (Object.keys(body).length === 0) {
      throw new BadRequestException('At least one field must be provided');
    }

    if (body.email && body.email !== user.email) {
      const existingUser = await this.usersRepository.findByEmail(body.email);
      if (existingUser) {
        throw new ConflictException('Email already in use');
      }
    }

    if (body.username && body.username !== user.username) {
      const existingUsername = await this.usersRepository.findByUsername(
        body.username,
      );
      if (existingUsername) {
        throw new ConflictException('Username already in use');
      }
    }

    const updatedUser = await this.usersRepository.update(user.id, body);
    return this.userMapper.toDto(updatedUser);
  }

  // User Style Profile endpoints

  @Post('me/style-profile')
  @UseGuards(JwtAuthGuard)
  async createOrUpdateStyleProfile(
    @CurrentUser() user: User,
    @Body() body: CreateUserStyleProfileDto,
  ) {
    const styleProfile = await this.usersRepository.createOrUpdateStyleProfile(
      user.id,
      body,
    );
    return this.userMapper.toStyleProfileDto(user.username, styleProfile);
  }

  @Get('me/style-profile')
  @UseGuards(JwtAuthGuard)
  async getMyStyleProfile(@CurrentUser() user: User) {
    const styleProfile = await this.usersRepository.findStyleProfileByUserId(
      user.id,
    );
    return styleProfile
      ? this.userMapper.toStyleProfileDto(user.username, styleProfile)
      : null;
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: User) {
    const userWithProfile = await this.usersRepository.findByIdWithStyleProfile(
      user.id,
    );
    return userWithProfile
      ? this.userMapper.toWithStyleProfileDto(userWithProfile)
      : null;
  }
}
