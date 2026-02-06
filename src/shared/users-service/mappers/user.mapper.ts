import { Injectable } from '@nestjs/common';
import { User, UserStyleProfile } from '@prisma/client';
import { UserWithStyleProfile } from '../entities/user.entity';

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
}

export interface UserStyleProfileDto {
  genderPreference?: string;
  styleVibe?: string[];
  favoriteColorsHex?: string[];
  topSize?: string;
  bottomSize?: string;
  shoeSize?: string;
  favoriteBrands?: string[];
}

export interface UserWithStyleProfileDto extends UserDto {
  styleProfile?: UserStyleProfileDto | null;
}

@Injectable()
export class UserMapper {
  toDto(user: User): UserDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
    };
  }

  toStyleProfileDto(styleProfile: UserStyleProfile): UserStyleProfileDto {
    return {
      genderPreference: styleProfile.genderPreference ?? undefined,
      styleVibe: styleProfile.styleVibe as string[],
      favoriteColorsHex: styleProfile.favoriteColorsHex as string[],
      topSize: styleProfile.topSize ?? undefined,
      bottomSize: styleProfile.bottomSize ?? undefined,
      shoeSize: styleProfile.shoeSize ?? undefined,
      favoriteBrands: styleProfile.favoriteBrands as string[],
    };
  }

  toWithStyleProfileDto(user: UserWithStyleProfile): UserWithStyleProfileDto {
    return {
      ...this.toDto(user),
      styleProfile: user.styleProfile
        ? this.toStyleProfileDto(user.styleProfile)
        : null,
    };
  }
}
