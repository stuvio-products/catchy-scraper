import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/shared/prisma/prisma.service';
import { User, UserStyleProfile } from '@/generated/prisma/client';
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

  async findByUsername(username: string): Promise<User | null> {
    return this.prisma.client.user.findUnique({
      where: { username },
    });
  }

  async create(data: {
    id: string;
    email: string;
    username: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
  }): Promise<User> {
    return this.prisma.client.user.create({
      data: {
        id: data.id,
        email: data.email,
        username: data.username,
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
        topSize: data.topSize as any,
        bottomSize: data.bottomSize as any,
        shoeSize: data.shoeSize as any,
      },
      create: {
        userId,
        ...data,
        topSize: data.topSize as any,
        bottomSize: data.bottomSize as any,
        shoeSize: data.shoeSize as any,
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
