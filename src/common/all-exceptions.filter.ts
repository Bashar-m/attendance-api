import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';

/**
 * فلتر عام يلتقط كل خطأ يخرج من أي مسار ويسجّله، ثم يترك
 * BaseExceptionFilter يبني الرد كالمعتاد. أعطال الخادم (5xx) تُطبع مع
 * الـ stack trace، وأخطاء الطلبات (4xx) سطر تحذير قصير.
 *
 * لماذا نرث من BaseExceptionFilter بدل كتابة الرد بأنفسنا؟
 * لأن شكل الرد (statusCode, message, ...) يبقى كما هو تمامًا،
 * فلا تتغير الواجهة ولا الاختبارات، ونحن فقط نضيف التسجيل.
 */
@Catch()
export class AllExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger('Exception');

  override catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<Request | undefined>();
    const where = request ? `${request.method} ${request.url}` : 'unknown';

    if (exception instanceof HttpException && exception.getStatus() < 500) {
      // أخطاء الطرف الآخر (توكن منتهٍ، مدخلات خاطئة، تكرار...) متوقَّعة وليست
      // أعطالًا في الخادم: سطر تحذير بلا stack، فلا تختلط بالأعطال الحقيقية.
      this.logger.warn(
        `${where} → ${exception.getStatus()} ${exception.message}`,
      );
    } else if (exception instanceof Error) {
      this.logger.error(`${where} → ${exception.message}`, exception.stack);
    } else {
      // قد يُرمى شيء ليس Error (نص أو كائن)، فلا stack له.
      this.logger.error(`${where} → ${String(exception)}`);
    }

    super.catch(exception, host);
  }
}
