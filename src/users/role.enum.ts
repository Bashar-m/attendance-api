/**
 * الأدوار في مكان واحد بدل كتابة النص 'admin' في عشرة ملفات.
 * خطأ إملائي في نص عادي يمرّ بصمت، أما Role.Admn فيرفضه TypeScript فورًا.
 */
export enum Role {
  Admin = 'admin',
  Employee = 'employee',
}
