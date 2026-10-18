import { IsWeekendDays } from '../../common/decorators/is-weekend-days.decorator.js';

/** PATCH /settings — { "weekendDays": [5, 6] } (0 = الأحد ... 6 = السبت) */
export class SettingsUpdateDto {
  @IsWeekendDays()
  weekendDays: number[];
}
