import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export const NOTE_MAX_LENGTH = 500;

/**
 * POST /attendance/check-out — جسم اختياري.
 *
 * الحقل الوحيد المسموح هو الملاحظة. الوقت والهوية ما زالا من الخادم
 * والتوكن، وأي حقل آخر (checkOut مثلًا) يُرفض بـ forbidNonWhitelisted.
 */
export class AttendanceCheckOutDto {
  // نقصّ الفراغات، وملاحظة من فراغات فقط تُعامل كأنها لم تُرسَل.
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsOptional()
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH, {
    message: `الملاحظة يجب ألا تتجاوز ${NOTE_MAX_LENGTH} حرف`,
  })
  note?: string;
}
