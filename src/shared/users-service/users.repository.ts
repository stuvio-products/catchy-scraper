import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { User, UserStyleProfile } from '@prisma/client';
import { CreateUserStyleProfileDto } from './dto/create-user-style-profile.dto';
import { UserWithStyleProfile } from './entities/user.entity';

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  // User methods
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.client.user.findUnique({
      where: { email },
    });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.client.user.findUnique({
      where: { id },
    });
  }

  async findByIdWithStyleProfile(
    id: string,
  ): Promise<UserWithStyleProfile | null> {
    return this.prisma.client.user.findUnique({
      where: { id },
      include: {
        styleProfile: true,
      },
    });
  }

  async create(data: {
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    return this.prisma.client.user.create({
      data: {
        email: data.email,
        passwordHash: data.passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        loginType: 'PASSWORD',
      },
    });
  }

  async softDelete(id: string): Promise<User> {
    return this.prisma.client.user.update({
      where: { id },
      data: { isDeleted: true },
    });
  }

  async update(id: string, data: Partial<User>): Promise<User> {
    return this.prisma.client.user.update({
      where: { id },
      data,
    });
  }

  // User Style Profile methods
  async createOrUpdateStyleProfile(
    userId: string,
    data: CreateUserStyleProfileDto,
  ): Promise<UserStyleProfile> {
    return this.prisma.client.userStyleProfile.upsert({
      where: { userId },
      update: {
        ...data,
      },
      create: {
        userId,
        ...data,
      },
    });
  }

  async findStyleProfileByUserId(
    userId: string,
  ): Promise<UserStyleProfile | null> {
    return this.prisma.client.userStyleProfile.findUnique({
      where: { userId },
    });
  }
}
