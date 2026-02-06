import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UsersRepository } from '@/shared/users-service/users.repository';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { AuthMapper } from './auth.mapper';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetForgottenPasswordDto } from './dto/reset-forgotten-password.dto';
import { OtpService } from './otp/otp.service';
import { OtpType } from '@prisma/client';
import { MailService } from '@/shared/mail/mail.service';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authMapper: AuthMapper,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
  ) {}

  async signup(signupDto: SignupDto) {
    const { email, password, firstName, lastName } = signupDto;

    // Check if user already exists
    const existingUser = await this.usersRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    // Create the user
    const user = await this.usersRepository.create({
      email,
      passwordHash,
      firstName,
      lastName,
    });

    return this.authMapper.toAuthResponse(user);
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;

    // Find user by email
    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.isDeleted) {
      throw new UnauthorizedException('Account has been deleted');
    }

    // Check if user has a password (might be Google login)
    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses a different login method',
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.authMapper.toAuthResponse(user);
  }

  async refreshAuth(userId: string) {
    const user = await this.usersRepository.findById(userId);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.authMapper.toAuthResponse(user);
  }

  async resetPassword(userId: string, resetPasswordDto: ResetPasswordDto) {
    const { oldPassword, newPassword, confirmNewPassword } = resetPasswordDto;

    if (newPassword !== confirmNewPassword) {
      throw new BadRequestException('Passwords do not match');
    }

    const user = await this.usersRepository.findById(userId);
    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('User not found or has no password');
    }

    const isPasswordValid = await bcrypt.compare(
      oldPassword,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new BadRequestException('Invalid old password');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.usersRepository.update(userId, { passwordHash });

    return { message: 'Password reset successful' };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    const { email } = forgotPasswordDto;

    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      // For security reasons, don't reveal if user exists
      return {
        message: 'If your email is registered, you will receive an OTP',
      };
    }

    const otp = await this.otpService.generateOtp(
      user.id,
      OtpType.RESET_PASSWORD,
    );

    // Send OTP via email
    await this.mailService.sendOtpEmail(email, otp);

    return { message: 'OTP sent to your email' };
  }

  async resetForgottenPassword(
    resetForgottenPasswordDto: ResetForgottenPasswordDto,
  ) {
    const { email, otp, newPassword } = resetForgottenPasswordDto;

    const user = await this.usersRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const isValid = await this.otpService.verifyOtp(
      user.id,
      OtpType.RESET_PASSWORD,
      otp,
    );
    if (!isValid) {
      throw new BadRequestException('Invalid or expired OTP');
    }

    const passwordHash = await bcrypt.hash(newPassword, this.SALT_ROUNDS);
    await this.usersRepository.update(user.id, { passwordHash });

    return { message: 'Password has been reset successfully' };
  }

  async resendOtp(forgotPasswordDto: ForgotPasswordDto) {
    return this.forgotPassword(forgotPasswordDto);
  }
}
