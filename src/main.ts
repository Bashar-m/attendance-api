import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { setupApp } from './app.setup.js';

// نقطة البداية: أنشئ التطبيق، اضبطه، ثم استمع على المنفذ.
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  setupApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
