import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsInt,
  Max,
  Min,
} from 'class-validator';

/** PATCH /settings — { "weekendDays": [5, 6] } (0 = الأحد ... 6 = السبت) */
export class SettingsUpdateDto {
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(6, { message: 'يجب أن يبقى يوم عمل واحد على الأقل' })
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  weekendDays: number[];
}
