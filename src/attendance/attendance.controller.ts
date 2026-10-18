import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { ParseObjectIdPipe } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import type { AuthUser } from '../auth/auth-user.type.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Role } from '../users/role.enum.js';
import { XLSX_TYPE } from './attendance.export.js';
import { AttendanceService } from './attendance.service.js';
import { AttendanceCheckOutDto } from './dto/attendance.checkout.dto.js';
import {
  AttendanceCreateDto,
  AttendanceUpdateDto,
} from './dto/attendance.manual.dto.js';
import {
  AttendanceDailyQueryDto,
  AttendanceExportQueryDto,
  AttendanceQueryDto,
} from './dto/attendance.query.dto.js';

/**
 * كل مسار هنا يحمل @Roles صريحًا: نصفها للموظف ونصفها للإدارة.
 *
 * في مسارات الموظف الهوية تأتي من @CurrentUser() (أي من التوكن).
 * لا يوجد مسار واحد يقبل "معرّف الموظف" من الموظف نفسه.
 */
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly attendanceService: AttendanceService) {}

  // ───────────── الموظف ─────────────

  // لا يوجد @Body: الطلب فارغ، والخادم يعرف "من" من التوكن و"متى" من ساعته.
  @Roles(Role.Employee)
  @Post('check-in')
  checkIn(@CurrentUser() user: AuthUser) {
    return this.attendanceService.checkIn(user.id);
  }

  // 200 لا 201: الانصراف يعدّل سجلًّا موجودًا ولا ينشئ جديدًا.
  // الجسم اختياري ويحمل الملاحظة فقط؛ الوقت يبقى من ساعة الخادم.
  @Roles(Role.Employee)
  @HttpCode(HttpStatus.OK)
  @Post('check-out')
  checkOut(
    @CurrentUser() user: AuthUser,
    @Body() dto: AttendanceCheckOutDto,
  ) {
    return this.attendanceService.checkOut(user.id, dto.note);
  }

  @Roles(Role.Employee)
  @Get('today')
  today(@CurrentUser() user: AuthUser) {
    return this.attendanceService.today(user.id);
  }

  @Roles(Role.Employee)
  @Get('me')
  mine(@CurrentUser() user: AuthUser, @Query() query: AttendanceQueryDto) {
    // نكتب employee فوق أي قيمة أرسلها العميل:
    // حتى لو أرسل ?employee=<معرّف زميله> يرى سجله هو فقط.
    return this.attendanceService.findMany({ ...query, employee: user.id });
  }

  // ───────────── الإدارة ─────────────

  @Roles(Role.Admin)
  @Get('daily')
  daily(@Query() query: AttendanceDailyQueryDto) {
    return this.attendanceService.daily(query.date);
  }

  @Roles(Role.Admin)
  @Get()
  findAll(@Query() query: AttendanceQueryDto) {
    return this.attendanceService.findMany(query);
  }

  // StreamableFile: الرد ملف لا JSON. Nest يضبط الترويستين ويرسل البايتات كما هي.
  @Roles(Role.Admin)
  @Get('export')
  async exportEmployee(@Query() query: AttendanceExportQueryDto) {
    const { file, filename } =
      await this.attendanceService.exportEmployee(query);
    return new StreamableFile(file, {
      type: XLSX_TYPE,
      disposition: `attachment; filename="${filename}"`,
    });
  }

  @Roles(Role.Admin)
  @Post()
  createManual(
    @Body() dto: AttendanceCreateDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.attendanceService.createManual(dto, admin.id);
  }

  @Roles(Role.Admin)
  @Patch(':id')
  updateManual(
    @Param('id', ParseObjectIdPipe) id: Types.ObjectId,
    @Body() dto: AttendanceUpdateDto,
    @CurrentUser() admin: AuthUser,
  ) {
    return this.attendanceService.updateManual(id.toString(), dto, admin.id);
  }
}
