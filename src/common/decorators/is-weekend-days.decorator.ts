import { applyDecorators } from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';

/**
 * أيام عطلة أسبوعية: [5, 6] = الجمعة والسبت (0 = الأحد ... 6 = السبت).
 * قواعد واحدة لمكانين: العطلة الافتراضية في الإعدادات، وعطلة كل موظف.
 */
export function IsWeekendDays() {
  return applyDecorators(
    IsArray(),
    ArrayUnique(),
    ArrayMaxSize(6, { message: 'يجب أن يبقى يوم عمل واحد على الأقل' }),
    IsInt({ each: true }),
    Min(0, { each: true }),
    Max(6, { each: true }),
  );
}
