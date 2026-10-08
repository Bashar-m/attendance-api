import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { getModelToken } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AppModule } from './app.module.js';
import { Attendance } from './attendance/schema/attendance.schema.js';
import { toWorkDate } from './attendance/work-date.js';
import { Role } from './users/role.enum.js';
import { User } from './users/schema/user.schema.js';
import { UsersService } from './users/users.service.js';

/**
 * بيانات تجريبية للتطوير: موظفون وهميون وسجلات حضور لآخر عدة أسابيع.
 *
 *   npm run seed         ينشئ الموظفين التجريبيين ويعيد توليد سجلاتهم
 *   npm run seed:clear   يحذف الموظفين التجريبيين وسجلاتهم فقط
 *
 * كل الحسابات التجريبية تبدأ بـ "demo." فلا تختلط بالحسابات الحقيقية،
 * ولا يلمس السكربت أي مستخدم أو سجل آخر. تشغيله أكثر من مرة آمن.
 *
 * يكتب في القاعدة المحدّدة في .env (MONGODB_URL / MONGODB_DB).
 */
const DEMO_PREFIX = 'demo.';
const DEMO_PASSWORD = 'demo-1234';
const DAYS_BACK = 45;
const WEEKEND = [5, 6]; // الجمعة والسبت

const EMPLOYEES = [
  { name: 'أحمد الخطيب', username: 'demo.ahmad' },
  { name: 'سارة حداد', username: 'demo.sara' },
  { name: 'محمد العلي', username: 'demo.mohammad' },
  { name: 'ليلى منصور', username: 'demo.layla' },
  { name: 'عمر الشامي', username: 'demo.omar' },
  // معطَّل: يظهر في السجل وبطاقات العدّادات فقط ما دامت له سجلات ضمن الفلتر.
  { name: 'رنا يوسف', username: 'demo.rana', inactive: true },
];

/** مولّد أرقام عشوائية ببذرة ثابتة: التشغيل نفسه يعطي البيانات نفسها. */
function createRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** "2026-10-07" + دقائق منذ منتصف الليل المحلي => اللحظة الفعلية (UTC). */
function localTime(workDate: string, minutes: number, timeZone: string): Date {
  const guess = Date.parse(`${workDate}T00:00:00Z`) + minutes * 60_000;
  // sv-SE يعطي "YYYY-MM-DD HH:mm:ss": نقرأ ساعة الحائط كأنها UTC لنعرف الفرق.
  const wall = new Date(guess).toLocaleString('sv-SE', { timeZone });
  const offset = Date.parse(`${wall.replace(' ', 'T')}Z`) - guess;
  return new Date(guess - offset);
}

async function clear(
  userModel: Model<User>,
  attendanceModel: Model<Attendance>,
) {
  const users = await userModel
    .find({ username: { $regex: `^${DEMO_PREFIX.replace('.', '\\.')}` } })
    .exec();
  const ids = users.map((user) => user._id);
  const records = await attendanceModel.deleteMany({ employee: { $in: ids } });
  await userModel.deleteMany({ _id: { $in: ids } });
  return { users: ids.length, records: records.deletedCount };
}

async function seed() {
  const logger = new Logger('Seed');
  const app = await NestFactory.createApplicationContext(AppModule);

  try {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('البيانات التجريبية لا تُزرع في بيئة الإنتاج');
    }

    const usersService = app.get(UsersService);
    const timeZone =
      app.get(ConfigService).get<string>('APP_TIMEZONE') ?? 'Asia/Damascus';
    const userModel = app.get<Model<User>>(getModelToken(User.name), {
      strict: false,
    });
    const attendanceModel = app.get<Model<Attendance>>(
      getModelToken(Attendance.name),
      { strict: false },
    );

    if (process.argv.includes('--clear')) {
      const removed = await clear(userModel, attendanceModel);
      logger.log(`حُذف ${removed.users} موظف تجريبي و ${removed.records} سجل`);
      return;
    }

    // ───── الموظفون ─────
    const employeeIds: Types.ObjectId[] = [];
    for (const { name, username, inactive } of EMPLOYEES) {
      const existing = await userModel.findOne({ username }).exec();
      const id =
        existing?._id ??
        (await usersService.create({ name, username, password: DEMO_PASSWORD }))
          ._id;
      await usersService.update(id.toString(), { isActive: !inactive });
      employeeIds.push(id);
    }

    const admin = await userModel.findOne({ role: Role.Admin }).exec();

    // ───── السجلات ─────
    // نعيد توليدها من الصفر: سجلات الحسابات التجريبية كلها من هذا السكربت.
    await attendanceModel.deleteMany({ employee: { $in: employeeIds } });

    const random = createRandom(20261007);
    const between = (min: number, max: number) =>
      Math.floor(min + random() * (max - min));

    const now = new Date();
    const today = toWorkDate(now, timeZone);
    const records: Attendance[] = [];
    let lastPastWorkday: string | null = null;

    for (let back = DAYS_BACK; back >= 0; back -= 1) {
      const workDate = toWorkDate(
        new Date(now.getTime() - back * 86_400_000),
        timeZone,
      );
      const weekday = new Date(`${workDate}T00:00:00Z`).getUTCDay();
      if (WEEKEND.includes(weekday)) continue;
      if (workDate !== today) lastPastWorkday = workDate;

      employeeIds.forEach((employee, index) => {
        // الموظفة المعطّلة توقفت عن الحضور قبل أسبوعين.
        if (EMPLOYEES[index].inactive && back < 14) return;
        if (random() < 0.1) return; // غياب

        const checkIn = localTime(workDate, between(7 * 60 + 45, 9 * 60 + 20), timeZone);
        let checkOut: Date | null = localTime(
          workDate,
          between(15 * 60 + 30, 17 * 60 + 45),
          timeZone,
        );

        if (workDate === today) {
          if (checkIn > now) return; // لم يحن وقت حضوره بعد
          // آخر موظفَين ما زالا في الدوام، والباقون انصرفوا إن حان الوقت.
          if (checkOut > now || index >= 3) checkOut = null;
        }

        // نحو سجل من كل اثني عشر صحّحته الإدارة يدويًّا.
        const edited = admin && workDate !== today && random() < 0.08;

        records.push({
          employee,
          workDate,
          checkIn,
          checkOut,
          editedBy: edited ? admin._id : null,
          editedAt: edited ? new Date(checkOut!.getTime() + 3_600_000) : null,
        });
      });
    }

    // سجل نُسي مفتوحًا في آخر يوم عمل مضى: يُغلق تلقائيًّا (حضور + ثانية)
    // عند أول استعلام، وهذا ما نريد رؤيته في الواجهة.
    const forgotten = records.find(
      (record) =>
        record.workDate === lastPastWorkday &&
        record.employee.equals(employeeIds[1]),
    );
    if (forgotten) {
      forgotten.checkOut = null;
      forgotten.editedBy = null;
      forgotten.editedAt = null;
    }

    await attendanceModel.insertMany(records);

    logger.log(
      `${EMPLOYEES.length} موظفين تجريبيين و ${records.length} سجل حضور ` +
        `(آخر ${DAYS_BACK} يومًا)`,
    );
    logger.log(
      `الدخول: ${EMPLOYEES.map((employee) => employee.username).join('، ')} ` +
        `— كلمة المرور: ${DEMO_PASSWORD}`,
    );
  } finally {
    await app.close();
  }
}

await seed();
