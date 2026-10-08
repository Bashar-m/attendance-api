import type { Role } from '../users/role.enum.js';

/** ما نضعه داخل التوكن. sub اسم قياسي في JWT معناه "صاحب التوكن". */
export interface JwtPayload {
  sub: string;
  role: Role;
}

/**
 * المستخدم كما يراه باقي التطبيق بعد التحقق من التوكن (request.user).
 * نسخة صغيرة ونظيفة: لا هاش ولا حقول داخلية.
 */
export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: Role;
}
