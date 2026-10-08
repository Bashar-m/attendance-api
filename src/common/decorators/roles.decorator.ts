import { SetMetadata } from '@nestjs/common';
import { Role } from '../../users/role.enum.js';

export const ROLES_KEY = 'roles';

/**
 * يحدّد الأدوار المسموح لها بالمسار: @Roles(Role.Admin)
 * يوضع فوق دالة واحدة أو فوق الـ Controller كله.
 * الذي يطبّقه فعلًا هو RolesGuard.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
