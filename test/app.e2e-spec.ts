import { getConnectionToken } from '@nestjs/mongoose';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import { Types, type Connection } from 'mongoose';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { setupApp } from '../src/app.setup.js';

/**
 * اختبار e2e (من الطرف إلى الطرف): يشغّل التطبيق كاملًا ويرسل له طلبات HTTP
 * حقيقية، كما يفعل Postman، ثم يفحص الردود.
 *
 * يكتب في قاعدة مستقلة اسمها attendance_e2e (انظر vitest.config.e2e.ts)
 * ويحذفها في النهاية، فلا يلمس بيانات التطوير.
 *
 * الاختبارات هنا متسلسلة عمدًا وتبني على بعضها (دخول => إنشاء => حضور ...)
 * لأنها تحكي قصة يوم عمل واحد.
 *
 * التشغيل:  npm run test:e2e
 */
const E2E_DB = 'attendance_e2e';
const ADMIN = { username: 'e2e-admin', password: 'e2e-admin-password' };
const EMPLOYEE = {
  name: 'موظف تجريبي',
  username: 'sami',
  password: 'sami-123',
};

describe('نظام الحضور (e2e)', () => {
  let app: NestExpressApplication;
  let connection: Connection;
  let adminToken: string;
  let employeeToken: string;
  let employeeId: string;
  let attendanceId: string;

  // اختصارات: طلب يحمل توكن المدير أو الموظف
  const api = () => request(app.getHttpServer());
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      // نعطّل محدِّد محاولات الدخول داخل الاختبار فقط،
      // وإلا رفض الطلبات بعد خامس تسجيل دخول.
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    setupApp(app);
    await app.init();

    connection = app.get<Connection>(getConnectionToken());
    // حزام أمان: لا نكمل (ولا نحذف شيئًا لاحقًا) إلا في قاعدة الاختبار.
    if (connection.name !== E2E_DB) {
      throw new Error(`قاعدة غير متوقعة: ${connection.name}`);
    }
  });

  afterAll(async () => {
    if (connection?.name === E2E_DB) {
      await connection.dropDatabase();
    }
    await app?.close();
  });

  // ───────────── المصادقة ─────────────

  it('يرفض أي طلب بلا توكن (401)', async () => {
    await api().get('/api/users').expect(401);
    await api().post('/api/attendance/check-in').expect(401);
  });

  it('يرفض كلمة مرور خاطئة برسالة لا تكشف أيّ الحقلين خطأ', async () => {
    const wrongPassword = await api()
      .post('/api/auth/login')
      .send({ username: ADMIN.username, password: 'wrong-password' })
      .expect(401);
    const wrongUsername = await api()
      .post('/api/auth/login')
      .send({ username: 'nobody', password: 'wrong-password' })
      .expect(401);
    expect(wrongPassword.body.message).toBe(wrongUsername.body.message);
  });

  it('المدير الأول أُنشئ تلقائيًا ويسجّل دخوله', async () => {
    const res = await api().post('/api/auth/login').send(ADMIN).expect(200);
    expect(res.body.user.role).toBe('admin');
    adminToken = res.body.accessToken;
  });

  // ───────────── إدارة الموظفين ─────────────

  it('المدير ينشئ موظفًا، والرد لا يحتوي الهاش', async () => {
    const res = await api()
      .post('/api/users')
      .set(bearer(adminToken))
      .send(EMPLOYEE)
      .expect(201);
    expect(res.body.role).toBe('employee');
    expect(res.body.passwordHash).toBeUndefined();
    employeeId = res.body._id;
  });

  it('يرفض اسم مستخدم مكرّرًا (409)', async () => {
    await api()
      .post('/api/users')
      .set(bearer(adminToken))
      .send(EMPLOYEE)
      .expect(409);
  });

  it('يرفض محاولة إنشاء مدير عبر حقل role (400)', async () => {
    await api()
      .post('/api/users')
      .set(bearer(adminToken))
      .send({ ...EMPLOYEE, username: 'hacker', role: 'admin' })
      .expect(400);
  });

  it('قائمة المستخدمين لا تُرجع الهاش', async () => {
    const res = await api()
      .get('/api/users')
      .set(bearer(adminToken))
      .expect(200);
    expect(res.body).toHaveLength(2);
    for (const user of res.body) {
      expect(user.passwordHash).toBeUndefined();
    }
  });

  it('الموظف يسجّل دخوله ولا يصل إلى مسارات الإدارة (403)', async () => {
    const res = await api()
      .post('/api/auth/login')
      .send({ username: EMPLOYEE.username, password: EMPLOYEE.password })
      .expect(200);
    employeeToken = res.body.accessToken;

    await api().get('/api/users').set(bearer(employeeToken)).expect(403);
    await api().get('/api/attendance').set(bearer(employeeToken)).expect(403);
    await api()
      .get('/api/attendance/daily')
      .set(bearer(employeeToken))
      .expect(403);
  });

  // ───────────── الحضور والانصراف ─────────────

  it('قبل الحضور: لا سجل لليوم، والانصراف مرفوض (400)', async () => {
    const today = await api()
      .get('/api/attendance/today')
      .set(bearer(employeeToken))
      .expect(200);
    expect(today.body.attendance).toBeNull();

    await api()
      .post('/api/attendance/check-out')
      .set(bearer(employeeToken))
      .expect(400);
  });

  it('يسجّل الحضور، ويتجاهل أي وقت يرسله العميل', async () => {
    // forbidNonWhitelisted لا يعمل هنا لأن المسار بلا @Body أصلًا:
    // الجسم لا يُقرأ، فلا أثر لما يرسله العميل.
    const before = Date.now();
    const res = await api()
      .post('/api/attendance/check-in')
      .set(bearer(employeeToken))
      .send({ checkIn: '2020-01-01T00:00:00Z' })
      .expect(201);

    expect(new Date(res.body.checkIn).getTime()).toBeGreaterThanOrEqual(
      before - 1000,
    );
    expect(res.body.checkOut).toBeNull();
    attendanceId = res.body._id;
  });

  it('يرفض حضورًا ثانيًا في اليوم نفسه (409)', async () => {
    await api()
      .post('/api/attendance/check-in')
      .set(bearer(employeeToken))
      .expect(409);
  });

  it('ضغطتان متزامنتان على الانصراف: تنجح واحدة فقط', async () => {
    const results = await Promise.all([
      api().post('/api/attendance/check-out').set(bearer(employeeToken)),
      api().post('/api/attendance/check-out').set(bearer(employeeToken)),
    ]);
    const statuses = results.map((res) => res.status).sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('الموظف يرى سجله فقط حتى لو طلب سجل غيره', async () => {
    const res = await api()
      .get('/api/attendance/me')
      .query({ employee: '507f1f77bcf86cd799439011' })
      .set(bearer(employeeToken))
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0]._id).toBe(attendanceId);
  });

  // ───────────── كشوف الإدارة ─────────────

  it('الكشف اليومي يُظهر الموظف مع سجله', async () => {
    const res = await api()
      .get('/api/attendance/daily')
      .set(bearer(adminToken))
      .expect(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].employee.username).toBe(EMPLOYEE.username);
    expect(res.body.rows[0].attendance.checkOut).not.toBeNull();
  });

  it('الكشف اليومي يُظهر الغائب بلا سجل', async () => {
    const res = await api()
      .get('/api/attendance/daily')
      .query({ date: '2020-01-01' })
      .set(bearer(adminToken))
      .expect(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].attendance).toBeNull();
  });

  it('قائمة السجلات تُرجع اسم الموظف وتحترم فلتر التاريخ', async () => {
    const all = await api()
      .get('/api/attendance')
      .set(bearer(adminToken))
      .expect(200);
    expect(all.body.total).toBe(1);
    expect(all.body.items[0].employee.name).toBe(EMPLOYEE.name);

    const old = await api()
      .get('/api/attendance')
      .query({ from: '2020-01-01', to: '2020-12-31' })
      .set(bearer(adminToken))
      .expect(200);
    expect(old.body.total).toBe(0);

    await api()
      .get('/api/attendance')
      .query({ from: 'not-a-date' })
      .set(bearer(adminToken))
      .expect(400);
  });

  it('يرفض "إلى" بلا "من"، و"إلى" قبل "من" (400)', async () => {
    await api()
      .get('/api/attendance')
      .query({ to: '2020-12-31' })
      .set(bearer(adminToken))
      .expect(400);
    await api()
      .get('/api/attendance/me')
      .query({ to: '2020-12-31' })
      .set(bearer(employeeToken))
      .expect(400);
    await api()
      .get('/api/attendance')
      .query({ from: '2020-12-31', to: '2020-01-01' })
      .set(bearer(adminToken))
      .expect(400);
  });

  it('عرض الكل يُرجع بطاقة عدّادات لكل موظف، وعرض موظف واحد لا يُرجعها', async () => {
    const all = await api()
      .get('/api/attendance')
      .set(bearer(adminToken))
      .expect(200);
    expect(all.body.employees).toHaveLength(1);
    expect(all.body.employees[0].employee.username).toBe(EMPLOYEE.username);
    expect(all.body.employees[0].records).toBe(1);
    expect(all.body.workedMs).toBe(all.body.employees[0].workedMs);

    // فترة بلا سجلات: البطاقة تبقى ظاهرة بعدّاد صفر
    const empty = await api()
      .get('/api/attendance')
      .query({ from: '2020-01-01' })
      .set(bearer(adminToken))
      .expect(200);
    expect(empty.body.employees[0]).toMatchObject({ records: 0, workedMs: 0 });

    const one = await api()
      .get('/api/attendance')
      .query({ employee: employeeId })
      .set(bearer(adminToken))
      .expect(200);
    expect(one.body.total).toBe(1);
    expect(one.body.employees).toBeUndefined();

    const mine = await api()
      .get('/api/attendance/me')
      .set(bearer(employeeToken))
      .expect(200);
    expect(mine.body.employees).toBeUndefined();
    expect(mine.body.workedMs).toBe(all.body.workedMs);
  });

  // ───────────── التصحيح اليدوي ─────────────

  it('المدير يعيد فتح السجل، والتعديل يُختم باسمه', async () => {
    const res = await api()
      .patch(`/api/attendance/${attendanceId}`)
      .set(bearer(adminToken))
      .send({ checkOut: null })
      .expect(200);
    expect(res.body.checkOut).toBeNull();
    expect(res.body.editedBy).toBeTruthy();
    expect(res.body.editedAt).toBeTruthy();
  });

  it('يرفض انصرافًا قبل الحضور، ووقتًا في المستقبل (400)', async () => {
    await api()
      .patch(`/api/attendance/${attendanceId}`)
      .set(bearer(adminToken))
      .send({ checkOut: '2020-01-01T10:00:00Z' })
      .expect(400);

    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    await api()
      .patch(`/api/attendance/${attendanceId}`)
      .set(bearer(adminToken))
      .send({ checkOut: tomorrow })
      .expect(400);
  });

  it('المدير يضيف سجلًّا ليوم نسيه الموظف، ولا يكرّره', async () => {
    const body = {
      employee: employeeId,
      checkIn: '2026-01-05T08:00:00+03:00',
      checkOut: '2026-01-05T16:00:00+03:00',
    };
    const res = await api()
      .post('/api/attendance')
      .set(bearer(adminToken))
      .send(body)
      .expect(201);
    expect(res.body.workDate).toBe('2026-01-05');

    await api()
      .post('/api/attendance')
      .set(bearer(adminToken))
      .send(body)
      .expect(409);
  });

  it('"من" وحده = ذلك اليوم فقط، ومجموع الساعات يُحسب', async () => {
    const day = await api()
      .get('/api/attendance/me')
      .query({ from: '2026-01-05' })
      .set(bearer(employeeToken))
      .expect(200);
    expect(day.body.total).toBe(1);
    expect(day.body.items[0].workDate).toBe('2026-01-05');
    expect(day.body.workedMs).toBe(8 * 3_600_000);

    // مع "إلى" تصير فترة تشمل سجل اليوم أيضًا
    const range = await api()
      .get('/api/attendance/me')
      .query({ from: '2026-01-05', to: '2099-12-31' })
      .set(bearer(employeeToken))
      .expect(200);
    expect(range.body.total).toBe(2);
  });

  it('سجل مفتوح من يوم مضى يُغلق تلقائيًا عند أول استعلام', async () => {
    // نزرعه مباشرة في القاعدة: الـ API لا يسمح بترك سجل قديم مفتوحًا إلا هكذا.
    const checkIn = new Date('2026-01-06T05:00:00Z');
    await connection.collection('attendances').insertOne({
      employee: new Types.ObjectId(employeeId),
      workDate: '2026-01-06',
      checkIn,
      checkOut: null,
    });

    const res = await api()
      .get('/api/attendance/me')
      .query({ from: '2026-01-06' })
      .set(bearer(employeeToken))
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(new Date(res.body.items[0].checkOut).getTime()).toBe(
      checkIn.getTime() + 1000,
    );
  });

  it('معرّف غير صالح يُرجع 400 لا 500', async () => {
    await api()
      .patch('/api/attendance/not-an-id')
      .set(bearer(adminToken))
      .send({ checkOut: null })
      .expect(400);
  });

  // ───────────── تعطيل الحساب ─────────────

  it('المدير لا يستطيع تعطيل حسابه', async () => {
    const me = await api()
      .get('/api/auth/me')
      .set(bearer(adminToken))
      .expect(200);
    await api()
      .patch(`/api/users/${me.body.id}`)
      .set(bearer(adminToken))
      .send({ isActive: false })
      .expect(400);
  });

  it('تعطيل الموظف يوقف توكنه الحالي فورًا ويمنع دخوله', async () => {
    await api()
      .patch(`/api/users/${employeeId}`)
      .set(bearer(adminToken))
      .send({ isActive: false })
      .expect(200);

    // التوكن نفسه الذي كان يعمل قبل لحظة
    await api()
      .get('/api/attendance/today')
      .set(bearer(employeeToken))
      .expect(401);

    await api()
      .post('/api/auth/login')
      .send({ username: EMPLOYEE.username, password: EMPLOYEE.password })
      .expect(403);
  });

  it('إعادة تعيين كلمة المرور تعمل، والقديمة تتوقف', async () => {
    await api()
      .patch(`/api/users/${employeeId}`)
      .set(bearer(adminToken))
      .send({ isActive: true, password: 'new-password-1' })
      .expect(200);

    await api()
      .post('/api/auth/login')
      .send({ username: EMPLOYEE.username, password: EMPLOYEE.password })
      .expect(401);
    await api()
      .post('/api/auth/login')
      .send({ username: EMPLOYEE.username, password: 'new-password-1' })
      .expect(200);
  });
});
