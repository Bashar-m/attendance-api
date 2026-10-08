import { Transform } from 'class-transformer';
import {
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * شكل البيانات المقبولة عند إنشاء موظف.
 *
 * لاحظ ما هو غير موجود هنا: role و isActive و passwordHash.
 * الـ ValidationPipe في main.ts مضبوط على forbidNonWhitelisted،
 * فأي حقل غير مذكور في هذا الصنف يرفض الطلب كله بخطأ 400.
 * بهذا لا يستطيع أحد إرسال "role": "admin" وإنشاء مدير.
 */
export class UserCreateDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  // Transform يعمل قبل التحقق: ننظّف القيمة أولًا ثم نفحصها.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @Matches(/^[a-z0-9._-]{3,30}$/, {
    message: 'اسم المستخدم: 3 إلى 30 حرفًا إنجليزيًا أو رقمًا أو . _ -',
  })
  username: string;

  // العميل يرسل كلمة المرور الصريحة باسم password،
  // والـ Service هي التي تحوّلها إلى passwordHash قبل الحفظ.
  @IsString()
  @MinLength(6, { message: 'كلمة المرور 6 أحرف على الأقل' })
  @MaxLength(72) // bcrypt يتجاهل ما بعد 72 بايت، فنمنعه من الأصل
  password: string;
}
