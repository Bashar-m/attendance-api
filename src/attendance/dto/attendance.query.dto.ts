import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { WORK_DATE_PATTERN } from '../work-date.js';

const DATE_MESSAGE = 'التاريخ بصيغة YYYY-MM-DD';

/**
 * فلاتر قائمة السجلات: GET /attendance?from=2026-10-01&to=2026-10-31&page=2
 *
 * from وحده = ذلك اليوم فقط. from مع to = فترة. بدونهما = كل السجلات.
 * to بلا from مرفوض (يُفحص في الخدمة).
 *
 * كل ما في الـ query string يصل نصًّا، حتى الأرقام ("2" لا 2).
 * @Type(() => Number) يحوّله إلى رقم قبل التحقق،
 * ويعمل لأن ValidationPipe مضبوط على transform: true.
 */
export class AttendanceQueryDto {
  @IsOptional()
  @Matches(WORK_DATE_PATTERN, { message: DATE_MESSAGE })
  from?: string;

  @IsOptional()
  @Matches(WORK_DATE_PATTERN, { message: DATE_MESSAGE })
  to?: string;

  // يُتجاهل في "سجلّي": الموظف يرى سجله فقط مهما أرسل هنا.
  @IsOptional()
  @IsMongoId()
  employee?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  // حدّ أعلى دائمًا: بدونه يستطيع طلب واحد سحب القاعدة كلها.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 31;
}

/**
 * GET /attendance/export?employee=<id>&from=2026-10-05&to=2026-11-05
 * ملف Excel لموظف واحد. الحقول الثلاثة إلزامية: الملف دائمًا عن فترة محدّدة.
 */
export class AttendanceExportQueryDto {
  @IsMongoId({ message: 'اختر الموظف' })
  employee: string;

  @Matches(WORK_DATE_PATTERN, { message: DATE_MESSAGE })
  from: string;

  @Matches(WORK_DATE_PATTERN, { message: DATE_MESSAGE })
  to: string;
}

/** GET /attendance/daily?date=2026-10-07  (بدون date = اليوم) */
export class AttendanceDailyQueryDto {
  @IsOptional()
  @Matches(WORK_DATE_PATTERN, { message: DATE_MESSAGE })
  date?: string;
}
