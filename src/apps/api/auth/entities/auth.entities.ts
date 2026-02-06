import { User } from '@prisma/client';

export class GoogleResponse {
  sub: string;
  name?: string;
  given_name: string;
  family_name: string;
  picture?: string;
  email?: string;
  email_verified: boolean;
  hd: string;
}

export class AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
}

export class UserWithToken {
  accessToken: string;
  user: AuthenticatedUser;
}

export type RequestUser = Pick<
  User,
  'id' | 'email' | 'firstName' | 'lastName' | 'createdAt'
>;
