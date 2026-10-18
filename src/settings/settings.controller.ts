import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../users/role.enum.js';
import { SettingsUpdateDto } from './dto/settings.update.dto.js';
import { SettingsService } from './settings.service.js';

/**
 * للمدير فقط. الموظف لا يحتاج الإعدادات: كل سجل يصله ومعه holiday
 * محسوبًا في الخادم بأيام عطلته هو.
 */
@Roles(Role.Admin)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  get() {
    return this.settingsService.get();
  }

  @Patch()
  update(@Body() dto: SettingsUpdateDto) {
    return this.settingsService.update(dto);
  }
}
