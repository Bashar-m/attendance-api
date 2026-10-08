import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // الاتصال بقاعدة بعيدة (Atlas) أبطأ من المهلة الافتراضية (5 ثوانٍ).
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // اختبار e2e يكتب في قاعدة حقيقية، فنوجّهه إلى قاعدة مستقلة.
    // هذه القيم تُضبط قبل تحميل أي ملف، وتغلب ما في .env.
    // رابط الخادم (MONGODB_URL) يبقى من .env؛ نغيّر اسم القاعدة فقط.
    env: {
      MONGODB_DB: 'attendance_e2e',
      ADMIN_USERNAME: 'e2e-admin',
      ADMIN_PASSWORD: 'e2e-admin-password',
      JWT_SECRET: 'e2e-secret-not-used-anywhere-else',
      APP_TIMEZONE: 'Asia/Damascus',
    },
  },
});
