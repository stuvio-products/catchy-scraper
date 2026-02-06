import { IsString, IsEmail, MinLength } from 'class-validator';

export class ResetForgottenPasswordDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6, { message: 'OTP must be 6 digits' })
  otp: string;

  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  newPassword: string;
}
