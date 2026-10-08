import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import type { AuthUser } from './auth-user.type.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * المسار الوحيد المفتوح بلا توكن، ولذلك هو الوحيد المعرَّض لتخمين
   * كلمات المرور. ThrottlerGuard يحدّه بـ 5 محاولات في الدقيقة لكل عنوان IP،
   * وبعدها يرد بـ 429 Too Many Requests.
   *
   * HttpCode(200): الافتراضي لـ POST هو 201 Created،
   * وتسجيل الدخول لا "ينشئ" موردًا.
   */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** الواجهة تستدعيه عند فتح الصفحة لتعرف: هل التوكن المحفوظ ما زال صالحًا؟ */
  @Get('me')
  me(@CurrentUser() user: AuthUser): AuthUser {
    return user;
  }
}
