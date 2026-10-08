import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { JwtStrategy } from './jwt.strategy.js';

@Module({
  imports: [
    UsersModule, // نحتاج UsersService (وهو مُصدَّر من هناك عبر exports)
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        // 12 ساعة تغطي يوم عمل كاملًا: يسجّل الموظف دخوله صباحًا
        // ويبقى التوكن صالحًا حتى الانصراف. في اليوم التالي يسجّل من جديد.
        signOptions: { expiresIn: '12h' },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    // APP_GUARD يسجّل الحارس على كل مسارات التطبيق دفعة واحدة،
    // بدل كتابة @UseGuards فوق كل Controller ونسيانه في أحدها.
    // الترتيب مهم: الحراس تعمل بترتيب تسجيلها، و RolesGuard يحتاج
    // request.user الذي يجهّزه JwtAuthGuard.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
