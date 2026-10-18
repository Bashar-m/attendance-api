import { ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'node:path';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';

/**
 * إعدادات التطبيق في دالة واحدة يستدعيها طرفان:
 *   - main.ts عند التشغيل الفعلي
 *   - test/app.e2e-spec.ts عند الاختبار
 *
 * لو كُتبت داخل main.ts فقط لاختبرنا تطبيقًا يختلف عن الذي نشغّله
 * (بلا تحقق من المدخلات مثلًا)، ولنجحت الاختبارات والنظام معطوب.
 */
export function setupApp(app: NestExpressApplication): void {
  // helmet يضيف ترويسات أمان قياسية للردود. من أهمها Content-Security-Policy:
  // المتصفح لا ينفّذ إلا سكربتات من موقعنا نفسه، وهذا يقطع الطريق على
  // معظم هجمات XSS. (ولهذا لا يوجد أي سكربت مكتوب داخل ملف HTML في الواجهة.)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // helmet يضيف upgrade-insecure-requests افتراضيًّا: المتصفح يطلب
          // app.js و style.css وطلبات الـ API بـ https حتى لو فُتحت الصفحة بـ http.
          // على localhost يُستثنى، لكن على عنوان الشبكة (http://192.168.x.x:3000)
          // تفشل كلها فتظهر الصفحة بلا تنسيق ولا تعمل. روابطنا كلها نسبية
          // فتتبع بروتوكول الصفحة أصلًا، ولا نخسر شيئًا بإلغائه.
          upgradeInsecureRequests: null,
        },
      },
    }),
  );

  // كل مسارات الـ API تبدأ بـ /api، والجذر / يبقى لملفات الواجهة.
  app.setGlobalPrefix('api');

  // الواجهة (مجلد public) تُخدَّم من الخادم نفسه.
  // فائدة ذلك: الواجهة والـ API على العنوان نفسه، فلا نحتاج CORS إطلاقًا.
  // process.cwd() = المجلد الذي شُغّل منه الأمر، أي جذر المشروع.
  app.useStaticAssets(join(process.cwd(), 'public'));

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // احذف أي حقل غير معرَّف في الـ DTO
      forbidNonWhitelisted: true, // بل ارفض الطلب كله إن وُجد حقل غريب
      transform: true, // حوّل الجسم إلى كائن من صنف الـ DTO
    }),
  );

  // اطبع كل خطأ (رسالته + الـ stack trace) في السجل، دون تغيير شكل الرد.
  app.useGlobalFilters(new AllExceptionsFilter(app.getHttpAdapter()));
}
