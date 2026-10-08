/**
 * "يوم العمل": التاريخ كما يراه الموظف على ساعة الحائط، بصيغة YYYY-MM-DD.
 *
 * لماذا لا نأخذ التاريخ من الوقت مباشرة؟
 * MongoDB يخزّن الوقت بتوقيت UTC. موظف يسجّل حضوره الساعة 01:30 فجرًا
 * بتوقيت دمشق (UTC+3) يكون وقته في القاعدة 22:30 من اليوم السابق.
 * لو قصصنا التاريخ من قيمة UTC لسُجّل حضوره في اليوم الخطأ.
 *
 * لذلك نحسب اليوم مرة واحدة هنا، بمنطقة زمنية صريحة، ونخزّنه نصًّا.
 * والنتيجة لا تتأثر بتوقيت الخادم نفسه: سواء كان في دمشق أو في أوروبا.
 *
 * Intl مبني في Node ولا يحتاج أي مكتبة تواريخ.
 */
export function toWorkDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const pick = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '';

  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

/**
 * ميزة جانبية لهذه الصيغة: الترتيب الأبجدي = الترتيب الزمني،
 * فالمقارنة النصية "2026-10-01" <= workDate <= "2026-10-31" تعمل كفلتر تاريخ.
 */
export const WORK_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
