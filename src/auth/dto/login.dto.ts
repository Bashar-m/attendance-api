import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * لا نطبّق هنا قواعد كلمة المرور (الطول الأدنى مثلًا):
 * تسجيل الدخول يقارن فقط، وقواعد القوة مكانها عند الإنشاء.
 * الحدّ الأعلى موجود لمنع إرسال نص بحجم ميغابايتات إلى bcrypt.
 */
export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  username: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;
}
