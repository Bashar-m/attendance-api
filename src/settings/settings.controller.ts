import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../users/role.enum.js';
import { SettingsUpdateDto } from './dto/settings.update.dto.js';
import { SettingsService } from './settings.service.js';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  // بلا @Roles: أي مستخدم مسجَّل يقرأ، لأن الموظف أيضًا يرى أيام العطلة
  // معلَّمة في سجله.
  @Get()
  get() {
    return this.settingsService.get();
  }

  @Roles(Role.Admin)
  @Patch()
  update(@Body() dto: SettingsUpdateDto) {
    return this.settingsService.update(dto);
  }
}
