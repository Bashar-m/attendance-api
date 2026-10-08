import { IsDateString, IsMongoId, IsOptional } from 'class-validator';

/**
 * هذان الصنفان للإدارة فقط: التصحيح اليدوي.
 *
 * الموظف نفسه لا يرسل أي وقت أبدًا: زرّا الحضور والانصراف يرسلان طلبًا
 * فارغًا والخادم يضع الوقت. الأوقات هنا تُقبل لأن مرسلها مدير،
 * وكل تعديل يُختم باسمه ووقته (editedBy / editedAt).
 *
 * الأوقات بصيغة ISO مع المنطقة الزمنية، مثل: 2026-10-07T08:30:00+03:00
 */

/** POST /attendance — موظف نسي تسجيل حضوره كليًّا */
export class AttendanceCreateDto {
  @IsMongoId()
  employee: string;

  @IsDateString()
  checkIn: string;

  @IsOptional()
  @IsDateString()
  checkOut?: string;
}

/** PATCH /attendance/:id — تصحيح سجل موجود (نسي الانصراف مثلًا) */
export class AttendanceUpdateDto {
  @IsOptional()
  @IsDateString()
  checkIn?: string;

  // ثلاث حالات مقصودة:
  //   غير مُرسَل => لا تغيير
  //   null       => إعادة فتح السجل (إلغاء الانصراف)
  //   وقت        => ضبط وقت الانصراف
  // @IsOptional يتخطّى بقية الفحوص حين تكون القيمة undefined أو null،
  // فتمرّ null دون أن يعترض @IsDateString.
  @IsOptional()
  @IsDateString()
  checkOut?: string | null;
}
