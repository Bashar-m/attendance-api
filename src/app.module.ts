import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AttendanceModule } from './attendance/attendance.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';

/**
 * الموديول الجذر: لا منطق فيه، فقط يجمع القطع.
 *
 *   users       من هم المستخدمون (والمدير ينشئهم)
 *   auth        من أنت؟ وهل يُسمح لك؟
 *   attendance  الحضور والانصراف وكشوف الإدارة
 */
@Module({
  imports: [
    // يقرأ .env مرة واحدة، و isGlobal يتيح ConfigService في كل الموديولات.
    ConfigModule.forRoot({ isGlobal: true }),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URL'),
        // اسم القاعدة منفصل عن الرابط: الرابط نفسه يخدم قاعدة التطوير
        // وقاعدة الاختبار (test/app.e2e-spec.ts يغيّر هذا المتغيّر فقط).
        dbName: config.get<string>('MONGODB_DB'),
      }),
    }),

    // الإعداد العام لمحدِّد الطلبات. لا يُطبَّق على أي مسار تلقائيًا:
    // فقط حيث نضع @UseGuards(ThrottlerGuard)، وهو مسار تسجيل الدخول.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 5 }]),

    UsersModule,
    AuthModule,
    AttendanceModule,
  ],
})
export class AppModule {}
