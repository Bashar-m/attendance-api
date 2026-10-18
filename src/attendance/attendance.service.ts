import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, QueryFilter, Types } from 'mongoose';
import { isDuplicateKeyError } from '../common/mongo-errors.js';
import { SettingsService } from '../settings/settings.service.js';
import { Role } from '../users/role.enum.js';
import { UserDocument } from '../users/schema/user.schema.js';
import { UsersService } from '../users/users.service.js';
import {
  AttendanceCreateDto,
  AttendanceUpdateDto,
} from './dto/attendance.manual.dto.js';
import { buildAttendanceWorkbook } from './attendance.export.js';
import {
  AttendanceExportQueryDto,
  AttendanceQueryDto,
} from './dto/attendance.query.dto.js';
import { Attendance } from './schema/attendance.schema.js';
import { toWorkDate, weekdayOf } from './work-date.js';

// الحقول التي نجلبها من الموظف عند populate: الاسم فقط، لا شيء حساس.
const EMPLOYEE_FIELDS = 'name username';

type EmployeeTotals = { _id: Types.ObjectId; records: number; workedMs: number };

@Injectable()
export class AttendanceService {
  private readonly timeZone: string;

  constructor(
    @InjectModel(Attendance.name)
    private readonly attendanceModel: Model<Attendance>,
    private readonly usersService: UsersService,
    private readonly settingsService: SettingsService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('APP_TIMEZONE') ?? 'Asia/Damascus';
  }

  // ───────────────────────── ما يفعله الموظف ─────────────────────────

  /**
   * تسجيل الحضور.
   *
   * لاحظ أن الدالة لا تستقبل وقتًا: الوقت يؤخذ من ساعة الخادم.
   * لو أرسله المتصفح لاستطاع الموظف كتابة أي وقت يريده.
   */
  async checkIn(employeeId: string) {
    const now = new Date();

    try {
      return await this.attendanceModel.create({
        employee: new Types.ObjectId(employeeId),
        workDate: toWorkDate(now, this.timeZone),
        checkIn: now,
      });
    } catch (error) {
      // لا نسأل "هل سجّل اليوم؟" قبل الإدخال. نُدخل مباشرة، والفهرس الفريد
      // {employee, workDate} يرفض التكرار. هذا يصمد أمام ضغطتين متزامنتين،
      // أما "افحص ثم أدخل" فلا يصمد.
      if (isDuplicateKeyError(error)) {
        throw new ConflictException('سجّلت حضورك اليوم مسبقًا');
      }
      throw error;
    }
  }

  /** تسجيل الانصراف: يغلق سجل اليوم المفتوح، مع ملاحظة اختيارية. */
  async checkOut(employeeId: string, note?: string) {
    const now = new Date();
    const employee = new Types.ObjectId(employeeId);
    const workDate = toWorkDate(now, this.timeZone);

    // عملية ذرّية واحدة: "ابحث عن سجل اليوم الذي لم يُغلق، وأغلقه".
    // الشرط checkOut: null داخل الفلتر هو ما يمنع الانصراف مرتين:
    // الطلب الثاني لا يجد سجلًّا مفتوحًا فلا يعدّل شيئًا.
    const record = await this.attendanceModel
      .findOneAndUpdate(
        { employee, workDate, checkOut: null },
        // بلا ملاحظة لا نلمس الحقل: إن أعادت الإدارة فتح السجل ثم انصرف
        // الموظف مجددًا دون ملاحظة، تبقى ملاحظته الأولى.
        { checkOut: now, ...(note ? { note } : {}) },
        { returnDocument: 'after' },
      )
      .exec();

    if (record) {
      return record;
    }

    // لم يُغلق شيء. نميّز السببين لنعطي الموظف رسالة مفيدة.
    const hasRecordToday = await this.attendanceModel.exists({
      employee,
      workDate,
    });
    if (hasRecordToday) {
      throw new ConflictException('سجّلت انصرافك اليوم مسبقًا');
    }
    throw new BadRequestException('لم تسجّل حضورك اليوم بعد');
  }

