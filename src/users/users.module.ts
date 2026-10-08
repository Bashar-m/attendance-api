import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminSeeder } from './admin.seeder.js';
import { User, UserSchema } from './schema/user.schema.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    // يسجّل موديل User داخل هذا الموديول ليصبح قابلًا للحقن بـ @InjectModel
    MongooseModule.forFeature([{ name: User.name, schema: UserSchema }]),
  ],
  controllers: [UsersController],
  providers: [UsersService, AdminSeeder],
  // ما في providers خاص بالموديول. exports يجعله متاحًا لمن يستورد UsersModule
  // (auth يحتاجه لتسجيل الدخول، و attendance لقائمة الموظفين).
  exports: [UsersService],
})
export class UsersModule {}
