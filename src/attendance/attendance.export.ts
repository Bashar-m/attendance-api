import ExcelJS from 'exceljs';
import type { Attendance } from './schema/attendance.schema.js';

export const XLSX_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type ExportInput = {
  employee: { name: string; username: string };
  from: string;
  to: string;
  records: Attendance[]; // بلا أيام العطلة: الخدمة تستثنيها قبل الاستدعاء
  weekendDays: number[];
  timeZone: string;
};

// بترقيم JavaScript: 0 = الأحد ... 6 = السبت
const WEEKDAY_NAMES = [
  'الأحد',
  'الاثنين',
  'الثلاثاء',
  'الأربعاء',
  'الخميس',
  'الجمعة',
  'السبت',
];

const COLUMNS = [
  { header: 'التاريخ', width: 13 },
  { header: 'اليوم', width: 12 },
  { header: 'الحضور', width: 10 },
  { header: 'الانصراف', width: 10 },
  { header: 'المدة (ساعات:دقائق)', width: 20 },
  { header: 'الساعات (عشري)', width: 16 },
  { header: 'ملاحظات', width: 40 },
  { header: 'معدَّل من الإدارة', width: 17 },
];

// الصفوف 1-3 عنوان الملف، والصف 5 رؤوس الأعمدة، والسجلات تبدأ بعده.
const HEADER_ROW = 5;
const HOUR_MS = 3_600_000;

/**
 * مدة بالميلي ثانية => "57:46" (ساعات:دقائق، والدقائق تُقطع كما في الواجهة).
 *
 * لماذا نص لا رقم بتنسيق [h]:mm؟ لأن Numbers و Google Sheets لا يعرضان
 * ذلك التنسيق كما يعرضه Excel: مجموع 57:46 ظهر في Numbers "2:9:46"
 * (يومان و9 ساعات). النص يظهر كما هو في كل البرامج، والجمع الحسابي
 * يبقى ممكنًا في عمود "الساعات (عشري)" المجاور.
 */
function formatHours(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;
}

const weekdayFormat = new Intl.DateTimeFormat('ar-SY', {
  weekday: 'long',
  timeZone: 'UTC',
});

/**
 * Excel يخزّن الوقت كسرًا من اليوم (0.5 = 12:00) ولا يعرف المناطق الزمنية.
 * لذلك نحوّل اللحظة (UTC في القاعدة) إلى ساعة الحائط بتوقيت الشركة أولًا،
 * وإلا ظهر وقت الحضور في الملف متأخرًا ثلاث ساعات.
 */
function toExcelTime(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? 0);
  return (pick('hour') * 3600 + pick('minute') * 60 + pick('second')) / 86_400;
}

/**
 * ملف Excel لموظف واحد في فترة: سطر لكل يوم له سجل، وفي آخره المجموع.
 *
 * التواريخ والأوقات والساعات العشرية أرقام حقيقية، فيستطيع من يفتح الملف
 * أن يرتّب ويجمع بنفسه. ومجموع الساعات العشرية معادلة SUM لا رقم ثابت،
 * فلو صحّح أحدهم ساعات يومٍ داخل الملف تحدّث المجموع وحده.
 */
export async function buildAttendanceWorkbook({
  employee,
  from,
  to,
  records,
  weekendDays,
  timeZone,
}: ExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'نظام الحضور';
  const sheet = workbook.addWorksheet('الحضور', {
    // من اليمين إلى اليسار، ورؤوس الأعمدة ثابتة أثناء التمرير
    views: [{ rightToLeft: true, state: 'frozen', ySplit: HEADER_ROW }],
  });
  sheet.columns = COLUMNS.map(({ width }) => ({ width }));

  sheet.getCell('A1').value = `سجل حضور: ${employee.name}`;
  sheet.getCell('A1').font = { bold: true, size: 14 };
  sheet.getCell('A2').value = `اسم المستخدم: ${employee.username}`;
  sheet.getCell('A3').value = `الفترة: من ${from} إلى ${to}`;
  if (weekendDays.length) {
    const names = weekendDays.map((day) => WEEKDAY_NAMES[day]).join('، ');
    sheet.getCell('A4').value = `أيام العطلة (غير محسوبة): ${names}`;
  }

  const header = sheet.getRow(HEADER_ROW);
  header.values = COLUMNS.map((column) => column.header);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EAEE' } };
    cell.border = { bottom: { style: 'thin' } };
  });
  

  let totalMs = 0;
  for (const record of records) {
    // سجل اليوم المفتوح: لا مدة له بعد ولا يدخل المجموع
    const ms = record.checkOut
      ? record.checkOut.getTime() - record.checkIn.getTime()
      : null;
    totalMs += ms ?? 0;

    const day = new Date(`${record.workDate}T00:00:00Z`);
    const row = sheet.addRow([
      day,
      weekdayFormat.format(day),
      toExcelTime(record.checkIn, timeZone),
      record.checkOut ? toExcelTime(record.checkOut, timeZone) : null,
      ms === null ? '' : formatHours(ms),
      ms === null ? null : ms / HOUR_MS,
      record.note ?? '',
      record.editedAt ? 'نعم' : '',
    ]);
    row.getCell(1).numFmt = 'yyyy-mm-dd';
    row.getCell(3).numFmt = 'hh:mm';
    row.getCell(4).numFmt = 'hh:mm';
    row.getCell(5).alignment = { horizontal: 'center' };
    row.getCell(6).numFmt = '0.00';
    row.getCell(7).alignment = { wrapText: true, vertical: 'top' };
  }

  if (records.length === 0) {
    sheet.addRow(['لا توجد سجلات في هذه الفترة']);
  }

  const first = HEADER_ROW + 1;
  const last = HEADER_ROW + records.length;
  const total = sheet.addRow([
    'المجموع',
    `عدد الأيام: ${records.length}`,
    null,
    null,
    formatHours(totalMs),
    records.length
      ? { formula: `SUM(F${first}:F${last})`, result: totalMs / HOUR_MS }
      : 0,
  ]);
  total.font = { bold: true };
  total.getCell(5).alignment = { horizontal: 'center' };
  total.getCell(6).numFmt = '0.00';
  total.eachCell((cell) => {
    cell.border = { top: { style: 'thin' } };
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
