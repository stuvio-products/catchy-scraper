import { Injectable } from '@nestjs/common';
import { User, UserStyleProfile } from '@prisma/client';
import { UserWithStyleProfile } from '../entities/user.entity';

export interface UserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  phone?: string;
  bio?: string;
  profileImage: string | null;
  username: string;
}

export interface SizePreference {
  men?: string;
  women?: string;
}

export interface UserStyleProfileDto {
  username: string;
  genderPreference?: string;
  styleVibe?: string[];
  favoriteColorsHex?: string[];
  topSize?: SizePreference;
  bottomSize?: SizePreference;
  shoeSize?: SizePreference;
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
      username: user.username,
      firstName: user.firstName,
      lastName: user.lastName,
      createdAt: user.createdAt,
      phone: user.phone ?? undefined,
      bio: user.bio ?? undefined,
      profileImage: user.profileImage,
    };
  }

  toStyleProfileDto(
    username: string,
    styleProfile: UserStyleProfile,
  ): UserStyleProfileDto {
    return {
      username,
      genderPreference: styleProfile.genderPreference ?? undefined,
      styleVibe: styleProfile.styleVibe as string[],
      favoriteColorsHex: styleProfile.favoriteColorsHex as string[],
      topSize: (styleProfile.topSize as unknown as SizePreference) ?? undefined,
      bottomSize:
        (styleProfile.bottomSize as unknown as SizePreference) ?? undefined,
      shoeSize: (styleProfile.shoeSize as unknown as SizePreference) ?? undefined,
      favoriteBrands: styleProfile.favoriteBrands as string[],
    };
  }

  toWithStyleProfileDto(user: UserWithStyleProfile): UserWithStyleProfileDto {
    return {
      ...this.toDto(user),
      styleProfile: user.styleProfile
        ? this.toStyleProfileDto(user.username, user.styleProfile)
        : null,
    };
  }
}
