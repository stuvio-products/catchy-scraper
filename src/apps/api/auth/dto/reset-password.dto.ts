import { IsString, MinLength, Matches } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  oldPassword: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  newPassword: string;

  @IsString()
  @MinLength(8, {
    message: 'Confirm password must be at least 8 characters long',
  })
  confirmNewPassword: string;
}
