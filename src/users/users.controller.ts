import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ParseObjectIdPipe } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { AuthUser } from '../auth/auth-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { UserCreateDto } from './dto/user.create.dto.js';
import { UserUpdateDto } from './dto/user.update.dto.js';
import { Role } from './role.enum.js';
import { UsersService } from './users.service.js';

/**
 * إدارة الموظفين. @Roles فوق الصنف يسري على كل مساراته: للمدير فقط.
 *
 * الـ Controller لا يحتوي منطقًا: يستقبل، يستدعي الـ Service، ويرجع الرد.
 */
@Roles(Role.Admin)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  create(@Body() dto: UserCreateDto) {
    return this.usersService.create(dto);
  }

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Patch(':id')
  update(
    // ParseObjectIdPipe يرفض المعرّف غير الصالح بخطأ 400
    // بدل أن يصل إلى Mongoose ويسبّب خطأ 500، ويحوّله إلى ObjectId.
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: UserUpdateDto,
    @CurrentUser() admin: AuthUser,
  ) {
    // لو عطّل المدير الوحيد حسابه لما استطاع أحد الدخول لإعادة تفعيله.
    if (dto.isActive === false && id.toString() === admin.id) {
      throw new BadRequestException('لا يمكنك تعطيل حسابك');
    }
    return this.usersService.update(id.toString(), dto);
  }
}