  /** حالة اليوم: الواجهة تقرّر منها أيّ زر تعرض. */
  async today(employeeId: string) {
    await this.closeStaleRecords();
    const now = new Date();
    const workDate = toWorkDate(now, this.timeZone);
    const attendance = await this.attendanceModel
      .findOne({ employee: new Types.ObjectId(employeeId), workDate })
      .exec();

    // serverTime: لتعرض الواجهة ساعة الخادم لا ساعة جهاز الموظف.
    return { workDate, serverTime: now, attendance };
  }

  // ───────────────────────── الاستعلامات ─────────────────────────

  /**
   * سجلات مع فلترة وترقيم صفحات.
   * تُستخدم مرتين: للإدارة (كل الموظفين)، وللموظف (سجله فقط) —
   * والفرق الوحيد هو من يحدّد قيمة employee: الطلب أم التوكن.
   */
  async findMany(query: AttendanceQueryDto) {
    if (query.to && !query.from) {
      throw new BadRequestException('حدّد تاريخ البداية قبل تاريخ النهاية');
    }
    if (query.from && query.to && query.to < query.from) {
      throw new BadRequestException('تاريخ النهاية يجب ألا يسبق تاريخ البداية');
    }

    await this.closeStaleRecords();

    const filter: QueryFilter<Attendance> = {};

    if (query.employee) {
      filter.employee = new Types.ObjectId(query.employee);
    }
    if (query.from) {
      // "من" وحده = ذلك اليوم فقط. "من" و"إلى" = فترة.
      // مقارنة نصية، وتعمل لأن صيغة YYYY-MM-DD ترتيبها الأبجدي هو الزمني.
      filter.workDate = query.to
        ? { $gte: query.from, $lte: query.to }
        : query.from;
    }

    const { weekendDays } = await this.settingsService.get();

    // الصفحة والعدد الكلي والمجاميع استعلامات مستقلة، فنشغّلها معًا لا بالتتابع.
    const [items, total, totals] = await Promise.all([
      this.attendanceModel
        .find(filter)
        .sort({ workDate: -1, checkIn: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        // populate يستبدل معرّف الموظف بمستنده (الحقول المحدّدة فقط).
        // هو المقابل لـ JOIN، لكنه استعلام ثانٍ ينفّذه Mongoose.
        .populate('employee', EMPLOYEE_FIELDS)
        .exec(),
      this.attendanceModel.countDocuments(filter).exec(),
      this.totalsByEmployee(filter, weekendDays),
    ]);

    // المجاميع تغطّي كل ما يطابق الفلتر، لا الصفحة المعروضة فقط.
    // سجلات أيام العطلة تظهر في القائمة لكنها خارج المجاميع.
    const workedMs = totals.reduce((sum, row) => sum + row.workedMs, 0);

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      workedMs,
      // بطاقات الموظفين تظهر فقط حين لا يُحدَّد موظف (عرض الإدارة للكل).
      ...(query.employee
        ? {}
        : { employees: await this.employeeCards(totals) }),
    };
  }

  /** عدد السجلات ومجموع وقت العمل لكل موظف ضمن الفلتر، بلا أيام العطلة. */
  private totalsByEmployee(
    filter: QueryFilter<Attendance>,
    weekendDays: number[],
  ) {
    return this.attendanceModel
      .aggregate<EmployeeTotals>([
        { $match: filter },
        // $dayOfWeek يعدّ من 1 (الأحد)، و weekendDays من 0 كما في JavaScript.
        {
          $match: {
            $expr: {
              $not: [
                {
                  $in: [
                    {
                      $subtract: [
                        {
                          $dayOfWeek: {
                            $dateFromString: { dateString: '$workDate' },
                          },
                        },
                        1,
                      ],
                    },
                    weekendDays,
                  ],
                },
              ],
            },
          },
        },
        {
          $group: {
            _id: '$employee',
            records: { $sum: 1 },
            // السجل المفتوح (بلا انصراف) لا يُحسب له وقت بعد.
            workedMs: {
              $sum: {
                $cond: [
                  '$checkOut',
                  { $subtract: ['$checkOut', '$checkIn'] },
                  0,
                ],
              },
            },
          },
        },
      ])
      .exec();
  }

  /**
   * بطاقة لكل موظف فعّال حتى لو كان عدّاده صفرًا،
   * ولكل موظف معطَّل له سجلات ضمن الفلتر.
   */
  private async employeeCards(totals: EmployeeTotals[]) {
    const byId = new Map(totals.map((row) => [row._id.toString(), row]));
    const users = await this.usersService.findAll();

    return users
      .filter(
        (user) =>
          user.role === Role.Employee &&
          (user.isActive || byId.has(user.id as string)),
      )
      .sort((a, b) => a.name.localeCompare(b.name, 'ar'))
      .map((user) => ({
        employee: {
          id: user.id as string,
          name: user.name,
          username: user.username,
        },
        records: byId.get(user.id as string)?.records ?? 0,
        workedMs: byId.get(user.id as string)?.workedMs ?? 0,
      }));
  }

  /**
   * موظف سجّل حضوره ونسي الانصراف حتى بدأ يوم جديد: نغلق سجله عند
   * وقت الحضور + ثانية واحدة. تُستدعى قبل كل استعلام قراءة، فلا يبقى
   * سجل مفتوح من يوم مضى. التصحيح الحقيقي للوقت يبقى بيد الإدارة.
   */
  private async closeStaleRecords(): Promise<void> {
    const today = toWorkDate(new Date(), this.timeZone);
    await this.attendanceModel
      .updateMany(
        { checkOut: null, workDate: { $lt: today } },
        // pipeline لأن القيمة الجديدة تُحسب من حقل آخر في المستند نفسه.
        [{ $set: { checkOut: { $add: ['$checkIn', 1000] } } }],
        { updatePipeline: true },
      )
      .exec();
  }

  /**
   * كشف يوم واحد: هذا هو بديل ورقة الحضور.
   * كل موظف فعّال يظهر في سطر، سواء حضر أم لا.
   *
   * سجلات الحضور وحدها لا تكفي: الغائب ليس له سجل أصلًا!
   * لذلك نبدأ من قائمة الموظفين ونلصق بكل واحد سجله إن وُجد.
   */
  async daily(date?: string) {
    await this.closeStaleRecords();
    const workDate = date ?? toWorkDate(new Date(), this.timeZone);

    const [{ weekendDays }, employees, records] = await Promise.all([
      this.settingsService.get(),
      this.usersService.findActiveEmployees(),
      this.attendanceModel
        .find({ workDate })
        .populate<{ employee: UserDocument | null }>(
          'employee',
          EMPLOYEE_FIELDS,
        )
        .exec(),
    ]);

    type Row = {
      employee: { id: string; name: string; username: string };
      attendance: (typeof records)[number] | null;
    };
    const toEmployee = (user: UserDocument) => ({
      id: user.id as string,
      name: user.name,
      username: user.username,
    });

    // Map يحافظ على ترتيب الإدخال: الموظفون الفعّالون أولًا مرتّبين بالاسم.
    const rows = new Map<string, Row>();
    for (const employee of employees) {
      rows.set(employee.id as string, {
        employee: toEmployee(employee),
        attendance: null,
      });
    }
    for (const record of records) {
      // موظف له سجل في ذلك اليوم ثم عُطّل حسابه لاحقًا: ليس في القائمة
      // الأولى، لكن سجله التاريخي يجب أن يبقى ظاهرًا.
      if (!record.employee) continue;
      rows.set(record.employee.id as string, {
        employee: toEmployee(record.employee),
        attendance: record,
      });
    }

    // holiday: الواجهة تعرض من لا سجل له "عطلة" بدل "لم يحضر".
    const holiday = weekendDays.includes(weekdayOf(workDate));
    return { workDate, holiday, rows: [...rows.values()] };
  }

  /** ملف Excel بسجلات موظف واحد في فترة، مع مجموع الساعات في آخره. */
  async exportEmployee(query: AttendanceExportQueryDto) {
    if (query.to < query.from) {
      throw new BadRequestException('تاريخ النهاية يجب ألا يسبق تاريخ البداية');
    }

    const employee = await this.usersService.findById(query.employee);
    if (!employee || employee.role !== Role.Employee) {
      throw new NotFoundException('الموظف غير موجود');
    }

    await this.closeStaleRecords();
    const [{ weekendDays }, records] = await Promise.all([
      this.settingsService.get(),
      this.attendanceModel
        .find({
          employee: employee._id,
          workDate: { $gte: query.from, $lte: query.to },
        })
        .sort({ workDate: 1 })
        .exec(),
    ]);

    const file = await buildAttendanceWorkbook({
      employee,
      from: query.from,
      to: query.to,
      // أيام العطلة لا تظهر في الملف ولا تدخل مجموعه.
      records: records.filter(
        (record) => !weekendDays.includes(weekdayOf(record.workDate)),
      ),
      weekendDays,
      timeZone: this.timeZone,
    });
    // اسم المستخدم حروف لاتينية وأرقام فقط (انظر UserCreateDto)،
    // فيصلح اسمًا للملف وفي ترويسة HTTP دون ترميز.
    const filename = `attendance-${employee.username}-${query.from}_${query.to}.xlsx`;
    return { file, filename };
  }

  // ───────────────────────── تصحيح الإدارة ─────────────────────────

  /** إضافة سجل يدويًا لموظف نسي تسجيل حضوره. */
  async createManual(dto: AttendanceCreateDto, adminId: string) {
    const employee = await this.usersService.findById(dto.employee);
    if (!employee || employee.role !== Role.Employee) {
      throw new NotFoundException('الموظف غير موجود');
    }

    const checkIn = new Date(dto.checkIn);
    const checkOut = dto.checkOut ? new Date(dto.checkOut) : null;
    this.assertValidTimes(checkIn, checkOut);

    try {
      return await this.attendanceModel.create({
        employee: employee._id,
        // يوم العمل يُشتق من وقت الحضور دائمًا، فلا يتناقضان.
        workDate: toWorkDate(checkIn, this.timeZone),
        checkIn,
        checkOut,
        editedBy: new Types.ObjectId(adminId),
        editedAt: new Date(),
      });
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'للموظف سجل في هذا اليوم، عدّله بدل إضافة سجل جديد',
        );
      }
      throw error;
    }
  }

  /** تعديل سجل موجود، مع ختمه باسم المدير ووقت التعديل. */
  async updateManual(id: string, dto: AttendanceUpdateDto, adminId: string) {
    const record = await this.attendanceModel.findById(id).exec();
    if (!record) {
      throw new NotFoundException('السجل غير موجود');
    }

    const checkIn = dto.checkIn ? new Date(dto.checkIn) : record.checkIn;
    const checkOut =
      dto.checkOut === undefined
        ? record.checkOut // لم يُرسَل => يبقى كما هو
        : dto.checkOut === null
          ? null // null => إعادة فتح السجل
          : new Date(dto.checkOut);

    this.assertValidTimes(checkIn, checkOut);

    // السجل مربوط بيومه عبر الفهرس الفريد. نقل وقت الحضور إلى يوم آخر
    // يجعل workDate يكذب، فنمنعه: لتغيير اليوم يُنشأ سجل جديد.
    if (toWorkDate(checkIn, this.timeZone) !== record.workDate) {
      throw new BadRequestException(
        `وقت الحضور يجب أن يبقى ضمن يوم ${record.workDate}`,
      );
    }

    record.checkIn = checkIn;
    record.checkOut = checkOut;
    record.editedBy = new Types.ObjectId(adminId);
    record.editedAt = new Date();
    return record.save();
  }

  /** قواعد تصحّ على أي سجل مهما كان مصدره. */
  private assertValidTimes(checkIn: Date, checkOut: Date | null): void {
    const now = Date.now();
    if (checkIn.getTime() > now || (checkOut && checkOut.getTime() > now)) {
      throw new BadRequestException('لا يمكن تسجيل وقت في المستقبل');
    }
    if (checkOut && checkOut.getTime() <= checkIn.getTime()) {
      throw new BadRequestException('وقت الانصراف يجب أن يكون بعد وقت الحضور');
    }
  }
}
