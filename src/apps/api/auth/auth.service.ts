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
import { UserLogsRepository } from '@/shared/user-logs/user-logs.repository';

@Injectable()
export class AuthService {
  private readonly SALT_ROUNDS = 10;

  constructor(
    private readonly usersRepository: UsersRepository,
    private readonly authMapper: AuthMapper,
    private readonly otpService: OtpService,
    private readonly mailService: MailService,
    private readonly userLogsRepository: UserLogsRepository,
  ) {}

  async signup(signupDto: SignupDto, ipAddress?: string) {
    const { email, password, firstName, lastName } = signupDto;
    let { username } = signupDto;

    // Check if user already exists
    const existingUser = await this.usersRepository.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (username) {
      const existingUsername = await this.usersRepository.findByUsername(username);
      if (existingUsername) {
        throw new ConflictException('Username is already taken');
      }
    } else {
      // Generate username if not provided
      // For now we will use a UUID, but we will replace it with a more readable random string later if needed
      // Since we need to know the ID for the username pattern "catchy-{userId}", we will generate the ID first
      // But wait, "catchy-{userId}" might be too long.
      // Requirements: "if user dont provide it, keep user id as username like this - catchy-userid"
      // So calculate ID first, then set username.
    }

    // Hash the password
    const passwordHash = await bcrypt.hash(password, this.SALT_ROUNDS);

    // Generate ID
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();

    if (!username) {
      username = `catchy-${firstName.toLowerCase()}-${lastName.toLowerCase()}-${Math.random()
        .toString(36)
        .substring(7)}`;
    }

    // Create the user
    const user = await this.usersRepository.create({
      id,
      email,
      username,
      passwordHash,
      firstName,
      lastName,
    });

    // Log the signup action
    await this.userLogsRepository.createLog({
      userId: user.id,
      action: 'SIGNUP',
      ipAddress,
      details: { email: user.email },
    });

    return this.authMapper.toAuthResponse(user);
  }

  async login(loginDto: LoginDto, ipAddress?: string) {
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

    // Log the login action
    await this.userLogsRepository.createLog({
      userId: user.id,
      action: 'LOGIN',
      ipAddress,
      details: { email: user.email },
    });

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
