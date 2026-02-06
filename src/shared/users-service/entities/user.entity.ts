import { User, UserStyleProfile } from '@prisma/client';

export type UserEntity = User;

export type UserStyleProfileEntity = UserStyleProfile;

export type UserWithStyleProfile = User & {
  styleProfile?: UserStyleProfile | null;
};
