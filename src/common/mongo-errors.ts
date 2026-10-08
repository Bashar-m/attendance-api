/**
 * MongoDB يرمي خطأ برمز 11000 حين نحاول إدخال قيمة مكرّرة في فهرس فريد (unique).
 *
 * لماذا نعتمد على هذا الخطأ بدل أن نفحص "هل القيمة موجودة؟" قبل الإدخال؟
 * لأن الفحص ثم الإدخال خطوتان، وبينهما قد يدخل طلب آخر بالقيمة نفسها
 * (race condition). الفهرس الفريد يحسمها داخل القاعدة في خطوة واحدة،
 * ونحن فقط نترجم الخطأ إلى رسالة مفهومة.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: number }).code === 11000
  );
}
