import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../../common/decorators/roles.decorator.js';
import type { Role } from '../../users/role.enum.js';
import type { AuthUser } from '../auth-user.type.js';

/**
 * الحارس الثاني: هل دور المستخدم مسموح له بهذا المسار؟
 *
 * الفرق بين الحارسين هو الفرق بين سؤالين:
 *   - المصادقة  (authentication): من أنت؟         => JwtAuthGuard  => 401
 *   - الصلاحية  (authorization):  هل يُسمح لك؟    => RolesGuard    => 403
 *
 * يعمل بعد JwtAuthGuard، فحين يصل الطلب إلى هنا يكون request.user جاهزًا.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // لا يوجد @Roles على المسار => يكفي أن يكون المستخدم مسجَّلًا
    // (أو أن المسار @Public أصلًا).
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    // إرجاع false يجعل Nest يرد بـ 403 Forbidden تلقائيًا.
    return user !== undefined && requiredRoles.includes(user.role);
  }
}
