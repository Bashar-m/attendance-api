import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../../auth/auth-user.type.js';

/**
 * يعطيك المستخدم صاحب التوكن كوسيط في دالة الـ Controller:
 *
 *   checkIn(@CurrentUser() user: AuthUser) { ... }
 *
 * من أين يأتي request.user؟ من JwtStrategy.validate(): ما تُرجعه تلك الدالة
 * يضعه Passport على الطلب.
 *
 * القاعدة الأهم في المشروع: هوية المستخدم تؤخذ من هنا دائمًا،
 * ولا تؤخذ أبدًا من جسم الطلب. لو قبلنا employeeId من العميل
 * لاستطاع أي موظف تسجيل حضور زميله.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthUser =>
    context.switchToHttp().getRequest<{ user: AuthUser }>().user,
);
