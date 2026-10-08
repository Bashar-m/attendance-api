import { toWorkDate } from './work-date.js';

// نختبر هنا المنطق الوحيد في المشروع الذي يسهل أن يخطئ بصمت: حدود اليوم.
// لا نختبر الـ Controllers ولا Mongoose؛ تلك يغطّيها اختبار e2e.
describe('toWorkDate', () => {
  const damascus = 'Asia/Damascus'; // UTC+3 طوال السنة

  it('يُرجع التاريخ المحلي لا تاريخ UTC', () => {
    // 22:30 UTC يوم 6 = 01:30 فجر يوم 7 في دمشق
    const date = new Date('2026-10-06T22:30:00Z');
    expect(toWorkDate(date, damascus)).toBe('2026-10-07');
  });

  it('قبل منتصف الليل المحلي بدقيقة ما زال اليوم نفسه', () => {
    // 20:59 UTC = 23:59 دمشق
    const date = new Date('2026-10-06T20:59:00Z');
    expect(toWorkDate(date, damascus)).toBe('2026-10-06');
  });

  it('عند منتصف الليل المحلي يبدأ اليوم التالي', () => {
    // 21:00 UTC = 00:00 دمشق
    const date = new Date('2026-10-06T21:00:00Z');
    expect(toWorkDate(date, damascus)).toBe('2026-10-07');
  });

  it('يتبع المنطقة الزمنية المطلوبة لا توقيت الخادم', () => {
    const date = new Date('2026-10-06T22:30:00Z');
    expect(toWorkDate(date, 'UTC')).toBe('2026-10-06');
  });

  it('يحشو الشهر واليوم بصفر ليبقى الترتيب النصي صحيحًا', () => {
    const date = new Date('2026-01-05T09:00:00Z');
    expect(toWorkDate(date, damascus)).toBe('2026-01-05');
  });
});
