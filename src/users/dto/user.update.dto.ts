import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * كل الحقول اختيارية: الإدارة ترسل ما تريد تغييره فقط (PATCH).
 *
 * - password: لإعادة تعيين كلمة مرور موظف نسيها.
 * - isActive: false لتعطيل حساب موظف غادر الشركة.
 *
 * لا يوجد role هنا عمدًا: لا يمكن ترقية حساب إلى مدير عبر الـ API.
 * ولا يوجد username: تغييره يربك الموظف ولا حاجة فعلية له.
 */
export class UserUpdateDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(6, { message: 'كلمة المرور 6 أحرف على الأقل' })
  @MaxLength(72)
  password?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
