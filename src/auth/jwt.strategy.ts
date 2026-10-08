import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { UsersService } from '../users/users.service.js';
import type { AuthUser, JwtPayload } from './auth-user.type.js';

/**
 * "الاستراتيجية" تجيب عن سؤال واحد: كيف نعرف من صاحب هذا الطلب؟
 *
 * ما يحدث لكل طلب محمي:
 *   1. Passport يستخرج التوكن من الترويسة:  Authorization: Bearer <token>
 *   2. يتحقق من التوقيع بـ JWT_SECRET ومن تاريخ الانتهاء.
 *      إن فشل أحدهما => 401 ولا تُستدعى validate أصلًا.
 *   3. إن نجح يستدعي validate() بمحتوى التوكن.
 *   4. ما تُرجعه validate() يوضع في request.user.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      // getOrThrow: إن نُسي JWT_SECRET يتوقف التطبيق عند الإقلاع برسالة واضحة
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthUser> {
    // التوكن الصحيح يثبت أن المستخدم سجّل الدخول في وقت ما،
    // لا أنه ما زال مسموحًا له اليوم. لذلك نقرأ حالته من القاعدة في كل طلب:
    // إن عطّلت الإدارة حسابه يتوقف فورًا، لا بعد انتهاء التوكن بساعات.
    // الثمن استعلام واحد صغير لكل طلب، وهو مقبول تمامًا لنظام بهذا الحجم.
    const user = await this.usersService.findById(payload.sub);
    if (!user || !user.isActive) {
      throw new UnauthorizedException('الحساب غير موجود أو معطّل');
    }

    return {
      id: user.id as string,
      name: user.name,
      username: user.username,
      // الدور من القاعدة لا من التوكن، للسبب نفسه.
      role: user.role,
    };
  }
}
