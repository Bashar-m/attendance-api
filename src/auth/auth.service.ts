import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import type { AuthUser, JwtPayload } from './auth-user.type.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ accessToken: string; user: AuthUser }> {
    const user = await this.usersService.findByUsernameWithPassword(
      dto.username,
    );

    // رسالة واحدة للحالتين (اسم خاطئ / كلمة مرور خاطئة).
    // لو قلنا "الاسم غير موجود" لعرف المهاجم أيّ الأسماء صحيحة وركّز عليها.
    //
    // compare تعيد تشفير ما أدخله المستخدم بالملح المخزَّن داخل الهاش وتقارن.
    // الهاش لا يُفكّ أبدًا؛ لا توجد دالة "decrypt" في bcrypt.
    if (!user || !(await compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('اسم المستخدم أو كلمة المرور غير صحيحة');
    }

    // نفحص التعطيل بعد التأكد من كلمة المرور: صاحب الحساب الحقيقي
    // يستحق رسالة واضحة، ومن لا يعرف كلمة المرور لا يعرف شيئًا عن الحساب.
    if (!user.isActive) {
      throw new ForbiddenException('الحساب معطّل، راجع الإدارة');
    }

    // محتوى التوكن مقروء لأي أحد (هو base64 لا تشفير)، والتوقيع فقط
    // يمنع تعديله. لذلك لا نضع فيه إلا المعرّف والدور.
    const payload: JwtPayload = { sub: user.id as string, role: user.role };

    return {
      accessToken: await this.jwtService.signAsync(payload),
      user: {
        id: user.id as string,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    };
  }
}
