import { Controller, Post, Body, Get, UseGuards, Ip } from '@nestjs/common';
import { AuthService } from '@/apps/api/auth/auth.service';
import { SignupDto } from '@/apps/api/auth/dto/signup.dto';
import { LoginDto } from '@/apps/api/auth/dto/login.dto';
import { ResetPasswordDto } from '@/apps/api/auth/dto/reset-password.dto';
import { ForgotPasswordDto } from '@/apps/api/auth/dto/forgot-password.dto';
import { ResetForgottenPasswordDto } from '@/apps/api/auth/dto/reset-forgotten-password.dto';
import { JwtAuthGuard } from '@/apps/api/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/apps/api/auth/decorators/current-user.decorator';
import type { RequestUser } from '@/apps/api/auth/entities/auth.entities';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('signup')
  async signup(@Body() signupDto: SignupDto, @Ip() ip: string) {
    return this.authService.signup(signupDto, ip);
  }

  @Post('login')
  async login(@Body() loginDto: LoginDto, @Ip() ip: string) {
    return this.authService.login(loginDto, ip);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@CurrentUser() user: RequestUser) {
    console.log(user);

    return {
      id: user.id,
      email: user.email,
    };
  }

  @Post('refresh')
  @UseGuards(JwtAuthGuard)
  async refreshAuth(@CurrentUser() user: RequestUser) {
    return this.authService.refreshAuth(user.id);
  }

  @Post('reset-password')
  @UseGuards(JwtAuthGuard)
  async resetPassword(
    @CurrentUser() user: RequestUser,
    @Body() resetPasswordDto: ResetPasswordDto,
  ) {
    return this.authService.resetPassword(user.id, resetPasswordDto);
  }

  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-forgotten-password')
  async resetForgottenPassword(
    @Body() resetForgottenPasswordDto: ResetForgottenPasswordDto,
  ) {
    return this.authService.resetForgottenPassword(resetForgottenPasswordDto);
  }

  @Post('resend-otp')
  async resendOtp(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.resendOtp(forgotPasswordDto);
  }
}
