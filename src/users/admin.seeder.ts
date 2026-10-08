import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UsersService } from './users.service.js';

/**
 * مشكلة البيضة والدجاجة: إنشاء المستخدمين للمدير فقط، فمن ينشئ أول مدير؟
 *
 * الحل: عند كل إقلاع، إن لم يوجد أي مدير في القاعدة ننشئ واحدًا
 * من ADMIN_USERNAME و ADMIN_PASSWORD في ملف .env.
 * وإن وُجد مدير لا نفعل شيئًا، فتشغيل التطبيق مئة مرة آمن.
 *
 * OnApplicationBootstrap: دالة يستدعيها Nest مرة واحدة
 * بعد أن تجهز كل الموديولات ويكتمل الاتصال بالقاعدة.
 */
@Injectable()
export class AdminSeeder implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminSeeder.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (await this.usersService.adminExists()) {
      return;
    }

    const username = this.config.get<string>('ADMIN_USERNAME');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!username || !password) {
      this.logger.warn(
        'لا يوجد مدير في القاعدة، و ADMIN_USERNAME / ADMIN_PASSWORD غير مضبوطين في .env',
      );
      return;
    }

    await this.usersService.createAdmin({
      name: 'مدير النظام',
      username: username.trim().toLowerCase(),
      password,
    });
    // نسجّل الاسم فقط. كلمات المرور لا تُكتب في السجلات أبدًا.
    this.logger.log(`أُنشئ حساب المدير الأول: ${username}`);
  }
}
