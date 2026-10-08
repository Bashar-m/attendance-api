import { ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';

/**
 * الحارس الأول: هل الطلب يحمل توكنًا صالحًا؟
 *
 * الحارس (Guard) يعمل قبل الـ Controller ويرجع true (مرّ) أو يرمي خطأ.
 * AuthGuard('jwt') جاهز من @nestjs/passport ويشغّل JwtStrategy.
 * نحن نضيف عليه شيئًا واحدًا: تجاوز المسارات المعلَّمة بـ @Public().
 *
 * هذا الحارس مسجَّل عامًّا في AuthModule، فيحمي كل مسار في التطبيق.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Reflector يقرأ الملصقات التي وضعتها الديكوريترات.
    // getAllAndOverride: ابحث على الدالة أولًا، ثم على الصنف.
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }
    return super.canActivate(context);
  }
}
