import { Injectable } from '@nestjs/common';
import { User } from '@prisma/client';
import { AuthenticatedUser, UserWithToken } from './entities/auth.entities';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthMapper {
  constructor(private readonly jwtService: JwtService) {}

  toAuthenticatedUser(user: User): AuthenticatedUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
    };
  }

  toAuthResponse(user: User): UserWithToken {
    return {
      accessToken: this.generateToken(user.id, user.email),
      user: this.toAuthenticatedUser(user),
    };
  }

  private generateToken(userId: string, email: string): string {
    const payload = { sub: userId, email };
    return this.jwtService.sign(payload, { expiresIn: '30d' });
  }
}
